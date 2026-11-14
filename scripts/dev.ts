import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const apiPort = process.env.API_PORT ?? "3000"
const webPort = process.env.REGCHULA_WEB_PORT ?? "5173"
const staffPort = process.env.REGCHULA_STAFF_PORT ?? "5174"
const wait = (milliseconds: number) =>
  new Promise<void>((resolveWait) => {
    setTimeout(resolveWait, milliseconds)
  })

async function run(args: string[], error: string) {
  const child = Bun.spawn(args, {
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  if ((await child.exited) !== 0) throw new Error(error)
}

async function prepareLocalStack() {
  if (process.env.APP_ENV && process.env.APP_ENV !== "development") {
    throw new Error("The development launcher requires APP_ENV=development.")
  }
  for (const [name, protocol, port] of [
    ["DATABASE_URL", "mysql:", process.env.REGCHULA_MYSQL_PORT ?? "3307"],
    ["REDIS_URL", "redis:", process.env.REGCHULA_REDIS_PORT ?? "6380"],
  ] as const) {
    const value = process.env[name]
    if (value === undefined) continue
    const url = URL.parse(value)
    if (
      !url ||
      url.protocol !== protocol ||
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.port !== port
    ) {
      throw new Error(`${name} must point to the local Compose service on port ${port}.`)
    }
  }

  const runScript = (name: string) =>
    run([process.execPath, "run", name], `Startup step '${name}' failed.`)
  await runScript("setup:env")
  console.log("[dev] Starting MySQL and Redis...")
  await run(
    [
      "docker",
      "compose",
      "-f",
      resolve(root, "compose.yml"),
      "--project-directory",
      root,
      "up",
      "--wait",
      "--wait-timeout",
      "120",
      "mysql",
      "redis",
    ],
    "Could not start MySQL and Redis. Check that Docker and Docker Compose are running and that the host ports are free.",
  )
  await runScript("db:migrate")
  await runScript("auth:cleanup")
  await runScript("catalog:import")
}

async function isRegChulaApiReady() {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/v1/health/live`, {
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
    const response = await fetch(`http://127.0.0.1:${webPort}`, {
      signal: AbortSignal.timeout(2_000),
    })
    return response.ok && (await response.text()).includes("<title>RegChula</title>")
  } catch {
    return false
  }
}

async function isRegChulaStaffReady() {
  try {
    const response = await fetch(`http://127.0.0.1:${staffPort}`, {
      signal: AbortSignal.timeout(2_000),
    })
    return response.ok && (await response.text()).includes("<title>RegChula · Staff</title>")
  } catch {
    return false
  }
}

async function monitorExistingServices() {
  console.log("[dev] Monitoring the existing services. Press Ctrl+C to stop this launcher.")
  while (true) {
    await wait(5_000)
    const [apiReady, webReady, staffReady] = await Promise.all([
      isRegChulaApiReady(),
      isRegChulaWebReady(),
      isRegChulaStaffReady(),
    ])
    if (!apiReady || !webReady || !staffReady) {
      const stopped = [
        apiReady ? undefined : "API",
        webReady ? undefined : "web app",
        staffReady ? undefined : "staff app",
      ]
        .filter(Boolean)
        .join(" and ")
      throw new Error(`The reused RegChula ${stopped} stopped responding. Run bun run dev again.`)
    }
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log("Use Bun 1.3.14, Node.js 20.19+ (20.x) or 22.12+, and Docker Compose.")
    console.log("Run bun install --frozen-lockfile, then bun run dev from the checkout.")
    console.log("Student web http://localhost:5173  Staff web http://localhost:5174")
    console.log("Run bun run staff:bootstrap --stdin to create the first administrator.")
    return
  }
  await prepareLocalStack()
  const [apiReady, webReady, staffReady] = await Promise.all([
    isRegChulaApiReady(),
    isRegChulaWebReady(),
    isRegChulaStaffReady(),
  ])
  const scripts = [
    apiReady ? undefined : "dev:api",
    webReady ? undefined : "dev:web",
    staffReady ? undefined : "dev:staff",
  ].filter((script): script is string => Boolean(script))
  if (apiReady) console.log(`[dev] Reusing the healthy RegChula API on port ${apiPort}.`)
  if (webReady) console.log(`[dev] Reusing the healthy RegChula web app on port ${webPort}.`)
  if (staffReady) console.log(`[dev] Reusing the healthy RegChula staff app on port ${staffPort}.`)
  console.log(
    `[dev] Student web: http://localhost:${webPort}  Staff web: http://localhost:${staffPort}`,
  )
  if (scripts.length === 0) {
    await monitorExistingServices()
    return
  }

  console.log(`[dev] MySQL and Redis are ready. Starting ${scripts.join(" and ")}...`)
  const runArguments = [
    process.execPath,
    `--env-file=${resolve(root, ".env.local")}`,
    "run",
    ...(scripts.length === 1 ? [] : ["--parallel"]),
    ...scripts,
  ]
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
