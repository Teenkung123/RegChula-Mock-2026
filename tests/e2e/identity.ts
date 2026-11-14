import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto"
import { execFile } from "node:child_process"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { promisify } from "node:util"
import { test as base } from "@playwright/test"
import type { Connection, RowDataPacket } from "../../apps/api/node_modules/mysql2/promise"

const requireApi = createRequire(resolve(process.cwd(), "apps/api/package.json"))
const mysql = requireApi("mysql2/promise") as typeof import("../../apps/api/node_modules/mysql2/promise")
const owned = new Map<string, { advisorId: string; shardId: number }>()
let fixturePasswordHash: Promise<string> | undefined

function advisorPasswordHash() {
  fixturePasswordHash ??= promisify(execFile)("bun", ["-e", "process.stdout.write(await Bun.password.hash(process.env.E2E_ADVISOR_PASSWORD!))"],
    { env: { ...process.env, E2E_ADVISOR_PASSWORD: randomBytes(48).toString("base64url") } })
    .then(({ stdout }) => stdout)
  return fixturePasswordHash
}

async function connect(): Promise<Connection> {
  if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local")
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (process.env.APP_ENV !== "development" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "3307") {
    throw new Error("Student E2E fixtures require development mode and local MySQL port 3307")
  }
  return mysql.createConnection({ uri: url.toString(), timezone: "Z" })
}

// Provision real profiles so registration tests exercise the same access rules as users.
// A plain INSERT reserves ownership; a collision fails before cleanup can touch that ID.
export async function randomStudentId(): Promise<string> {
  const studentId = `99${String(randomInt(100_000_000)).padStart(8, "0")}`
  const advisorId = randomUUID()
  const shardId = createHash("sha256").update(studentId).digest()[0] ?? 0
  const passwordHash = await advisorPasswordHash()
  const connection = await connect()
  try {
    await connection.beginTransaction()
    const [terms] = await connection.query<RowDataPacket[]>(
      "SELECT t.id FROM academic_terms t JOIN app_settings s ON s.`key` = 'current_term_id' AND t.id = CAST(s.value AS UNSIGNED) WHERE t.active = 1",
    )
    if (!terms[0]) throw new Error("E2E requires an active current term")
    await connection.execute("INSERT INTO students (student_id) VALUES (?)", [studentId])
    await connection.execute("UPDATE mock_auth_shards SET student_count = student_count + 1 WHERE shard_id = ?", [shardId])
    await connection.execute("INSERT INTO staff_users (id, username, display_name, role, password_hash) VALUES (?, ?, 'E2E advisor', 'advisor', ?)",
      [advisorId, `e2e-${advisorId}`, passwordHash])
    await connection.execute("INSERT INTO student_registration_profiles (student_id, first_term_id, academic_level) VALUES (?, ?, 'undergraduate')", [studentId, terms[0].id])
    await connection.execute("INSERT INTO student_advisors (student_id, staff_id) VALUES (?, ?)", [studentId, advisorId])
    await connection.commit()
    owned.set(studentId, { advisorId, shardId })
    return studentId
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { await connection.end() }
}

async function cleanupOwnedStudents() {
  if (!owned.size) return
  const connection = await connect()
  try {
    for (const [studentId, { advisorId, shardId }] of owned) {
      await connection.beginTransaction()
      try {
        await connection.query("UPDATE sections s JOIN (SELECT section_id, COUNT(*) AS occupied FROM registrations WHERE student_id = ? AND status IN ('active', 'withdrawn') GROUP BY section_id) r ON r.section_id = s.id SET s.local_active = GREATEST(s.local_active - r.occupied, 0)", [studentId])
        await connection.execute("DELETE e FROM registration_events e JOIN registrations r ON r.id = e.registration_id WHERE r.student_id = ?", [studentId])
        await connection.execute("DELETE FROM withdrawal_requests WHERE student_id = ?", [studentId])
        await connection.execute("DELETE FROM registrations WHERE student_id = ?", [studentId])
        await connection.execute("DELETE FROM idempotency_records WHERE student_id = ?", [studentId])
        await connection.execute("DELETE FROM student_activities WHERE student_id = ?", [studentId])
        await connection.execute("DELETE FROM student_favorites WHERE student_id = ?", [studentId])
        await connection.execute("DELETE FROM students WHERE student_id = ?", [studentId])
        await connection.execute("UPDATE mock_auth_shards SET student_count = GREATEST(student_count - 1, 0) WHERE shard_id = ?", [shardId])
        await connection.execute("DELETE FROM staff_users WHERE id = ?", [advisorId])
        await connection.commit()
        owned.delete(studentId)
      } catch (error) {
        await connection.rollback()
        throw error
      }
    }
  } finally { await connection.end() }
}

export const test = base.extend<{ studentCleanup: undefined }>({
  studentCleanup: [async ({ page }, use) => {
    try { await use(undefined) } finally {
      if (owned.size) {
        try {
          await page.request.post("http://localhost:3000/api/v1/auth/logout", { headers: { origin: "http://localhost:5173" } })
        } finally { await cleanupOwnedStudents() }
      }
    }
  }, { auto: true }],
})
