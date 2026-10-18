import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { config } from "../config"
import { closeDatabase, pool } from "../db/client"

const studentPrefix = "bench-global-"
const studentPattern = `${studentPrefix}%`
const courseCodes = ["9999901", "9999902", "9999903", "9999904"] as const
const sourceChecksum = "b".repeat(64)
const pdfStudentId = `${studentPrefix}pdf`
const pdfFormId = "00000000-0000-4000-8000-000000000901"

interface IdRow extends RowDataPacket {
  id: number
}

interface CourseCodeRow extends RowDataPacket {
  course_code: string
}

interface SectionCountRow extends RowDataPacket {
  section_id: number
  total: number
}

const database = new URL(config.databaseUrl)
if (
  config.appEnv !== "development" ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  database.port !== "3307"
) {
  throw new Error("Global benchmark fixtures require development mode and local MySQL port 3307")
}

async function withTransaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await operation(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function cleanup(connection: PoolConnection): Promise<{ students: number; offerings: number }> {
  const [occupied] = await connection.query<SectionCountRow[]>(
    [
      "SELECT section_id, COUNT(*) AS total FROM registrations",
      "WHERE student_id LIKE ? AND status IN ('active', 'withdrawn')",
      "GROUP BY section_id ORDER BY section_id FOR UPDATE",
    ].join(" "),
    [studentPattern],
  )
  for (const row of occupied) {
    await connection.query(
      "UPDATE sections SET local_active = GREATEST(local_active - ?, 0) WHERE id = ?",
      [Number(row.total), row.section_id],
    )
  }

  await connection.query("DELETE FROM withdrawal_requests WHERE student_id LIKE ?", [studentPattern])
  await connection.query(
    [
      "DELETE e FROM registration_events e",
      "INNER JOIN registrations r ON r.id = e.registration_id",
      "WHERE r.student_id LIKE ?",
    ].join(" "),
    [studentPattern],
  )
  await connection.query("DELETE FROM idempotency_records WHERE student_id LIKE ?", [studentPattern])
  await connection.query("DELETE FROM student_schedule_colors WHERE student_id LIKE ?", [studentPattern])
  await connection.query("DELETE FROM registrations WHERE student_id LIKE ?", [studentPattern])
  await connection.query("DELETE FROM student_completed_courses WHERE student_id LIKE ?", [studentPattern])
  await connection.query("DELETE FROM student_term_states WHERE student_id LIKE ?", [studentPattern])
  await connection.query("DELETE FROM student_preferences WHERE student_id LIKE ?", [studentPattern])
  const [studentDelete] = await connection.execute<ResultSetHeader>(
    "DELETE FROM students WHERE student_id LIKE ?",
    [studentPattern],
  )

  const placeholders = courseCodes.map(() => "?").join(",")
  const [ownedOfferings] = await connection.query<Array<IdRow & CourseCodeRow>>(
    [
      "SELECT id, course_code FROM course_offerings",
      `WHERE course_code IN (${placeholders}) AND source_checksum = ?`,
      "FOR UPDATE",
    ].join(" "),
    [...courseCodes, sourceChecksum],
  )
  if (ownedOfferings.length > 0) {
    const offeringPlaceholders = ownedOfferings.map(() => "?").join(",")
    const offeringIds = ownedOfferings.map((row) => row.id)
    await connection.query(
      `DELETE FROM section_meetings WHERE section_id IN (SELECT id FROM sections WHERE offering_id IN (${offeringPlaceholders}))`,
      offeringIds,
    )
    await connection.query(
      `DELETE FROM sections WHERE offering_id IN (${offeringPlaceholders})`,
      offeringIds,
    )
    await connection.query(
      `DELETE FROM course_offerings WHERE id IN (${offeringPlaceholders})`,
      offeringIds,
    )
    for (const courseCode of new Set(ownedOfferings.map((row) => row.course_code))) {
      await connection.query(
        "DELETE FROM courses WHERE course_code = ? AND NOT EXISTS (SELECT 1 FROM course_offerings WHERE course_code = ?)",
        [courseCode, courseCode],
      )
    }
  }
  return { students: studentDelete.affectedRows, offerings: ownedOfferings.length }
}

async function prepare(connection: PoolConnection) {
  await cleanup(connection)
  const placeholders = courseCodes.map(() => "?").join(",")
  const [collisions] = await connection.query<CourseCodeRow[]>(
    `SELECT course_code FROM courses WHERE course_code IN (${placeholders})`,
    [...courseCodes],
  )
  if (collisions.length > 0) {
    throw new Error(`Reserved benchmark course already exists: ${collisions.map((row) => row.course_code).join(", ")}`)
  }
  const [terms] = await connection.query<IdRow[]>(
    [
      "SELECT t.id FROM academic_terms t",
      "INNER JOIN app_settings a ON a.`key` = 'current_term_id'",
      "AND t.id = CAST(a.value AS UNSIGNED)",
      "LIMIT 1",
    ].join(" "),
  )
  const termId = terms[0]?.id
  if (!termId) throw new Error("Current term is not configured")

  const sections: Array<{ courseCode: string; sectionId: number }> = []
  for (const [index, courseCode] of courseCodes.entries()) {
    await connection.query("INSERT INTO courses (course_code) VALUES (?)", [courseCode])
    const [offering] = await connection.execute<ResultSetHeader>(
      [
        "INSERT INTO course_offerings",
        "(term_id, course_code, name_th, name_en, faculty, department, credits,",
        "study_programs, active, source_checksum)",
        "VALUES (?, ?, ?, ?, 'BENCHMARK', 'BENCHMARK', 1, JSON_ARRAY('BENCHMARK'), true, ?)",
      ].join(" "),
      [
        termId,
        courseCode,
        `[ทดสอบสมรรถนะ] รายวิชา ${index + 1}`,
        `GLOBAL BENCHMARK COURSE ${index + 1}`,
        sourceChecksum,
      ],
    )
    const [section] = await connection.execute<ResultSetHeader>(
      [
        "INSERT INTO sections",
        "(offering_id, section_no, closed, capacity, baseline_enrolled, local_active, note, active)",
        "VALUES (?, 'BENCH', false, 100000, 0, 0, 'GLOBAL BENCHMARK ONLY', true)",
      ].join(" "),
      [offering.insertId],
    )
    sections.push({ courseCode, sectionId: section.insertId })
  }

  await connection.query("INSERT INTO students (student_id) VALUES (?)", [pdfStudentId])
  await connection.query("INSERT INTO student_preferences (student_id) VALUES (?)", [pdfStudentId])
  await connection.query("INSERT INTO student_term_states (student_id, term_id) VALUES (?, ?)", [
    pdfStudentId,
    termId,
  ])
  const [registration] = await connection.execute<ResultSetHeader>(
    [
      "INSERT INTO registrations",
      "(student_id, term_id, course_code, offering_id, section_id, status, credits)",
      "SELECT ?, ?, o.course_code, o.id, s.id, 'active', o.credits",
      "FROM course_offerings o INNER JOIN sections s ON s.offering_id = o.id",
      "WHERE o.course_code = ? AND o.source_checksum = ? LIMIT 1",
    ].join(" "),
    [pdfStudentId, termId, courseCodes[0], sourceChecksum],
  )
  await connection.query("UPDATE sections SET local_active = local_active + 1 WHERE id = ?", [
    sections[0]?.sectionId,
  ])
  const snapshot = {
    studentId: pdfStudentId,
    term: { academicYear: 2569, semester: 1, label: "Benchmark" },
    courses: [
      {
        courseCode: courseCodes[0],
        nameTh: "รายวิชาทดสอบสมรรถนะ",
        nameEn: "GLOBAL BENCHMARK COURSE",
        credits: 1,
        sectionNo: "BENCH",
        reason: "Benchmark saved PDF read path",
        meetings: [],
        instructors: [],
      },
    ],
    createdAt: new Date().toISOString(),
    submissionStatus: "pending-faculty-review",
  }
  await connection.query(
    [
      "INSERT INTO withdrawal_requests",
      "(id, registration_id, student_id, term_id, snapshot, template_version)",
      "VALUES (?, ?, ?, ?, ?, 'cr48-v1')",
    ].join(" "),
    [pdfFormId, registration.insertId, pdfStudentId, termId, JSON.stringify(snapshot)],
  )
  return { termId, sections, pdfStudentId, pdfFormId }
}

const command = process.argv[2]
try {
  if (command === "prepare") {
    const result = await withTransaction(prepare)
    console.log(`[benchmark] Prepared ${result.sections.length} courses for term ${result.termId}`)
    console.log(`[benchmark] Saved PDF fixture ${result.pdfFormId}`)
  } else if (command === "cleanup") {
    const result = await withTransaction(cleanup)
    console.log(`[benchmark] Removed ${result.students} benchmark students and ${result.offerings} offerings`)
  } else {
    throw new Error("Usage: benchmark-fixture.ts prepare|cleanup")
  }
} finally {
  await closeDatabase()
}
