import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { closeDatabase, pool } from "../db/client"

interface CountRow extends RowDataPacket {
  count: number
}

interface TermRow extends RowDataPacket {
  id: number
}

interface IdRow extends RowDataPacket {
  id: number
}

try {
  const [termRows] = await pool.query<TermRow[]>(
    [
      "SELECT t.id FROM academic_terms t",
      "INNER JOIN app_settings a ON a.`key` = 'current_term_id'",
      "AND t.id = CAST(a.value AS UNSIGNED)",
      "LIMIT 1",
    ].join(" "),
  )
  const termId = termRows[0]?.id
  if (!termId) throw new Error("Current term is not configured")

  await pool.query(
    [
      "INSERT INTO courses (course_code) VALUES ('9999999')",
      "ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP",
    ].join(" "),
  )
  await pool.query(
    [
      "INSERT INTO course_offerings",
      "(term_id, course_code, name_th, name_en, faculty, department, credits,",
      "study_programs, active, source_checksum)",
      "VALUES (?, '9999999', '[ระบบทดสอบ] รายวิชาสำหรับทดสอบโหลด',",
      "'LOAD TEST COURSE', 'ระบบทดสอบ', 'ระบบทดสอบ', 1, JSON_ARRAY('LOAD'),",
      "true, REPEAT('0', 64))",
      "ON DUPLICATE KEY UPDATE name_th = VALUES(name_th), name_en = VALUES(name_en),",
      "active = true, prerequisite_text = NULL",
    ].join(" "),
    [termId],
  )
  const [offeringRows] = await pool.query<IdRow[]>(
    "SELECT id FROM course_offerings WHERE term_id = ? AND course_code = '9999999' LIMIT 1",
    [termId],
  )
  const offeringId = offeringRows[0]?.id
  if (!offeringId) throw new Error("Load-test offering was not created")
  await pool.execute<ResultSetHeader>(
    [
      "INSERT INTO sections",
      "(offering_id, section_no, closed, capacity, baseline_enrolled, local_active,",
      "note, active)",
      "VALUES (?, 'LOAD', false, 1000, 0, 0, 'SYNTHETIC LOAD TEST ONLY', true)",
      "ON DUPLICATE KEY UPDATE closed = false, capacity = 1000,",
      "baseline_enrolled = 0, active = true",
    ].join(" "),
    [offeringId],
  )
  const [sectionRows] = await pool.query<IdRow[]>(
    "SELECT id FROM sections WHERE offering_id = ? AND section_no = 'LOAD' LIMIT 1",
    [offeringId],
  )

  const [rows] = await pool.query<CountRow[]>(
    [
      "SELECT COUNT(*) AS count FROM sections s",
      "INNER JOIN course_offerings o ON o.id = s.offering_id",
      "INNER JOIN app_settings a ON a.`key` = 'current_term_id'",
      "WHERE o.term_id = CAST(a.value AS UNSIGNED)",
      "AND s.active = true AND s.closed = false",
      "AND s.capacity > s.baseline_enrolled + s.local_active",
    ].join(" "),
  )
  const count = Number(rows[0]?.count ?? 0)
  if (count === 0) throw new Error("No open current-term sections are available")
  console.log(
    `[load] ${count} open sections available; synthetic section id ${sectionRows[0]?.id ?? "missing"}`,
  )
} finally {
  await closeDatabase()
}
