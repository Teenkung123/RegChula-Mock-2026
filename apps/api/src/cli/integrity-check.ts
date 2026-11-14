import type { RowDataPacket } from "mysql2/promise"
import { closeDatabase, pool } from "../db/client"

interface ViolationRow extends RowDataPacket {
  violations: number
}

interface WarningRow extends RowDataPacket {
  warnings: number
}

try {
  const [seatRows] = await pool.query<ViolationRow[]>(
    [
      "SELECT COUNT(*) AS violations FROM sections s",
      "LEFT JOIN (",
      "SELECT section_id, COUNT(*) AS occupied",
      "FROM registrations WHERE status IN ('active', 'withdrawn') GROUP BY section_id",
      ") r ON r.section_id = s.id",
      "WHERE s.local_active <> COALESCE(r.occupied, 0)",
    ].join(" "),
  )
  const [duplicateRows] = await pool.query<ViolationRow[]>(
    [
      "SELECT COUNT(*) AS violations FROM (",
      "SELECT student_id, term_id, course_code, COUNT(*) AS total",
      "FROM registrations WHERE status IN ('active', 'withdrawn')",
      "GROUP BY student_id, term_id, course_code HAVING total > 1",
      ") duplicates",
    ].join(" "),
  )
  const violations =
    Number(seatRows[0]?.violations ?? 0) + Number(duplicateRows[0]?.violations ?? 0)
  if (violations > 0) throw new Error(`Registration integrity failed: ${violations} violations`)
  const [warningRows] = await pool.query<WarningRow[]>(
    "SELECT COUNT(*) AS warnings FROM sections WHERE baseline_enrolled + local_active > capacity",
  )
  const warnings = Number(warningRows[0]?.warnings ?? 0)
  console.log("[integrity] Seat and duplicate-registration invariants passed")
  if (warnings > 0) {
    console.log(
      `[integrity] ${warnings} sections exceed their current capacity and cannot accept new registrations`,
    )
  }
} finally {
  await closeDatabase()
}
