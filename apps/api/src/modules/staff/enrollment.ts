import { Elysia, t } from "elysia"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { pool } from "../../db/client"
import { runTransaction } from "../../db/transaction"
import { originIsAllowed } from "../../shared/http"
import { appProblem } from "../../shared/problem"
import { failed, type ServiceResult } from "../registration/service"
import { requireStaff, staffCookieSchema, type StaffCookieJar } from "./auth"

type EnrollmentStatus = "active" | "dropped" | "withdrawn" | "removed"

interface EnrollmentRow extends RowDataPacket {
  id: number
  student_id: string
  term_id: number
  section_id: number
  status: EnrollmentStatus
  course_code: string
  credits: number
}

interface SearchRow extends RowDataPacket {
  registration_id: number
  term_id: number
  academic_year: number
  semester: number
  term_label: string
  course_code: string
  name_th: string
  name_en: string
  section_no: string
  status: EnrollmentStatus
  credits: number
}

interface StudentRow extends RowDataPacket {
  student_id: string
}

export async function searchEnrollments(studentId: string) {
  const [students] = await pool.query<StudentRow[]>(
    "SELECT student_id FROM students WHERE student_id = ? LIMIT 1",
    [studentId],
  )
  if (!students[0]) return null
  const [rows] = await pool.query<SearchRow[]>(
    [
      "SELECT r.id AS registration_id, r.term_id, t.academic_year, t.semester,",
      "t.label AS term_label, r.course_code, o.name_th, o.name_en,",
      "s.section_no, r.status, r.credits",
      "FROM registrations r",
      "JOIN academic_terms t ON t.id = r.term_id",
      "JOIN course_offerings o ON o.id = r.offering_id",
      "JOIN sections s ON s.id = r.section_id",
      "WHERE r.student_id = ? ORDER BY t.academic_year DESC, t.semester DESC, r.course_code",
    ].join(" "),
    [studentId],
  )
  return {
    studentId,
    registrations: rows.map((row) => ({
      registrationId: row.registration_id,
      termId: row.term_id,
      academicYear: row.academic_year,
      semester: row.semester,
      termLabel: row.term_label,
      courseCode: row.course_code,
      nameTh: row.name_th,
      nameEn: row.name_en,
      sectionNo: row.section_no,
      status: row.status,
      credits: Number(row.credits),
    })),
  }
}

type StaffAction = "withdraw" | "remove"

export function enrollmentTransition(status: EnrollmentStatus, action: StaffAction) {
  if (action === "withdraw" && status === "active")
    return { status: "withdrawn" as const, releasesSeat: false }
  if (action === "remove" && (status === "active" || status === "withdrawn"))
    return { status: "removed" as const, releasesSeat: true }
  if (action === "remove" && status === "dropped")
    return { status: "removed" as const, releasesSeat: false }
  return null
}

export async function changeEnrollment(
  registrationId: number,
  action: StaffAction,
  actor: { id: string; username: string },
  reason: string,
  approvalReference?: string,
): Promise<ServiceResult<{ registrationId: number; status: EnrollmentStatus }>> {
  const cleanReason = reason.trim()
  const cleanReference = approvalReference?.trim()
  if (!cleanReason || (action === "withdraw" && !cleanReference)) {
    return failed(
      400,
      "ENROLLMENT_DETAILS_REQUIRED",
      "Details required",
      "Enter a reason and, for withdrawals, an approval reference.",
    )
  }

  // Resolve immutable ownership before entering the transaction. The section is read again
  // after locking the student and term, because it may change during re-registration.
  const [owners] = await pool.query<EnrollmentRow[]>(
    "SELECT id, student_id, term_id FROM registrations WHERE id = ? LIMIT 1",
    [registrationId],
  )
  const owner = owners[0]
  if (!owner)
    return failed(
      404,
      "REGISTRATION_NOT_FOUND",
      "Registration not found",
      "Select an existing registration.",
    )

  return runTransaction<ServiceResult<{ registrationId: number; status: EnrollmentStatus }>>(
    async (tx) => {
      await tx.query("INSERT IGNORE INTO student_term_states (student_id, term_id) VALUES (?, ?)", [
        owner.student_id,
        owner.term_id,
      ])
      await tx.query(
        "SELECT student_id FROM student_term_states WHERE student_id = ? AND term_id = ? FOR UPDATE",
        [owner.student_id, owner.term_id],
      )
      const [current] = await tx.query<EnrollmentRow[]>(
        "SELECT id, student_id, term_id, section_id, status, course_code, credits FROM registrations WHERE id = ? AND student_id = ? AND term_id = ?",
        [registrationId, owner.student_id, owner.term_id],
      )
      const selected = current[0]
      if (!selected)
        return {
          commit: false,
          value: failed(
            404,
            "REGISTRATION_NOT_FOUND",
            "Registration not found",
            "Select an existing registration.",
          ),
        }
      await tx.query("SELECT id FROM sections WHERE id = ? FOR UPDATE", [selected.section_id])
      const [locked] = await tx.query<EnrollmentRow[]>(
        "SELECT id, student_id, term_id, section_id, status, course_code, credits FROM registrations WHERE id = ? AND student_id = ? FOR UPDATE",
        [registrationId, owner.student_id],
      )
      const row = locked[0]
      if (!row || row.section_id !== selected.section_id)
        throw new Error("Enrollment changed while acquiring its locks")
      const transition = enrollmentTransition(row.status, action)
      if (!transition) {
        return {
          commit: false,
          value: failed(
            409,
            "REGISTRATION_NOT_ELIGIBLE",
            "Registration cannot be changed",
            "The registration is no longer eligible for this action.",
          ),
        }
      }

      const { status } = transition
      if (transition.releasesSeat) {
        const [seat] = await tx.query<ResultSetHeader>(
          "UPDATE sections SET local_active = local_active - 1 WHERE id = ? AND local_active > 0",
          [row.section_id],
        )
        if (seat.affectedRows !== 1)
          throw new Error(`Registration ${registrationId} has no counted seat`)
      }
      await tx.query("UPDATE registrations SET status = ? WHERE id = ?", [status, registrationId])
      const snapshot = {
        operation: action === "withdraw" ? "admin_withdrawal" : "admin_removal",
        actor: { id: actor.id, username: actor.username },
        reason: cleanReason,
        ...(cleanReference ? { approvalReference: cleanReference } : {}),
        previousStatus: row.status,
        studentId: row.student_id,
        termId: row.term_id,
        courseCode: row.course_code,
        sectionId: row.section_id,
        credits: Number(row.credits),
        createdAt: new Date().toISOString(),
      }
      await tx.query(
        "INSERT INTO registration_events (registration_id, student_id, action, snapshot) VALUES (?, ?, ?, ?)",
        [registrationId, row.student_id, status, JSON.stringify(snapshot)],
      )
      return { commit: true, value: { ok: true, data: { registrationId, status } } }
    },
  )
}

const resultResponse = <T>(request: Request, result: ServiceResult<T>) =>
  result.ok
    ? { data: result.data }
    : appProblem(request, result.status, result.code, result.title, result.detail, result.details)

export const staffEnrollmentModule = new Elysia({ name: "staff-enrollment" })
  .get(
    "/api/v1/staff/enrollments",
    {
      cookie: staffCookieSchema,
      query: t.Object({ studentId: t.String({ pattern: "^[0-9]{10}$" }) }),
    },
    async ({ cookie, request, query }) => {
      const actor = await requireStaff(cookie as StaffCookieJar, request, "admin")
      if (actor instanceof Response) return actor
      const result = await searchEnrollments(query.studentId)
      return result
        ? { data: result }
        : appProblem(
            request,
            404,
            "STUDENT_NOT_FOUND",
            "Student not found",
            "Check the student ID and try again.",
          )
    },
  )
  .post(
    "/api/v1/staff/enrollments/:id/withdraw",
    {
      cookie: staffCookieSchema,
      params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
      body: t.Object({
        reason: t.String({ minLength: 1, maxLength: 1000 }),
        approvalReference: t.String({ minLength: 1, maxLength: 255 }),
      }),
    },
    async ({ cookie, request, params, body }) => {
      const actor = await requireStaff(cookie as StaffCookieJar, request, "admin")
      if (actor instanceof Response) return actor
      if (!originIsAllowed(request))
        return appProblem(
          request,
          400,
          "ORIGIN_NOT_ALLOWED",
          "Origin not allowed",
          "The request origin is not allowed.",
        )
      return resultResponse(
        request,
        await changeEnrollment(params.id, "withdraw", actor, body.reason, body.approvalReference),
      )
    },
  )
  .post(
    "/api/v1/staff/enrollments/:id/remove",
    {
      cookie: staffCookieSchema,
      params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
      body: t.Object({ reason: t.String({ minLength: 1, maxLength: 1000 }) }),
    },
    async ({ cookie, request, params, body }) => {
      const actor = await requireStaff(cookie as StaffCookieJar, request, "admin")
      if (actor instanceof Response) return actor
      if (!originIsAllowed(request))
        return appProblem(
          request,
          400,
          "ORIGIN_NOT_ALLOWED",
          "Origin not allowed",
          "The request origin is not allowed.",
        )
      return resultResponse(
        request,
        await changeEnrollment(params.id, "remove", actor, body.reason),
      )
    },
  )
