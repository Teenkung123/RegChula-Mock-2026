import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, open, readFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { promisify } from "node:util"
import type { Connection, RowDataPacket } from "mysql2/promise"

// Parent tables precede their dependants so the same list can be reversed for deletion.
export const studentTables = [
  "students",
  "student_credentials",
  "student_advisors",
  "student_registration_profiles",
  "registration_access_codes",
  "registration_access_grants",
  "student_sessions",
  "student_completed_courses",
  "student_preferences",
  "student_schedule_colors",
  "student_term_states",
  "student_activities",
  "student_favorites",
  "registrations",
  "registration_events",
  "withdrawal_requests",
  "idempotency_records",
] as const

type TableName = (typeof studentTables)[number]
type Row = Record<string, unknown>
export const studentAuditActions = [
  "student.updated",
  "advisor.assigned",
  "registration_code_issued",
  "registration_code_rotated",
  "registration_profile_updated",
] as const
const auditPlaceholders = studentAuditActions.map(() => "?").join(",")
type Backup = {
  version: 2
  database: string
  tables: Record<TableName, Row[]>
  studentAuditEvents: Row[]
  sectionCounters: { id: number | string; local_active: number | string }[]
}

export function validateBackup(value: unknown): Backup {
  if (!value || typeof value !== "object") throw new Error("Invalid student backup")
  const data = value as Partial<Backup>
  if (data.version !== 2 || typeof data.database !== "string" || !data.tables) {
    throw new Error("Invalid student backup header")
  }
  const names = Object.keys(data.tables)
  if (
    names.length !== studentTables.length ||
    studentTables.some((name) => !names.includes(name))
  ) {
    throw new Error("Backup has an unexpected set of student tables")
  }
  for (const table of studentTables) {
    if (
      !Array.isArray(data.tables[table]) ||
      data.tables[table].some((row) => !row || typeof row !== "object" || Array.isArray(row))
    ) {
      throw new Error(`Invalid rows in ${table}`)
    }
  }
  if (
    !Array.isArray(data.studentAuditEvents) ||
    data.studentAuditEvents.some(
      (row) =>
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        !studentAuditActions.includes(row.action as (typeof studentAuditActions)[number]),
    )
  ) {
    throw new Error("Invalid student audit events")
  }
  if (
    !Array.isArray(data.sectionCounters) ||
    data.sectionCounters.some(
      (row) => !row || !/^\d+$/.test(String(row.id)) || !/^\d+$/.test(String(row.local_active)),
    )
  ) {
    throw new Error("Invalid section counters")
  }
  return data as Backup
}

const runFile = promisify(execFile)

export async function protectBackupFile(
  path: string,
  platform: NodeJS.Platform = process.platform,
  run: (file: string, args: string[]) => Promise<{ stdout: string }> = runFile,
) {
  if (platform !== "win32") return // The file was created with mode 0600.
  const { stdout } = await run("whoami.exe", ["/user", "/fo", "csv", "/nh"])
  const sid = stdout.match(/S-\d-(?:\d+-)+\d+/i)?.[0]
  if (!sid) throw new Error("Cannot determine the current Windows user SID for the backup ACL")
  // The file is empty until the inherited ACL is removed and current user access is granted.
  await run("icacls.exe", [path, "/inheritance:r", "/grant:r", `*${sid}:(F)`])
}

export function parseArguments(args: string[]) {
  const [operation, ...flags] = args
  if (!flags.includes("--confirm") || !flags.includes("--offline")) {
    throw new Error("Stop all application writers, then provide both --offline and --confirm")
  }
  if (operation === "reset" && flags.length === 2) return { operation } as const
  if (operation === "restore" && flags.length === 4 && flags.includes("--backup")) {
    const index = flags.indexOf("--backup")
    const name = flags[index + 1]
    if (name && basename(name) === name && /^student-backup-[\w-]+\.json$/.test(name)) {
      return { operation, name } as const
    }
  }
  throw new Error(
    "Usage: student-reset.ts reset --offline --confirm | restore --offline --confirm --backup <backup filename>",
  )
}

async function databaseName(connection: Connection) {
  const [rows] = await connection.query<(RowDataPacket & { name: string })[]>(
    "SELECT DATABASE() AS name",
  )
  if (!rows[0]?.name) throw new Error("No database selected")
  return rows[0].name
}

async function verifyTables(connection: Connection) {
  const [rows] = await connection.query<(RowDataPacket & { table_name: string })[]>(
    "SELECT DISTINCT TABLE_NAME AS table_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'student_id'",
  )
  const expected = new Set<string>(studentTables)
  const unknown = rows.map((row) => row.table_name).filter((name) => !expected.has(name))
  if (unknown.length) throw new Error(`Unaccounted student tables: ${unknown.join(", ")}`)
  const found = new Set(rows.map((row) => row.table_name))
  const missing = studentTables.filter((name) => !found.has(name))
  if (missing.length) throw new Error(`Run all migrations before reset: ${missing.join(", ")}`)
  // A new dependant can omit student_id and still be cascade-deleted. Refuse until it is backed up.
  const placeholders = studentTables.map(() => "?").join(",")
  const [dependencies] = await connection.query<(RowDataPacket & { table_name: string })[]>(
    `SELECT DISTINCT TABLE_NAME AS table_name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IN (${placeholders})`,
    [...studentTables],
  )
  const unaccounted = dependencies
    .map((row) => row.table_name)
    .filter((name) => !expected.has(name))
  if (unaccounted.length)
    throw new Error(`Unaccounted student dependencies: ${unaccounted.join(", ")}`)
}

async function setCounts(connection: Connection) {
  await connection.query(
    "UPDATE mock_auth_state SET student_count = (SELECT COUNT(*) FROM students) WHERE id = 1",
  )
  await connection.query(
    "UPDATE mock_auth_shards s SET student_count = (SELECT COUNT(*) FROM students WHERE CONV(SUBSTRING(SHA2(student_id, 256), 1, 2), 16, 10) = s.shard_id)",
  )
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const { config } = await import("../config")
  const mysql = (await import("mysql2/promise")).default
  const { sharedState, closeSharedState } = await import("../shared/redis")
  const backupDir = resolve(import.meta.dir, "../../../../tmp/student-backups")
  const connection = await mysql.createConnection({
    uri: config.databaseUrl,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    timezone: "Z",
  })
  try {
    await connection.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
    await connection.beginTransaction()
    try {
      await verifyTables(connection)
      const database = await databaseName(connection)
      if (options.operation === "reset") {
        const tables = {} as Record<TableName, Row[]>
        for (const table of studentTables) {
          const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM \`${table}\` FOR UPDATE`,
          )
          tables[table] = rows
        }
        const [sectionCounters] = await connection.query<
          (RowDataPacket & { id: number; local_active: number })[]
        >("SELECT id, local_active FROM sections WHERE local_active <> 0 FOR UPDATE")
        const [studentAuditEvents] = await connection.query<RowDataPacket[]>(
          `SELECT * FROM staff_audit_events WHERE action IN (${auditPlaceholders}) FOR UPDATE`,
          [...studentAuditActions],
        )
        const backup: Backup = { version: 2, database, tables, studentAuditEvents, sectionCounters }
        await mkdir(backupDir, { recursive: true })
        const fileName = `student-backup-${Date.now()}-${randomUUID()}.json`
        const file = await open(resolve(backupDir, fileName), "wx", 0o600)
        try {
          await protectBackupFile(resolve(backupDir, fileName))
          await file.writeFile(JSON.stringify(backup), "utf8")
          await file.sync()
        } finally {
          await file.close()
        }
        // A Redis cache hit does not consult MySQL. Revoke cached tokens before deleting rows.
        const hashes = tables.student_sessions.map((row) => String(row.token_hash))
        for (let offset = 0; offset < hashes.length; offset += 200) {
          const keys = hashes
            .slice(offset, offset + 200)
            .flatMap((hash) => [
              `regchula:v3:session-revoked:${hash}`,
              `regchula:v3:session:${hash}`,
            ])
          await sharedState((redis) =>
            redis.send("EVAL", [
              "for i=1,#KEYS,2 do redis.call('SET',KEYS[i],'1','EX',ARGV[1]); redis.call('DEL',KEYS[i+1]) end; return 1",
              String(keys.length),
              ...keys,
              "604800",
            ]),
          )
        }
        for (const table of [...studentTables].reverse())
          await connection.query(`DELETE FROM \`${table}\``)
        await connection.query(
          `DELETE FROM staff_audit_events WHERE action IN (${auditPlaceholders})`,
          [...studentAuditActions],
        )
        await connection.query("UPDATE sections SET local_active = 0 WHERE local_active <> 0")
        await setCounts(connection)
        await connection.commit()
        console.log(`[student-reset] Complete. Sensitive backup: ${resolve(backupDir, fileName)}`)
      } else {
        const backup = validateBackup(
          JSON.parse(await readFile(resolve(backupDir, options.name), "utf8")),
        )
        if (backup.database !== database) throw new Error("Backup database name does not match")
        for (const table of studentTables) {
          const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM \`${table}\` LIMIT 1 FOR UPDATE`,
          )
          if (rows.length) throw new Error(`Cannot restore into nonempty ${table}`)
        }
        const [occupied] = await connection.query<RowDataPacket[]>(
          "SELECT id FROM sections WHERE local_active <> 0 LIMIT 1 FOR UPDATE",
        )
        if (occupied.length) throw new Error("Cannot restore with existing local section occupancy")
        const [existingAudit] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM staff_audit_events WHERE action IN (${auditPlaceholders}) LIMIT 1 FOR UPDATE`,
          [...studentAuditActions],
        )
        if (existingAudit.length)
          throw new Error("Cannot restore with existing student audit events")
        for (const table of studentTables) {
          const [columns] = await connection.query<(RowDataPacket & { column_name: string })[]>(
            "SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
            [table],
          )
          const allowed = new Set(columns.map((row) => row.column_name))
          for (const row of backup.tables[table]) {
            const names = Object.keys(row)
            if (names.length !== allowed.size || names.some((name) => !allowed.has(name)))
              throw new Error(`Backup schema mismatch in ${table}`)
            await connection.query(
              `INSERT INTO \`${table}\` (${names.map((name) => mysql.escapeId(name)).join(",")}) VALUES (${names.map(() => "?").join(",")})`,
              names.map((name) => {
                const value = row[name]
                return value !== null && typeof value === "object" ? JSON.stringify(value) : value
              }),
            )
          }
        }
        const [auditColumns] = await connection.query<(RowDataPacket & { column_name: string })[]>(
          "SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_audit_events'",
        )
        const allowedAuditColumns = new Set(auditColumns.map((row) => row.column_name))
        for (const row of backup.studentAuditEvents) {
          const names = Object.keys(row)
          if (
            names.length !== allowedAuditColumns.size ||
            names.some((name) => !allowedAuditColumns.has(name))
          )
            throw new Error("Backup schema mismatch in staff_audit_events")
          await connection.query(
            `INSERT INTO staff_audit_events (${names.map((name) => mysql.escapeId(name)).join(",")}) VALUES (${names.map(() => "?").join(",")})`,
            names.map((name) => {
              const value = row[name]
              return value !== null && typeof value === "object" ? JSON.stringify(value) : value
            }),
          )
        }
        for (const section of backup.sectionCounters) {
          const [result] = await connection.execute<import("mysql2/promise").ResultSetHeader>(
            "UPDATE sections SET local_active = ? WHERE id = ?",
            [section.local_active, section.id],
          )
          if (result.affectedRows !== 1) throw new Error(`Missing section ${section.id}`)
        }
        await setCounts(connection)
        await connection.commit()
        console.log(
          "[student-reset] Backup restored. Previous sessions remain revoked; users must sign in again.",
        )
      }
    } catch (error) {
      await connection.rollback()
      throw error
    }
  } finally {
    await connection.end()
    closeSharedState()
  }
}

if (import.meta.main) await main()
