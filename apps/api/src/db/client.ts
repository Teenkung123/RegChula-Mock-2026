import { drizzle } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import { config } from "../config"
import * as schema from "./schema"

export const pool = mysql.createPool({
  uri: config.databaseUrl,
  connectionLimit: config.dbPoolSize,
  maxIdle: Math.min(10, config.dbPoolSize),
  idleTimeout: 60_000,
  waitForConnections: true,
  queueLimit: config.dbPoolQueueLimit,
  connectTimeout: config.dbConnectTimeoutMs,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  decimalNumbers: true,
  timezone: "Z",
})

export const db = drizzle({ client: pool, schema, mode: "default" })

export type DatabaseFailureKind = "unavailable" | "overloaded" | "timeout"

const unavailableDatabaseCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST",
  "ER_SERVER_SHUTDOWN",
])

const overloadedDatabaseCodes = new Set(["ER_CON_COUNT_ERROR", "ER_TOO_MANY_USER_CONNECTIONS"])
const timeoutDatabaseCodes = new Set([
  "ETIMEDOUT",
  "PROTOCOL_SEQUENCE_TIMEOUT",
  "ER_LOCK_WAIT_TIMEOUT",
])
const overloadedDatabaseMessages = new Set([
  "No connections available.",
  "Pool is closed.",
  "Queue limit reached.",
])

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })

export function databaseFailureKind(error: unknown): DatabaseFailureKind | null {
  let current = error
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return null
    const candidate = current as { code?: unknown; cause?: unknown; message?: unknown }
    if (typeof candidate.code === "string") {
      if (overloadedDatabaseCodes.has(candidate.code)) return "overloaded"
      if (timeoutDatabaseCodes.has(candidate.code)) return "timeout"
      if (unavailableDatabaseCodes.has(candidate.code)) return "unavailable"
    }
    if (
      typeof candidate.message === "string" &&
      overloadedDatabaseMessages.has(candidate.message)
    ) {
      return "overloaded"
    }
    current = candidate.cause
  }
  return null
}

export function isDatabaseUnavailable(error: unknown): boolean {
  return databaseFailureKind(error) !== null
}

export async function waitForDatabase({
  timeoutMs = 120_000,
  retryMs = 1_000,
  probe = () => pool.query("SELECT 1"),
}: {
  timeoutMs?: number
  retryMs?: number
  probe?: () => Promise<unknown>
} = {}): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (true) {
    try {
      await probe()
      return
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error
      if (Date.now() >= deadline) {
        throw new Error(
          "MySQL did not become ready within " + Math.ceil(timeoutMs / 1000) + " seconds",
        )
      }
      await pause(Math.min(retryMs, Math.max(0, deadline - Date.now())))
    }
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end()
}
