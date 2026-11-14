import { Elysia, t } from "elysia"
import type { PoolConnection, RowDataPacket } from "mysql2/promise"
import { runTransaction, type TransactionDecision } from "../../db/transaction"
import { appProblem } from "../../shared/problem"
import { revokeStudentSessions } from "../../shared/session-store"
import { requireStaff, type StaffCookieJar, staffCookieSchema } from "./auth"

export interface StudentEditorInput {
  advisorId: string | null
  firstTermId: number
  academicLevel: "undergraduate" | "graduate"
  active?: boolean
}

interface CredentialRow extends RowDataPacket {
  active: number
}
interface ProfileRow extends RowDataPacket {
  first_term_id: number
  academic_level: StudentEditorInput["academicLevel"]
}
interface AdvisorRow extends RowDataPacket {
  staff_id: string
}

type StudentEditorResult =
  | {
      ok: true
      data: Omit<StudentEditorInput, "active"> & { studentId: string; active: boolean | null }
    }
  | { ok: false; code: "STUDENT_NOT_FOUND" | "TERM_NOT_FOUND" | "ADVISOR_NOT_FOUND" }

/** Run only inside a transaction: validate every reference before making any changes. */
export async function writeStudentEditor(
  connection: PoolConnection,
  studentId: string,
  input: StudentEditorInput,
  staffId: string,
): Promise<TransactionDecision<StudentEditorResult>> {
  const rejected = (code: Extract<StudentEditorResult, { ok: false }>["code"]) =>
    ({ commit: false, value: { ok: false, code } }) as const

  // Login and password resets take credentials before sessions or the student row.
  const [credentials] = await connection.query<CredentialRow[]>(
    "SELECT active FROM student_credentials WHERE student_id = ? FOR UPDATE",
    [studentId],
  )
  const [students] = await connection.query<RowDataPacket[]>(
    "SELECT student_id FROM students WHERE student_id = ? FOR SHARE",
    [studentId],
  )
  if (!students[0] || (input.active !== undefined && !credentials[0]))
    return rejected("STUDENT_NOT_FOUND")
  const [terms] = await connection.query<RowDataPacket[]>(
    "SELECT id FROM academic_terms WHERE id = ? FOR SHARE",
    [input.firstTermId],
  )
  if (!terms[0]) return rejected("TERM_NOT_FOUND")

  // Match registration access: term, profile/advisor, then codes, then grants.
  // The student share lock also serializes with the code issuer's student update lock.
  const [profiles] = await connection.query<ProfileRow[]>(
    "SELECT first_term_id, academic_level FROM student_registration_profiles WHERE student_id = ? FOR UPDATE",
    [studentId],
  )
  const [advisors] = await connection.query<AdvisorRow[]>(
    "SELECT staff_id FROM student_advisors WHERE student_id = ? FOR UPDATE",
    [studentId],
  )
  if (input.advisorId !== null) {
    const [staff] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM staff_users WHERE id = ? AND role = 'advisor' AND active = true FOR SHARE",
      [input.advisorId],
    )
    if (!staff[0]) return rejected("ADVISOR_NOT_FOUND")
  }

  const profileChanged =
    profiles[0]?.first_term_id !== input.firstTermId ||
    profiles[0]?.academic_level !== input.academicLevel
  const advisorChanged = (advisors[0]?.staff_id ?? null) !== input.advisorId
  const activeChanged =
    input.active !== undefined && Boolean(credentials[0]?.active) !== input.active
  if (advisorChanged)
    await connection.execute("DELETE FROM registration_access_codes WHERE student_id = ?", [
      studentId,
    ])
  if (profileChanged || advisorChanged)
    await connection.execute("DELETE FROM registration_access_grants WHERE student_id = ?", [
      studentId,
    ])
  if (profileChanged)
    await connection.execute(
      `INSERT INTO student_registration_profiles (student_id, first_term_id, academic_level) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE first_term_id = VALUES(first_term_id), academic_level = VALUES(academic_level)`,
      [studentId, input.firstTermId, input.academicLevel],
    )
  if (advisorChanged) {
    if (input.advisorId === null)
      await connection.execute("DELETE FROM student_advisors WHERE student_id = ?", [studentId])
    else
      await connection.execute(
        `INSERT INTO student_advisors (student_id, staff_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE staff_id = VALUES(staff_id)`,
        [studentId, input.advisorId],
      )
  }
  if (activeChanged && input.active !== undefined) {
    await connection.execute("UPDATE student_credentials SET active = ? WHERE student_id = ?", [
      input.active,
      studentId,
    ])
  }

  const audit = (action: string, details: Record<string, unknown>) =>
    connection.execute(
      "INSERT INTO staff_audit_events (staff_id, action, target, details) VALUES (?, ?, ?, ?)",
      [staffId, action, studentId, JSON.stringify(details)],
    )
  if (advisorChanged) await audit("advisor.assigned", { advisorId: input.advisorId })
  if (profileChanged)
    await audit("registration_profile_updated", {
      firstTermId: input.firstTermId,
      academicLevel: input.academicLevel,
    })
  if (activeChanged) await audit("student.updated", { active: input.active, passwordReset: false })
  if (activeChanged && input.active === false) await revokeStudentSessions(connection, studentId)

  return {
    commit: true,
    value: {
      ok: true,
      data: {
        studentId,
        advisorId: input.advisorId,
        firstTermId: input.firstTermId,
        academicLevel: input.academicLevel,
        active: input.active ?? (credentials[0] ? Boolean(credentials[0].active) : null),
      },
    },
  }
}

export const staffStudentEditorModule = new Elysia({ name: "staff-student-editor" }).put(
  "/api/v1/staff/students/:studentId/editor",
  {
    cookie: staffCookieSchema,
    params: t.Object({ studentId: t.String({ pattern: "^[0-9]{10}$" }) }),
    body: t.Object({
      advisorId: t.Union([t.String({ minLength: 36, maxLength: 36 }), t.Null()]),
      firstTermId: t.Integer({ minimum: 1 }),
      academicLevel: t.Union([t.Literal("undergraduate"), t.Literal("graduate")]),
      active: t.Optional(t.Boolean()),
    }),
  },
  async ({ cookie, request, params, body, set }) => {
    set.headers["cache-control"] = "no-store"
    const actor = await requireStaff(cookie as StaffCookieJar, request, "admin")
    if (actor instanceof Response) return actor
    const result = await runTransaction((connection) =>
      writeStudentEditor(connection, params.studentId, body, actor.id),
    )
    if (result.ok) return { data: result.data }
    const failures = {
      STUDENT_NOT_FOUND: ["Student not found", "Select an existing student account."],
      TERM_NOT_FOUND: ["Term not found", "Select an existing first term."],
      ADVISOR_NOT_FOUND: ["Advisor not found", "Select an active advisor."],
    } as const
    const [title, detail] = failures[result.code]
    return appProblem(request, 404, result.code, title, detail)
  },
)
