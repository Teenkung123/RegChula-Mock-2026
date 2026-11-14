import { randomBytes } from "node:crypto"
import { Elysia, t } from "elysia"
import type { RowDataPacket } from "mysql2/promise"
import { pool } from "../../db/client"
import { runTransaction } from "../../db/transaction"
import { originIsAllowed } from "../../shared/http"
import { appProblem } from "../../shared/problem"
import { registrationCycle } from "../registration/access"
import { decryptRegistrationCode, encryptRegistrationCode } from "../registration/code-crypto"
import { requireStaff, staffCookieSchema, type StaffCookieJar } from "./auth"

interface TermRow extends RowDataPacket { id: number; academic_year: number; semester: number }
interface StudentRow extends RowDataPacket {
  student_id: string
  first_term_id: number | null
  academic_level: "undergraduate" | "graduate" | null
  encrypted_code: string | null
}
interface CodeRow extends RowDataPacket { encrypted_code: string }

const problem = (request: Request, status: number, code: string, detail: string) =>
  appProblem(request, status, code, "ดำเนินการไม่ได้", detail)
const badOrigin = (request: Request) =>
  originIsAllowed(request) ? null : problem(request, 400, "ORIGIN_NOT_ALLOWED", "คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต")

async function findTerm(id: number) {
  const [rows] = await pool.query<TermRow[]>("SELECT id, academic_year, semester FROM academic_terms WHERE id = ?", [id])
  return rows[0]
}

export const staffCodesModule = new Elysia({ name: "staff-registration-codes" })
  .get("/api/v1/staff/advisor-codes", {
    cookie: staffCookieSchema,
    query: t.Object({ termId: t.Numeric({ minimum: 1 }) }),
  }, async ({ cookie, request, query, set }) => {
    set.headers["cache-control"] = "no-store"
    const actor = await requireStaff(cookie as StaffCookieJar, request)
    if (actor instanceof Response) return actor
    const term = await findTerm(query.termId)
    if (!term) return problem(request, 404, "TERM_NOT_FOUND", "ไม่พบภาคการศึกษา")
    const cycle = registrationCycle(term.academic_year, term.semester)
    const [rows] = await pool.query<StudentRow[]>(
      `SELECT s.student_id, p.first_term_id, p.academic_level, c.encrypted_code
       FROM students s
       LEFT JOIN student_advisors a ON a.student_id = s.student_id
       LEFT JOIN student_registration_profiles p ON p.student_id = s.student_id
       LEFT JOIN registration_access_codes c ON c.student_id = s.student_id AND c.cycle_year = ? AND c.cycle_kind = ?
       WHERE (? = 'admin' OR a.staff_id = ?) ORDER BY s.student_id`,
      [cycle.year, cycle.kind, actor.role, actor.id],
    )
    return { data: { termId: term.id, students: rows.map((row) => ({
      studentId: row.student_id, firstTermId: row.first_term_id, academicLevel: row.academic_level,
      code: row.encrypted_code ? decryptRegistrationCode(row.encrypted_code) : null,
    })) } }
  })
  .post("/api/v1/staff/advisor-codes/:studentId", {
    cookie: staffCookieSchema,
    params: t.Object({ studentId: t.String({ pattern: "^[0-9]{10}$" }) }),
    body: t.Object({ termId: t.Numeric({ minimum: 1 }), rotate: t.Boolean() }),
  }, async ({ cookie, request, params, body, set }) => {
    set.headers["cache-control"] = "no-store"
    const actor = await requireStaff(cookie as StaffCookieJar, request)
    if (actor instanceof Response) return actor
    const origin = badOrigin(request)
    if (origin) return origin
    const term = await findTerm(body.termId)
    if (!term) return problem(request, 404, "TERM_NOT_FOUND", "ไม่พบภาคการศึกษา")
    const cycle = registrationCycle(term.academic_year, term.semester)
    const result = await runTransaction(async (tx) => {
      const [students] = await tx.query<StudentRow[]>(
        `SELECT s.student_id, p.first_term_id, p.academic_level, NULL AS encrypted_code
         FROM students s LEFT JOIN student_advisors a ON a.student_id = s.student_id
         JOIN student_registration_profiles p ON p.student_id = s.student_id
         WHERE s.student_id = ? AND (? = 'admin' OR a.staff_id = ?) FOR UPDATE`,
        [params.studentId, actor.role, actor.id],
      )
      if (!students[0]) return { commit: false, value: null }
      const [codes] = await tx.query<CodeRow[]>(
        "SELECT encrypted_code FROM registration_access_codes WHERE student_id = ? AND cycle_year = ? AND cycle_kind = ? FOR UPDATE",
        [params.studentId, cycle.year, cycle.kind],
      )
      if (codes[0] && !body.rotate) return { commit: false, value: decryptRegistrationCode(codes[0].encrypted_code) }
      const code = randomBytes(9).toString("base64url")
      await tx.query(
        `INSERT INTO registration_access_codes (student_id, cycle_year, cycle_kind, encrypted_code, version, updated_by)
         VALUES (?, ?, ?, ?, 1, ?) ON DUPLICATE KEY UPDATE encrypted_code = VALUES(encrypted_code), version = version + 1, updated_by = VALUES(updated_by)`,
        [params.studentId, cycle.year, cycle.kind, encryptRegistrationCode(code), actor.id],
      )
      await tx.query(
        "INSERT INTO staff_audit_events (staff_id, action, target, details) VALUES (?, ?, ?, ?)",
        [actor.id, codes[0] ? "registration_code_rotated" : "registration_code_issued", params.studentId,
          JSON.stringify({ termId: term.id, cycleYear: cycle.year, cycleKind: cycle.kind })],
      )
      return { commit: true, value: code }
    })
    if (!result) return problem(request, 404, "STUDENT_NOT_FOUND", "ไม่พบนิสิตหรือข้อมูลอาจารย์ที่ปรึกษา")
    return { data: { studentId: params.studentId, termId: term.id, code: result } }
  })
  .put("/api/v1/staff/students/:studentId/registration-profile", {
    cookie: staffCookieSchema,
    params: t.Object({ studentId: t.String({ pattern: "^[0-9]{10}$" }) }),
    body: t.Object({ firstTermId: t.Numeric({ minimum: 1 }), academicLevel: t.Union([t.Literal("undergraduate"), t.Literal("graduate")]) }),
  }, async ({ cookie, request, params, body }) => {
    const actor = await requireStaff(cookie as StaffCookieJar, request, "admin")
    if (actor instanceof Response) return actor
    const origin = badOrigin(request)
    if (origin) return origin
    const [students] = await pool.query<StudentRow[]>("SELECT student_id FROM students WHERE student_id = ?", [params.studentId])
    if (!students[0]) return problem(request, 404, "STUDENT_NOT_FOUND", "ไม่พบนิสิต")
    if (!(await findTerm(body.firstTermId))) return problem(request, 404, "TERM_NOT_FOUND", "ไม่พบภาคการศึกษา")
    await runTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO student_registration_profiles (student_id, first_term_id, academic_level) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE first_term_id = VALUES(first_term_id), academic_level = VALUES(academic_level)`,
        [params.studentId, body.firstTermId, body.academicLevel],
      )
      await tx.query("DELETE FROM registration_access_grants WHERE student_id = ?", [params.studentId])
      await tx.query(
        "INSERT INTO staff_audit_events (staff_id, action, target, details) VALUES (?, 'registration_profile_updated', ?, ?)",
        [actor.id, params.studentId, JSON.stringify(body)],
      )
      return { commit: true, value: undefined }
    })
    return { data: { studentId: params.studentId, ...body } }
  })
