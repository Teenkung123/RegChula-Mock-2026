import { describe, expect, it } from "bun:test"
import type { PoolConnection } from "mysql2/promise"
import { runTransaction, type TransactionRuntime } from "./transaction"

describe("transaction retries", () => {
  it("releases the checked-out connection before retry backoff", async () => {
    const events: string[] = []
    let attempts = 0
    const connection = {
      beginTransaction: async () => events.push("begin"),
      rollback: async () => events.push("rollback"),
      release: () => events.push("release"),
    } as unknown as PoolConnection
    const runtime: TransactionRuntime = {
      getConnection: async () => connection,
      sleep: async () => {
        events.push("sleep")
        expect(events.at(-2)).toBe("release")
      },
      random: () => 0,
    }

    await expect(
      runTransaction(async () => {
        attempts += 1
        if (attempts === 1) throw { code: "ER_LOCK_DEADLOCK" }
        return { commit: false, value: "ready" }
      }, runtime),
    ).resolves.toBe("ready")

    expect(events).toEqual([
      "begin",
      "rollback",
      "release",
      "sleep",
      "begin",
      "rollback",
      "release",
    ])
  })
})
