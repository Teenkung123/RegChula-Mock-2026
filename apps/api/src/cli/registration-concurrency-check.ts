import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { ensureStudent } from "../modules/auth/service"
import { commitRegistration, registrationPreview } from "../modules/registration/service"
import { config } from "../config"
import { closeDatabase, pool } from "../db/client"

interface CountRow extends RowDataPacket {
  total: number
}

interface IdRow extends RowDataPacket {
  id: number
}

const database = new URL(config.databaseUrl)
if (
  config.appEnv !== "development" ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  database.port !== "3307"
) {
  throw new Error("Concurrency check requires development mode and local MySQL port 3307")
}

const courseCode = "9999998"
const suffix = crypto.randomUUID().slice(0, 8)
const students = [`seat-a-${suffix}`, `seat-b-${suffix}`]
let courseCreated = false
let offeringId: number | null = null
let sectionId: number | null = null

function tokenOf(result: Awaited<ReturnType<typeof registrationPreview>>): string {
  if (!result.ok) throw new Error(`Preview failed: ${result.code}`)
  const token = (result.data as { confirmationToken?: unknown }).confirmationToken
  if (typeof token !== "string") throw new Error("Preview did not return a confirmation token")
  return token
}

try {
  const [existingCourse] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM courses WHERE course_code = ?",
    [courseCode],
  )
  if (Number(existingCourse[0]?.total ?? 0) !== 0) {
    throw new Error(`Reserved concurrency-test course ${courseCode} already exists`)
  }
  const [termRows] = await pool.query<IdRow[]>(
    [
      "SELECT t.id FROM academic_terms t",
      "INNER JOIN app_settings a ON a.`key` = 'current_term_id'",
      "AND t.id = CAST(a.value AS UNSIGNED)",
      "LIMIT 1",
    ].join(" "),
  )
  const termId = termRows[0]?.id
  if (!termId) throw new Error("Current term is not configured")

  await pool.query("INSERT INTO courses (course_code) VALUES (?)", [courseCode])
  courseCreated = true
  const [offering] = await pool.execute<ResultSetHeader>(
    [
      "INSERT INTO course_offerings",
      "(term_id, course_code, name_th, name_en, faculty, department, credits,",
      "study_programs, active, source_checksum)",
      "VALUES (?, ?, '[ทดสอบ] การแข่งขันที่นั่งสุดท้าย', 'FINAL SEAT RACE TEST',",
      "'TEST', 'TEST', 1, JSON_ARRAY('TEST'), true, REPEAT('8', 64))",
    ].join(" "),
    [termId, courseCode],
  )
  offeringId = offering.insertId
  const [section] = await pool.execute<ResultSetHeader>(
    [
      "INSERT INTO sections",
      "(offering_id, section_no, closed, capacity, baseline_enrolled, local_active, active)",
      "VALUES (?, 'RACE', false, 1, 0, 0, true)",
    ].join(" "),
    [offeringId],
  )
  sectionId = section.insertId
  await Promise.all(students.map(ensureStudent))

  const tokens = await Promise.all(
    students.map(async (studentId) =>
      tokenOf(await registrationPreview(studentId, sectionId as number, true)),
    ),
  )
  const results = await Promise.all(
    students.map((studentId, index) =>
      commitRegistration(studentId, tokens[index] as string, `seat-race-${suffix}-${index}`),
    ),
  )
  const successes = results.filter((result) => result.ok)
  const fullRejections = results.filter((result) => !result.ok && result.code === "SECTION_FULL")
  const [sectionRows] = await pool.query<Array<RowDataPacket & { local_active: number }>>(
    "SELECT local_active FROM sections WHERE id = ?",
    [sectionId],
  )
  const [registrationRows] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM registrations WHERE student_id IN (?, ?) AND status = 'active'",
    students,
  )
  if (
    successes.length !== 1 ||
    fullRejections.length !== 1 ||
    Number(sectionRows[0]?.local_active ?? -1) !== 1 ||
    Number(registrationRows[0]?.total ?? -1) !== 1
  ) {
    throw new Error("Final-seat concurrency invariant failed")
  }
  const successfulIndex = results.findIndex((result) => result.ok)
  const firstSuccess = results[successfulIndex]
  const replay = await commitRegistration(
    students[successfulIndex] as string,
    tokens[successfulIndex] as string,
    `seat-race-recovery-${suffix}`,
  )
  if (
    !firstSuccess?.ok ||
    !replay.ok ||
    replay.data.registrationId !== firstSuccess.data.registrationId
  ) {
    throw new Error("Ambiguous-response recovery with a fresh idempotency key failed")
  }
  console.log("[concurrency] Exactly one final-seat registration succeeded; the other was rejected")
  console.log(
    "[concurrency] The successful confirmation replayed through a fresh key without a second write",
  )
} finally {
  await pool.query(
    [
      "DELETE e FROM registration_events e",
      "INNER JOIN registrations r ON r.id = e.registration_id",
      "WHERE r.student_id IN (?, ?)",
    ].join(" "),
    students,
  )
  await pool.query("DELETE FROM idempotency_records WHERE student_id IN (?, ?)", students)
  await pool.query("DELETE FROM registrations WHERE student_id IN (?, ?)", students)
  await pool.query("DELETE FROM student_term_states WHERE student_id IN (?, ?)", students)
  await pool.query("DELETE FROM student_preferences WHERE student_id IN (?, ?)", students)
  await pool.query("DELETE FROM students WHERE student_id IN (?, ?)", students)
  await pool.query(
    "UPDATE mock_auth_state SET student_count = (SELECT COUNT(*) FROM students) WHERE id = 1",
  )
  await pool.query(
    [
      "UPDATE mock_auth_shards s SET student_count = (",
      "SELECT COUNT(*) FROM students",
      "WHERE CONV(SUBSTRING(SHA2(student_id, 256), 1, 2), 16, 10) = s.shard_id)",
    ].join(" "),
  )
  if (sectionId !== null) await pool.query("DELETE FROM sections WHERE id = ?", [sectionId])
  if (offeringId !== null) {
    await pool.query("DELETE FROM course_offerings WHERE id = ?", [offeringId])
  }
  if (courseCreated) await pool.query("DELETE FROM courses WHERE course_code = ?", [courseCode])
  await closeDatabase()
}
