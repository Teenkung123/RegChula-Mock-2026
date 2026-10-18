import type { PoolConnection } from "mysql2/promise"
import { pool } from "./client"

const retryableCodes = new Set(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"])
const maximumAttempts = 3

const errorCode = (error: unknown): string | null =>
  error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : null

export interface TransactionDecision<T> {
  commit: boolean
  value: T
}

export interface TransactionRuntime {
  getConnection: () => Promise<PoolConnection>
  sleep: (milliseconds: number) => Promise<void>
  random: () => number
}

const defaultRuntime: TransactionRuntime = {
  getConnection: () => pool.getConnection(),
  sleep: (milliseconds) => Bun.sleep(milliseconds),
  random: () => Math.random(),
}

export async function runTransaction<T>(
  operation: (connection: PoolConnection) => Promise<TransactionDecision<T>>,
  runtime: TransactionRuntime = defaultRuntime,
): Promise<T> {
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const connection = await runtime.getConnection()
    let retry = false
    try {
      await connection.beginTransaction()
      const decision = await operation(connection)
      if (decision.commit) await connection.commit()
      else await connection.rollback()
      return decision.value
    } catch (error) {
      await connection.rollback()
      retry = attempt < maximumAttempts - 1 && retryableCodes.has(errorCode(error) ?? "")
      if (!retry) throw error
    } finally {
      connection.release()
    }
    if (retry) await runtime.sleep(20 * (attempt + 1) + Math.floor(runtime.random() * 20))
  }
  throw new Error("Transaction retry budget exhausted")
}
