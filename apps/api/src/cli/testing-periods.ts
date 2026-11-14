import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { PoolConnection, RowDataPacket } from "mysql2/promise"
import { config } from "../config"
import { closeDatabase, pool } from "../db/client"

const opensAt = "2000-01-01 00:00:00.000"
const closesAt = "2099-12-31 23:59:59.000"
interface WindowRow extends RowDataPacket {
  termId: number
  opensAt: string | null
  closesAt: string | null
}
export interface PeriodSnapshot {
  version: 1
  database: string
  windows: Array<{ termId: number; opensAt: string | null; closesAt: string | null }>
}

export function requireLocalTestingDatabase(appEnv: string, databaseUrl: string): string {
  const url = new URL(databaseUrl)
  if (
    appEnv !== "development" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "3307"
  ) {
    throw new Error("Testing periods require development mode and local MySQL port 3307")
  }
  return `${url.hostname}:${url.port}${url.pathname}`
}

export async function snapshotPeriods(
  connection: PoolConnection,
  database: string,
): Promise<PeriodSnapshot> {
  const [rows] = await connection.query<WindowRow[]>(`SELECT t.id AS termId,
    DATE_FORMAT(w.opens_at, '%Y-%m-%d %H:%i:%s.%f') AS opensAt,
    DATE_FORMAT(w.closes_at, '%Y-%m-%d %H:%i:%s.%f') AS closesAt
    FROM academic_terms t LEFT JOIN term_registration_windows w ON w.term_id = t.id
    WHERE t.active = 1 ORDER BY t.id FOR UPDATE`)
  return {
    version: 1,
    database,
    windows: rows.map(({ termId, opensAt, closesAt }) => ({ termId, opensAt, closesAt })),
  }
}

export async function openPeriods(connection: PoolConnection, snapshot: PeriodSnapshot) {
  for (const { termId } of snapshot.windows) {
    await connection.execute(
      `INSERT INTO term_registration_windows (term_id, opens_at, closes_at)
      VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE opens_at = VALUES(opens_at), closes_at = VALUES(closes_at)`,
      [termId, opensAt, closesAt],
    )
  }
}

export function parseSnapshot(value: unknown, database: string): PeriodSnapshot {
  const snapshot = value as PeriodSnapshot | null
  const date = (value: unknown) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3,6}$/.test(value)
  if (
    snapshot?.version !== 1 ||
    snapshot.database !== database ||
    !Array.isArray(snapshot.windows) ||
    snapshot.windows.some(
      (row) =>
        !row ||
        !Number.isSafeInteger(row.termId) ||
        row.termId < 1 ||
        !(
          (row.opensAt === null && row.closesAt === null) ||
          (date(row.opensAt) && date(row.closesAt))
        ),
    ) ||
    new Set(snapshot.windows.map((row) => row.termId)).size !== snapshot.windows.length
  ) {
    throw new Error("Invalid period backup or a different database")
  }
  return snapshot
}

export async function restorePeriods(connection: PoolConnection, snapshot: PeriodSnapshot) {
  let restored = 0
  for (const row of snapshot.windows) {
    // A later admin edit takes precedence over this rollback.
    const [current] = await connection.query<RowDataPacket[]>(
      `SELECT term_id FROM term_registration_windows
      WHERE term_id = ? AND opens_at = ? AND closes_at = ? FOR UPDATE`,
      [row.termId, opensAt, closesAt],
    )
    if (!current.length) continue
    if (row.opensAt === null) {
      await connection.execute("DELETE FROM term_registration_windows WHERE term_id = ?", [
        row.termId,
      ])
    } else {
      await connection.execute(
        "UPDATE term_registration_windows SET opens_at = ?, closes_at = ? WHERE term_id = ?",
        [row.opensAt, row.closesAt, row.termId],
      )
    }
    restored++
  }
  return restored
}

if (import.meta.main) {
  const database = requireLocalTestingDatabase(config.appEnv, config.databaseUrl)
  const action = process.argv[2]
  if (action !== "open" && action !== "restore")
    throw new Error("Expected open or restore <backup-path>")
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    if (action === "open") {
      const snapshot = await snapshotPeriods(connection, database)
      const directory = resolve(import.meta.dir, "../../../../tmp/testing-periods")
      await mkdir(directory, { recursive: true })
      const path = resolve(directory, `${Date.now()}-${crypto.randomUUID()}.json`)
      await writeFile(path, JSON.stringify(snapshot, null, 2), { flag: "wx" })
      await openPeriods(connection, snapshot)
      await connection.commit()
      console.log(
        `[testing] Opened registration for ${snapshot.windows.length} active terms through 2099.`,
      )
      console.log(`[testing] Restore previous windows: bun run testing:periods:restore "${path}"`)
    } else {
      if (!process.argv[3])
        throw new Error("Provide the backup path printed by testing:periods:open")
      const snapshot = parseSnapshot(JSON.parse(await readFile(process.argv[3], "utf8")), database)
      const restored = await restorePeriods(connection, snapshot)
      await connection.commit()
      console.log(`[testing] Restored ${restored} windows; subsequent admin edits were preserved.`)
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
    await closeDatabase()
  }
}
