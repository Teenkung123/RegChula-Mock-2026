import { describe, expect, it } from "bun:test"
import type { RowDataPacket } from "mysql2/promise"
import { pool } from "../db/client"
import {
  openPeriods,
  parseSnapshot,
  requireLocalTestingDatabase,
  restorePeriods,
  snapshotPeriods,
} from "./testing-periods"

describe("testing period safeguards", () => {
  it("rejects production and nonlocal database targets", () => {
    expect(
      requireLocalTestingDatabase("development", "mysql://user:password@127.0.0.1:3307/regchula"),
    ).toBe("127.0.0.1:3307/regchula")
    for (const [environment, url] of [
      ["production", "mysql://localhost:3307/regchula"],
      ["development", "mysql://remote:3307/regchula"],
      ["development", "mysql://localhost:3306/regchula"],
    ] as const)
      expect(() => requireLocalTestingDatabase(environment, url)).toThrow()
  })

  it("rejects backups for another database and duplicate term records", () => {
    const snapshot = {
      version: 1 as const,
      database: "local",
      windows: [{ termId: 1, opensAt: null, closesAt: null }],
    }
    expect(parseSnapshot(snapshot, "local")).toEqual(snapshot)
    expect(() => parseSnapshot(snapshot, "another")).toThrow()
    expect(() =>
      parseSnapshot({ ...snapshot, windows: [...snapshot.windows, ...snapshot.windows] }, "local"),
    ).toThrow()
    expect(() =>
      parseSnapshot(
        { ...snapshot, windows: [{ termId: 1, opensAt: null, closesAt: "bad" }] },
        "local",
      ),
    ).toThrow()
  })
})

const mysqlIntegration = process.env.REGC_MYSQL_INTEGRATION === "1" ? describe : describe.skip
mysqlIntegration("testing period rollback", () => {
  it("opens active terms and restores old/missing windows without overwriting later admin edits", async () => {
    const connection = await pool.getConnection()
    try {
      await connection.query(
        "CREATE TEMPORARY TABLE academic_terms (id INT PRIMARY KEY, active BOOLEAN NOT NULL)",
      )
      await connection.query(
        "CREATE TEMPORARY TABLE term_registration_windows (term_id INT PRIMARY KEY, opens_at DATETIME(3), closes_at DATETIME(3))",
      )
      await connection.query("INSERT INTO academic_terms VALUES (1, 1), (2, 1), (3, 1), (4, 0)")
      await connection.query(
        "INSERT INTO term_registration_windows VALUES (1, '2020-01-01', '2020-02-01'), (3, '2021-01-01', '2021-02-01'), (4, '2022-01-01', '2022-02-01')",
      )
      const snapshot = await snapshotPeriods(connection, "local")
      expect(snapshot.windows.map(({ termId }) => termId)).toEqual([1, 2, 3])
      await openPeriods(connection, snapshot)
      const [open] = await connection.query<RowDataPacket[]>(
        "SELECT term_id FROM term_registration_windows WHERE opens_at <= UTC_TIMESTAMP() AND closes_at > UTC_TIMESTAMP() ORDER BY term_id",
      )
      expect(open.map((row) => row.term_id)).toEqual([1, 2, 3])
      await connection.query(
        "UPDATE term_registration_windows SET closes_at = '2098-01-01' WHERE term_id = 3",
      )
      expect(await restorePeriods(connection, parseSnapshot(snapshot, "local"))).toBe(2)
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT term_id, YEAR(closes_at) AS year FROM term_registration_windows ORDER BY term_id",
      )
      expect(rows.map((row) => [row.term_id, row.year])).toEqual([
        [1, 2020],
        [3, 2098],
        [4, 2022],
      ])
      expect(await restorePeriods(connection, snapshot)).toBe(0)
    } finally {
      connection.destroy()
    }
  })
})
