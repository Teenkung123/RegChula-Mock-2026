import { createHash } from "node:crypto"
import type { PoolConnection, RowDataPacket } from "mysql2/promise"
import { pool } from "../db/client"
import { sharedState } from "./redis"

export const SESSION_IDLE_SECONDS = 10 * 60
export const SESSION_ABSOLUTE_SECONDS = 7 * 24 * 60 * 60
export const REMEMBER_SESSION_SECONDS = 7 * 24 * 60 * 60

type QueryConnection = Pick<PoolConnection, "execute" | "query">

interface SessionExistsRow extends RowDataPacket {
  active: number
}

interface SessionHashRow extends RowDataPacket {
  token_hash: string
}

interface CachedSession {
  version: 1
  studentId: string
  rememberMe: boolean
  absoluteExpiresAt: number
}

export interface StoredSession {
  studentId: string
  rememberMe: boolean
}

export interface SessionStore {
  resolve: (token: string) => Promise<StoredSession | null>
  revoke: (token: string) => Promise<void>
}

export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex")

const sessionKeyFromHash = (hash: string) => `regchula:v3:session:${hash}`
const revokedKeyFromHash = (hash: string) => `regchula:v3:session-revoked:${hash}`
const sessionKey = (token: string) => sessionKeyFromHash(hashSessionToken(token))
const revokedKey = (token: string) => revokedKeyFromHash(hashSessionToken(token))

async function revokeHashedSessions(hashes: readonly string[]): Promise<void> {
  if (hashes.length === 0) return
  const keys = hashes.flatMap((hash) => [revokedKeyFromHash(hash), sessionKeyFromHash(hash)])
  await sharedState((redis) =>
    redis
      .send("EVAL", [
        "for i=1,#KEYS,2 do redis.call('SET',KEYS[i],'1','EX',ARGV[1]); redis.call('DEL',KEYS[i+1]) end; return 1",
        String(keys.length),
        ...keys,
        String(SESSION_ABSOLUTE_SECONDS),
      ])
      .then(() => undefined),
  )
}

/** Revoke sessions while the caller holds the student's credential row lock. */
export async function revokeStudentSessions(
  connection: QueryConnection,
  studentId: string,
): Promise<void> {
  const [sessions] = await connection.query<SessionHashRow[]>(
    "SELECT token_hash FROM student_sessions WHERE student_id = ? FOR UPDATE",
    [studentId],
  )
  await revokeHashedSessions(sessions.map((row) => row.token_hash))
  await connection.execute("DELETE FROM student_sessions WHERE student_id = ?", [studentId])
}

const parseCachedSession = (value: string): CachedSession | null => {
  try {
    const parsed = JSON.parse(value) as Partial<CachedSession>
    return parsed.version === 1 &&
      typeof parsed.studentId === "string" &&
      typeof parsed.rememberMe === "boolean" &&
      typeof parsed.absoluteExpiresAt === "number"
      ? (parsed as CachedSession)
      : null
  } catch {
    return null
  }
}

export async function replaceStudentSession(
  connection: QueryConnection,
  token: string,
  studentId: string,
  rememberMe: boolean,
): Promise<string[]> {
  const idleSeconds = rememberMe ? REMEMBER_SESSION_SECONDS : SESSION_IDLE_SECONDS
  const [previous] = await connection.query<SessionHashRow[]>(
    "SELECT token_hash FROM student_sessions WHERE student_id = ? FOR UPDATE",
    [studentId],
  )
  await revokeHashedSessions(previous.map((row) => row.token_hash))
  await connection.execute("DELETE FROM student_sessions WHERE student_id = ?", [studentId])
  await connection.execute(
    [
      "INSERT INTO student_sessions",
      "(token_hash, student_id, remember_me, idle_timeout_seconds, last_seen_at, idle_expires_at, absolute_expires_at)",
      "VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP,",
      "TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP), TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP))",
    ].join(" "),
    [
      hashSessionToken(token),
      studentId,
      rememberMe,
      idleSeconds,
      idleSeconds,
      SESSION_ABSOLUTE_SECONDS,
    ],
  )
  return previous.map((row) => row.token_hash)
}

export async function cacheStudentSession(
  token: string,
  studentId: string,
  rememberMe: boolean,
  previousSessionHashes: readonly string[] = [],
): Promise<boolean> {
  const value = JSON.stringify({
    version: 1,
    studentId,
    rememberMe,
    absoluteExpiresAt: Date.now() + SESSION_ABSOLUTE_SECONDS * 1000,
  } satisfies CachedSession)
  const ttl = rememberMe ? REMEMBER_SESSION_SECONDS : SESSION_IDLE_SECONDS
  const previousKeys = previousSessionHashes.flatMap((hash) => [
    revokedKeyFromHash(hash),
    sessionKeyFromHash(hash),
  ])
  const keys = [revokedKey(token), sessionKey(token), ...previousKeys]
  const result = await sharedState((redis) =>
    redis.send("EVAL", [
      [
        "if redis.call('EXISTS',KEYS[1])==1 then return 0 end",
        "for i=3,#KEYS,2 do redis.call('SET',KEYS[i],'1','EX',ARGV[3]); redis.call('DEL',KEYS[i+1]) end",
        "redis.call('SET',KEYS[2],ARGV[1],'EX',ARGV[2]); return 1",
      ].join("; "),
      String(keys.length),
      ...keys,
      value,
      String(ttl),
      String(SESSION_ABSOLUTE_SECONDS),
    ]),
  )
  return Number(result) === 1
}

export async function studentSessionIsActive(
  connection: QueryConnection,
  token: string,
): Promise<boolean> {
  const [rows] = await connection.query<SessionExistsRow[]>(
    [
      "SELECT 1 AS active FROM student_sessions",
      "WHERE token_hash = ? AND revoked_at IS NULL",
      "AND idle_expires_at > CURRENT_TIMESTAMP AND absolute_expires_at > CURRENT_TIMESTAMP",
      "LIMIT 1",
    ].join(" "),
    [hashSessionToken(token)],
  )
  return rows.length === 1
}

async function resolveCachedSession(token: string): Promise<StoredSession | null> {
  return sharedState(async (redis) => {
    const key = sessionKey(token)
    const value = await redis.get(key)
    if (!value) return null
    const session = parseCachedSession(value)
    if (!session || session.absoluteExpiresAt <= Date.now()) {
      await redis.del(key)
      return null
    }
    if (!session.rememberMe) {
      const remaining = Math.max(1, Math.ceil((session.absoluteExpiresAt - Date.now()) / 1000))
      const extended = await redis.expire(key, Math.min(SESSION_IDLE_SECONDS, remaining))
      if (!extended) return null
    }
    return { studentId: session.studentId, rememberMe: session.rememberMe }
  })
}

async function revokeSharedSession(token: string): Promise<void> {
  await sharedState((redis) =>
    redis
      .send("EVAL", [
        "redis.call('SET',KEYS[1],'1','EX',ARGV[1]); return redis.call('DEL',KEYS[2])",
        "2",
        revokedKey(token),
        sessionKey(token),
        String(SESSION_ABSOLUTE_SECONDS),
      ])
      .then(() => undefined),
  )
  try {
    await pool.execute(
      "UPDATE student_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE token_hash = ?",
      [hashSessionToken(token)],
    )
  } catch (error) {
    console.error(
      "[auth] Session was revoked in shared state but its MySQL audit row was not updated",
      error,
    )
    throw error
  }
}

export const sharedSessionStore: SessionStore = {
  resolve: resolveCachedSession,
  revoke: revokeSharedSession,
}
