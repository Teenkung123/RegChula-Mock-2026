import { app, runtimeAdmission } from "./app"
import { config } from "./config"
import { closeDatabase, waitForDatabase } from "./db/client"
import { closeSharedState, waitForSharedState } from "./shared/redis"

interface ShutdownDependencies {
  beginDrain: () => void
  stop: (force: boolean) => Promise<void> | void
  closeDatabase: () => Promise<void>
  graceMs: number
}

const withTimeout = async <T>(
  promise: Promise<T>,
  milliseconds: number,
): Promise<T | "timeout"> => {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<"timeout">((resolve) => {
        timeout = setTimeout(() => resolve("timeout"), milliseconds)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function stopRuntime(dependencies: ShutdownDependencies): Promise<boolean> {
  dependencies.beginDrain()
  let forced = false
  try {
    const gracefulStop = Promise.resolve(dependencies.stop(false)).then(
      () => ({ status: "stopped" as const }),
      (error: unknown) => ({ status: "failed" as const, error }),
    )
    const outcome = await withTimeout(gracefulStop, dependencies.graceMs)
    forced = outcome === "timeout" || outcome.status === "failed"
    if (forced) await dependencies.stop(true)
    if (outcome !== "timeout" && outcome.status === "failed") throw outcome.error
    return forced
  } finally {
    await dependencies.closeDatabase()
  }
}

async function start() {
  console.log("[api] Waiting for MySQL and Redis...")
  await Promise.all([waitForDatabase(), waitForSharedState()])
  app.listen({
    hostname: config.apiHost,
    port: config.port,
    maxRequestBodySize: config.apiMaxRequestBodyBytes,
  })
  console.log(`[api] RegChula listening on http://${config.apiHost}:${config.port}`)
}

if (import.meta.main) {
  let shutdownPromise: Promise<void> | null = null
  const shutdown = (signal: NodeJS.Signals) => {
    if (shutdownPromise) return
    console.log(`[api] ${signal} received; draining requests...`)
    shutdownPromise = stopRuntime({
      beginDrain: () => runtimeAdmission.beginDrain(),
      stop: async (force) => {
        await app.stop(force)
      },
      closeDatabase: async () => {
        closeSharedState()
        await closeDatabase()
      },
      graceMs: config.apiShutdownGraceMs,
    })
      .then((forced) => {
        if (forced) console.warn("[api] Graceful shutdown timed out; active requests were closed")
      })
      .catch((error) => {
        console.error("[api] Shutdown failed", error)
        process.exitCode = 1
      })
  }

  process.once("SIGTERM", shutdown)
  process.once("SIGINT", shutdown)

  void start().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown database startup error"
    console.error("[api] " + message)
    closeSharedState()
    void closeDatabase().finally(() => process.exit(1))
  })
}
