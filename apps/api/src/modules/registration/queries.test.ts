import { describe, expect, it } from "bun:test"
import type { PoolConnection } from "mysql2/promise"
import { getTargets } from "./queries"

describe("registration target locking", () => {
  it("uses one deterministic current read that locks only section rows", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const connection = {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params })
        return [[], []]
      },
    } as unknown as PoolConnection

    await getTargets(connection, [9, 3, 9], true)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.params).toEqual([3, 9])
    expect(calls[0]?.sql).toContain("ORDER BY s.id FOR UPDATE OF s")
  })

  it("does not lock section rows during a preview", async () => {
    const calls: string[] = []
    const connection = {
      query: async (sql: string) => {
        calls.push(sql)
        return [[], []]
      },
    } as unknown as PoolConnection

    await getTargets(connection, [3], false)

    expect(calls).toHaveLength(1)
    expect(calls[0]).not.toContain("FOR UPDATE")
  })
})
