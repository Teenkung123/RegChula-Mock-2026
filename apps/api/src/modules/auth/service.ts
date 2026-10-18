import { createHash, createHmac } from "node:crypto"
import { eq } from "drizzle-orm"
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { config } from "../../config"
import { db, pool } from "../../db/client"
import { runTransaction } from "../../db/transaction"
import { students } from "../../db/schema"
import {
  cacheStudentSession,
  replaceStudentSession,
  studentSessionIsActive,
} from "../../shared/session-store"
import { hashRequest, verifyToken, signToken } from "../../shared/tokens"

interface ChallengePayload {
  version: 2
  code: string
  nonce: string
  exp: number
}

interface ChallengeConsumptionRow extends RowDataPacket {
  request_hash: string
  previous_session_hash: string | null
}

interface BooleanRow extends RowDataPacket {
  value: number
}

export type ChallengeLoginResult =
  | { ok: true; sessionToken: string; previousSessionHashes: string[] }
  | { ok: false; reason: "invalid" | "capacity" }

let cleanupCounter = 0

const validNonce = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const challengeSigningSecret = createHmac("sha256", config.challengeSecret)
  .update("regchula-challenge-v2", "utf8")
  .digest("base64url")

const mockStudentShard = (studentId: string): number =>
  createHash("sha256").update(studentId, "utf8").digest()[0] ?? 0

const deriveSessionToken = (nonce: string, studentId: string, rememberMe: boolean): string =>
  createHmac("sha256", config.cookieSecret)
    .update("regchula-session-v2\0", "utf8")
    .update(nonce, "utf8")
    .update("\0", "utf8")
    .update(studentId, "utf8")
    .update(rememberMe ? "\x01" : "\x00", "utf8")
    .digest("base64url")

async function ensureStudentWithConnection(
  connection: Pick<PoolConnection, "execute" | "query">,
  studentId: string,
): Promise<void> {
  const [existing] = await connection.query<BooleanRow[]>(
    "SELECT 1 AS value FROM students WHERE student_id = ? LIMIT 1",
    [studentId],
  )
  if (existing.length === 0) {
    const shardId = mockStudentShard(studentId)
    const shardLimit = Math.floor(config.mockAuthMaxStudents / 256)
    const [reserved] = await connection.execute<ResultSetHeader>(
      [
        "UPDATE mock_auth_shards SET student_count = student_count + 1",
        "WHERE shard_id = ? AND student_count < ?",
      ].join(" "),
      [shardId, shardLimit],
    )
    if (reserved.affectedRows !== 1) throw new Error("MOCK_AUTH_CAPACITY_REACHED")
    const [inserted] = await connection.execute<ResultSetHeader>(
      "INSERT IGNORE INTO students (student_id, last_login_at) VALUES (?, CURRENT_TIMESTAMP)",
      [studentId],
    )
    if (inserted.affectedRows === 0)
      await connection.execute(
        "UPDATE mock_auth_shards SET student_count = GREATEST(student_count - 1, 0) WHERE shard_id = ?",
        [shardId],
      )
  } else {
    await connection.execute(
      "UPDATE students SET last_login_at = CURRENT_TIMESTAMP WHERE student_id = ?",
      [studentId],
    )
  }
  await connection.execute("INSERT IGNORE INTO student_preferences (student_id) VALUES (?)", [
    studentId,
  ])
}

async function cleanupExpiredChallenges(): Promise<void> {
  cleanupCounter += 1
  if (cleanupCounter % 256 !== 0) return
  try {
    await pool.execute(
      [
        "DELETE FROM auth_challenge_consumptions",
        "WHERE expires_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR)",
        "ORDER BY expires_at LIMIT 1000",
      ].join(" "),
    )
  } catch (error) {
    console.warn("[auth] Could not clean expired challenge consumptions", error)
  }
}

export function createChallenge() {
  const [random = 0] = crypto.getRandomValues(new Uint16Array(1))
  const code = String(random % 10_000).padStart(4, "0")
  const expiresAt = Date.now() + 5 * 60_000
  const payload: ChallengePayload = {
    version: 2,
    code,
    nonce: crypto.randomUUID(),
    exp: expiresAt,
  }
  return {
    code,
    token: signToken(payload, challengeSigningSecret),
    expiresAt: new Date(expiresAt).toISOString(),
  }
}

export async function loginWithChallenge(
  studentId: string,
  rememberMe: boolean,
  token: string,
  answer: string,
): Promise<ChallengeLoginResult> {
  const payload = verifyToken<ChallengePayload>(token, challengeSigningSecret)
  if (
    payload?.version !== 2 ||
    payload.code !== answer ||
    !/^\d{4}$/.test(payload.code) ||
    !validNonce(payload.nonce)
  ) {
    return { ok: false, reason: "invalid" }
  }

  await cleanupExpiredChallenges()
  const requestHash = hashRequest({ nonce: payload.nonce, studentId, rememberMe })
  const sessionToken = deriveSessionToken(payload.nonce, studentId, rememberMe)

  let result: ChallengeLoginResult
  try {
    result = await runTransaction<ChallengeLoginResult>(async (connection) => {
      const [freshRows] = await connection.query<BooleanRow[]>(
        "SELECT FROM_UNIXTIME(?) > CURRENT_TIMESTAMP AS value",
        [payload.exp / 1000],
      )
      if (!freshRows[0]?.value) {
        return { commit: false, value: { ok: false, reason: "invalid" } }
      }
      const [inserted] = await connection.execute<ResultSetHeader>(
        [
          "INSERT IGNORE INTO auth_challenge_consumptions (nonce, request_hash, expires_at)",
          "VALUES (?, ?, FROM_UNIXTIME(?))",
        ].join(" "),
        [payload.nonce, requestHash, payload.exp / 1000],
      )
      if (inserted.affectedRows === 0) {
        const [rows] = await connection.query<ChallengeConsumptionRow[]>(
          [
            "SELECT request_hash, previous_session_hash FROM auth_challenge_consumptions",
            "WHERE nonce = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1",
          ].join(" "),
          [payload.nonce],
        )
        const sameRequest = rows[0]?.request_hash === requestHash
        const activeSession =
          sameRequest && (await studentSessionIsActive(connection, sessionToken))
        return {
          commit: false,
          value: activeSession
            ? {
                ok: true,
                sessionToken,
                previousSessionHashes: rows[0]?.previous_session_hash
                  ? [rows[0].previous_session_hash]
                  : [],
              }
            : { ok: false, reason: "invalid" },
        }
      }

      await ensureStudentWithConnection(connection, studentId)
      const previousSessionHashes = await replaceStudentSession(
        connection,
        sessionToken,
        studentId,
        rememberMe,
      )
      await connection.execute(
        "UPDATE auth_challenge_consumptions SET previous_session_hash = ? WHERE nonce = ?",
        [previousSessionHashes[0] ?? null, payload.nonce],
      )
      return { commit: true, value: { ok: true, sessionToken, previousSessionHashes } }
    })
  } catch (error) {
    if (error instanceof Error && error.message === "MOCK_AUTH_CAPACITY_REACHED") {
      return { ok: false, reason: "capacity" }
    }
    throw error
  }
  if (!result.ok) return result
  const cached = await cacheStudentSession(
    result.sessionToken,
    studentId,
    rememberMe,
    result.previousSessionHashes,
  )
  return cached ? result : { ok: false, reason: "invalid" }
}

export async function ensureStudent(studentId: string): Promise<void> {
  await runTransaction(async (connection) => {
    await ensureStudentWithConnection(connection, studentId)
    return { commit: true, value: undefined }
  })
}

export async function findStudent(studentId: string) {
  const [student] = await db
    .select()
    .from(students)
    .where(eq(students.studentId, studentId))
    .limit(1)
  return student ?? null
}
