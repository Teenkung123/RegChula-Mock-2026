import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const serviceContainers = ["regchula-mysql", "regchula-redis"] as const
const wait = (milliseconds: number) =>
  new Promise<void>((resolveWait) => {
    setTimeout(resolveWait, milliseconds)
  })

async function inspectServiceHealth(container: string): Promise<string> {
  const child = Bun.spawn(["docker", "inspect", "--format={{.State.Health.Status}}", container], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = new Response(child.stdout).text()
  const exitCode = await child.exited
  return exitCode === 0 ? (await output).trim() : ""
}

async function ensureServices() {
  console.log("[dev] Starting MySQL and Redis...")
  const child = Bun.spawn(
    [
      "docker",
      "compose",
      "-f",
      resolve(root, "compose.yml"),
      "--project-directory",
      root,
      "up",
      "-d",
      "mysql",
      "redis",
    ],
    {
      cwd: root,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  )
  if ((await child.exited) !== 0) {
    throw new Error(
      "Could not start MySQL. Start Docker Desktop, then run start.bat or bun run dev.",
    )
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const states = await Promise.all(serviceContainers.map(inspectServiceHealth))
    if (states.every((state) => state === "healthy")) return
    await wait(2_000)
  }
  throw new Error("MySQL and Redis did not become healthy within 120 seconds.")
}

async function isRegChulaApiReady() {
  try {
    const response = await fetch("http://127.0.0.1:3000/api/v1/health/live", {
      signal: AbortSignal.timeout(2_000),
    })
    if (!response.ok) return false
    const body = (await response.json()) as { data?: { status?: string } }
    return body.data?.status === "ok"
  } catch {
    return false
  }
}

async function isRegChulaWebReady() {
  try {
    const response = await fetch("http://127.0.0.1:5173", {
      signal: AbortSignal.timeout(2_000),
    })
    return response.ok && (await response.text()).includes("<title>RegChula Mock</title>")
  } catch {
    return false
  }
}

async function monitorExistingServices() {
  console.log("[dev] Monitoring the existing services. Press Ctrl+C to stop this launcher.")
  while (true) {
    await wait(5_000)
    const [apiReady, webReady] = await Promise.all([isRegChulaApiReady(), isRegChulaWebReady()])
    if (!apiReady || !webReady) {
      const stopped = [apiReady ? undefined : "API", webReady ? undefined : "web app"]
        .filter(Boolean)
        .join(" and ")
      throw new Error(`The reused RegChula ${stopped} stopped responding. Run start.bat again.`)
    }
  }
}

async function main() {
  await ensureServices()
  const [apiReady, webReady] = await Promise.all([isRegChulaApiReady(), isRegChulaWebReady()])
  const scripts = [apiReady ? undefined : "dev:api", webReady ? undefined : "dev:web"].filter(
    (script): script is string => Boolean(script),
  )
  if (apiReady) console.log("[dev] Reusing the healthy RegChula API on port 3000.")
  if (webReady) console.log("[dev] Reusing the healthy RegChula web app on port 5173.")
  if (scripts.length === 0) {
    console.log("[dev] RegChula is already running at http://localhost:5173")
    await monitorExistingServices()
    return
  }

  console.log(`[dev] MySQL and Redis are ready. Starting ${scripts.join(" and ")}...`)
  const runArguments =
    scripts.length === 1
      ? [process.execPath, "run", scripts[0] as string]
      : [process.execPath, "run", "--parallel", ...scripts]
  const dev = Bun.spawn(runArguments, {
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  process.exit(await dev.exited)
}

void main().catch((error) => {
  console.error("[dev] " + (error instanceof Error ? error.message : "Unknown startup error"))
  process.exit(1)
})
