/** Local, bounded catalog audit. Run from the repository root with Bun.
 * It creates and revokes one scoped mock session, performs no registration requests or migrations,
 * and never prints cookie or secret material.
 */
import { config } from "../apps/api/src/config"
import { pool } from "../apps/api/src/db/client"
import {
  currentTerm,
  searchCourses,
  type CourseSearch,
} from "../apps/api/src/modules/catalog/service"

const origin = "http://127.0.0.1:3000"
const database = new URL(config.databaseUrl)
if (
  config.appEnv !== "development" ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  database.port !== "3307"
) {
  throw new Error("Benchmark requires development mode and local MySQL port 3307")
}
let cookie = ""

async function loginForAudit(): Promise<void> {
  const challengeResponse = await fetch(origin + "/api/v1/auth/challenge")
  const challenge = (await challengeResponse.json()) as {
    data?: { code?: string; token?: string }
  }
  if (!challengeResponse.ok || !challenge.data?.code || !challenge.data.token) {
    throw new Error("Could not obtain a benchmark challenge")
  }
  const response = await fetch(origin + "/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: config.webOrigin },
    body: JSON.stringify({
      studentId: "catalog-readonly-audit",
      password: "local-benchmark-only",
      rememberMe: false,
      challengeCode: challenge.data.code,
      challengeToken: challenge.data.token,
    }),
  })
  const setCookie = response.headers.get("set-cookie") ?? ""
  const encodedToken = /regchula_session_v2=([^;,]+)/.exec(setCookie)?.[1]
  if (!response.ok || !encodedToken) throw new Error("Could not create a benchmark session")
  cookie = `regchula_session_v2=${encodedToken}`
}
const round = (n: number) => Number(n.toFixed(2))
function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  const percentile = (p: number) => round(sorted[Math.ceil(p * sorted.length) - 1] ?? 0)
  return {
    n: samples.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: round(Math.max(...samples)),
  }
}
async function get(path: string, authenticated = true) {
  const start = performance.now()
  const response = await fetch(origin + path, {
    headers: authenticated ? { cookie } : {},
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  })
  const body = await response.text()
  if (response.status !== (authenticated ? 200 : 401))
    throw new Error(`Unexpected HTTP ${response.status}`)
  return {
    ms: performance.now() - start,
    bytes: Buffer.byteLength(body),
    body: JSON.parse(body),
    refreshed: response.headers.has("set-cookie"),
  }
}
type Captured = { sql: string; params: unknown[]; ms: number }
let capture: Captured[] | null = null
const originalQuery = pool.query.bind(pool)
// Instrument only this benchmark process; the running API is untouched.
pool.query = (async (...args: unknown[]) => {
  const first = args[0] as string | { sql: string }
  const statement = typeof first === "string" ? first : first.sql
  if (!/^\s*select\b/i.test(statement)) throw new Error("Non-SELECT blocked by audit")
  const start = performance.now()
  const result = await Reflect.apply(originalQuery, pool, args)
  capture?.push({
    sql: statement,
    params: (args[1] ?? []) as unknown[],
    ms: performance.now() - start,
  })
  return result
}) as typeof pool.query

async function main() {
  const started = performance.now()
  await loginForAudit()
  const connection = await pool.getConnection()
  try {
    await connection.query("SET SESSION MAX_EXECUTION_TIME = 2000")
    await connection.query("START TRANSACTION READ ONLY")
    const [server] = await connection.query(
      "SELECT VERSION() AS version, @@max_connections AS maxConnections, @@innodb_buffer_pool_size AS bufferPoolBytes",
    )
    console.log(
      JSON.stringify({
        kind: "environment",
        timestamp: new Date().toISOString(),
        bun: Bun.version,
        server,
      }),
    )
    const term = await currentTerm()
    if (!term) throw new Error("No current term")
    const tables = [
      "course_offerings",
      "sections",
      "section_meetings",
      "course_reviews",
      "academic_terms",
    ]
    for (const table of tables) {
      const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM ${table}`)
      const [indexes] = await connection.query(`SHOW INDEX FROM ${table}`)
      const compact = (indexes as Record<string, unknown>[]).map((row) => ({
        key: row.Key_name,
        column: row.Column_name,
        sequence: row.Seq_in_index,
        cardinality: row.Cardinality,
      }))
      console.log(JSON.stringify({ kind: "table", table, rows, indexes: compact }))
    }
    const [terms] = await connection.query(
      "SELECT term_id, COUNT(*) AS total, SUM(active = 1) AS active FROM course_offerings GROUP BY term_id",
    )
    console.log(
      JSON.stringify({
        kind: "terms",
        current: { id: term.id, academicYear: term.academicYear, semester: term.semester },
        rows: terms,
      }),
    )
    const health = await fetch(origin + "/api/v1/health/ready", {
      signal: AbortSignal.timeout(5_000),
    })
    await health.arrayBuffer()
    const vite = await fetch("http://127.0.0.1:5173", { signal: AbortSignal.timeout(5_000) })
    await vite.arrayBuffer()
    console.log(
      JSON.stringify({
        kind: "health",
        api: health.status,
        vite: vite.status,
        unauthenticated: stats([(await get("/api/v1/courses", false)).ms]),
      }),
    )
    if (!health.ok || !vite.ok) throw new Error("Health check failed")
    const explicit = { academicYear: term.academicYear, semester: term.semester }
    const workloads: { name: string; input: CourseSearch }[] = [
      { name: "autocomplete-empty-6", input: { page: 1, pageSize: 6, mode: "autocomplete" } },
      {
        name: "autocomplete-code-21",
        input: { q: "21", page: 1, pageSize: 6, mode: "autocomplete" },
      },
      {
        name: "autocomplete-english",
        input: { q: "INTRO", page: 1, pageSize: 8, mode: "autocomplete" },
      },
      { name: "search-thai", input: { ...explicit, q: "การ", page: 1, pageSize: 20 } },
      { name: "search-empty", input: { ...explicit, page: 1, pageSize: 20 } },
      {
        name: "search-late-page",
        input: {
          ...explicit,
          page: Math.max(
            1,
            Math.ceil(
              Number(
                (terms as { term_id: number; active: number }[]).find(
                  (row) => row.term_id === term.id,
                )?.active ?? 0,
              ) / 20,
            ),
          ),
          pageSize: 20,
        },
      },
      {
        name: "search-day-time",
        input: {
          ...explicit,
          days: "MO,WE",
          startTime: "09:00",
          endTime: "16:00",
          page: 1,
          pageSize: 20,
        },
      },
      {
        name: "search-gened-credit",
        input: { ...explicit, courseGroup: "general", credits: 3, page: 1, pageSize: 20 },
      },
      {
        name: "search-no-match",
        input: { ...explicit, q: "zzzauditnomatchzzz", page: 1, pageSize: 20 },
      },
    ]
    for (const workload of workloads) {
      const path =
        "/api/v1/courses?" +
        new URLSearchParams(
          Object.entries(workload.input).map(([key, value]) => [key, String(value)]),
        )
      const warmups = [await get(path), await get(path)]
      const serial: number[] = []
      for (let i = 0; i < 12; i++) serial.push((await get(path)).ms)
      const burst: number[] = []
      let next = 0
      const burstStart = performance.now()
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (next++ < 24) burst.push((await get(path)).ms)
        }),
      )
      const burstMs = performance.now() - burstStart
      const stages: number[][] = []
      let captured: Captured[] = []
      for (let i = 0; i < 6; i++) {
        capture = []
        await searchCourses(workload.input)
        const currentCapture = capture
        if (currentCapture.length > 0) captured = currentCapture
        currentCapture.forEach((query, index) => {
          const stage = stages[index] ?? []
          stage.push(query.ms)
          stages[index] = stage
        })
      }
      capture = null
      console.log(
        JSON.stringify({
          kind: "workload",
          name: workload.name,
          input: workload.input,
          total: warmups[0]?.body.meta.total,
          bytes: warmups[0]?.bytes,
          cookieRefreshed: warmups[0]?.refreshed,
          warmupMs: warmups.map((row) => round(row.ms)),
          serial: stats(serial),
          concurrency4: stats(burst),
          burstElapsedMs: round(burstMs),
          burstRps: round(24_000 / burstMs),
          sqlStages: captured.map((query, index) => ({
            sql: query.sql,
            ...stats(stages[index] ?? []),
          })),
        }),
      )
      // Exact generated count/page SQL, executed once each by EXPLAIN ANALYZE.
      const offeringQueries = captured.filter((query) =>
        query.sql.includes("from `course_offerings`"),
      )
      for (const query of offeringQueries) {
        const [plan] = await connection.query("EXPLAIN ANALYZE " + query.sql, query.params)
        console.log(
          JSON.stringify({
            kind: "plan",
            name: workload.name,
            stage: query.sql.includes("count(*)") ? "count" : "page",
            plan,
          }),
        )
      }
      await Bun.sleep(100)
    }
    for (const path of [
      "/api/v1/terms",
      `/api/v1/catalog/options?academicYear=${term.academicYear}&semester=${term.semester}`,
    ]) {
      await get(path)
      await get(path)
      const samples: number[] = []
      for (let i = 0; i < 12; i++) samples.push((await get(path)).ms)
      console.log(JSON.stringify({ kind: "auxiliary", path, serial: stats(samples) }))
    }
    console.log(
      JSON.stringify({
        kind: "complete",
        successfulCatalogGets: workloads.length * 38 + 28,
        elapsedMs: round(performance.now() - started),
      }),
    )
  } finally {
    await connection.rollback()
    connection.release()
    if (cookie) {
      try {
        await fetch(origin + "/api/v1/auth/logout", {
          method: "POST",
          headers: { cookie, origin: config.webOrigin },
        })
      } catch (error) {
        console.warn("[benchmark] Could not revoke the scoped catalog session", error)
      }
    }
  }
}
try {
  await main()
} catch {
  // Avoid driver errors that can contain connection details or data.
  console.error(
    "Read-only benchmark stopped; check local service health and development configuration. Error details suppressed.",
  )
  process.exitCode = 1
} finally {
  await pool.end()
}
