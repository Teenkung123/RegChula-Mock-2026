import type { PoolConnection, RowDataPacket } from "mysql2/promise"
import { matchesRegistrationCode } from "./code-crypto"
import { getCurrentTerm } from "./queries"

export type RegistrationAccessStatus = "open" | "code_required" | "profile_required" | "closed"
export interface RegistrationAccess {
  termId: number | null
  status: RegistrationAccessStatus
  authorized: boolean
}

export function registrationCycle(academicYear: number, semester: number) {
  return semester === 2
    ? { year: academicYear, kind: "second" as const }
    : { year: semester === 1 ? academicYear - 1 : academicYear, kind: "summer_first" as const }
}

interface AccessRow extends RowDataPacket {
  academic_year: number
  semester: number
  is_open: number
  first_term_id: number | null
  academic_level: "undergraduate" | "graduate" | null
  staff_id: string | null
}
interface CodeRow extends RowDataPacket { version: number; encrypted_code: string }
interface GrantRow extends RowDataPacket { code_version: number }

// The locked variant is used inside confirmation transactions so rotation, profile and
// window updates cannot race the final authorization check.
export async function registrationAccess(
  connection: PoolConnection,
  studentId: string,
  requestedTermId?: number,
  lock = false,
): Promise<RegistrationAccess> {
  // Locking reads see the latest committed term even if another query established
  // an older repeatable-read snapshot earlier in the transaction.
  const current = await getCurrentTerm(connection, lock)
  if (!current || (requestedTermId !== undefined && requestedTermId !== current.id)) {
    return { termId: current?.id ?? null, status: "closed", authorized: false }
  }
  const suffix = lock ? " FOR SHARE" : ""
  const [terms] = await connection.query<AccessRow[]>(
    `SELECT t.academic_year, t.semester,
      (w.opens_at <= UTC_TIMESTAMP(3) AND w.closes_at > UTC_TIMESTAMP(3)) AS is_open,
      p.first_term_id, p.academic_level, a.staff_id
     FROM academic_terms t
     LEFT JOIN term_registration_windows w ON w.term_id = t.id
     LEFT JOIN student_registration_profiles p ON p.student_id = ?
     LEFT JOIN student_advisors a ON a.student_id = ?
     WHERE t.id = ?${suffix}`,
    [studentId, studentId, current.id],
  )
  const term = terms[0]
  if (!term?.is_open) return { termId: current.id, status: "closed", authorized: false }
  if (!term.first_term_id || !term.academic_level || !term.staff_id) {
    return { termId: current.id, status: "profile_required", authorized: false }
  }
  if (term.academic_level === "graduate" || term.first_term_id === current.id) {
    return { termId: current.id, status: "open", authorized: true }
  }
  const cycle = registrationCycle(term.academic_year, term.semester)
  const [codes] = await connection.query<CodeRow[]>(
    `SELECT version, encrypted_code FROM registration_access_codes WHERE student_id = ? AND cycle_year = ? AND cycle_kind = ?${suffix}`,
    [studentId, cycle.year, cycle.kind],
  )
  const [grants] = await connection.query<GrantRow[]>(
    `SELECT code_version FROM registration_access_grants WHERE student_id = ? AND term_id = ? AND cycle_year = ? AND cycle_kind = ?${lock ? " FOR UPDATE" : ""}`,
    [studentId, current.id, cycle.year, cycle.kind],
  )
  const authorized = !!codes[0] && grants[0]?.code_version === codes[0].version
  return { termId: current.id, status: authorized ? "open" : "code_required", authorized }
}

export async function grantRegistrationAccess(connection: PoolConnection, studentId: string, code: string) {
  const access = await registrationAccess(connection, studentId, undefined, true)
  if (access.status !== "code_required" || !access.termId) return access
  const current = await getCurrentTerm(connection)
  if (!current || current.id !== access.termId) return { termId: current?.id ?? null, status: "closed" as const, authorized: false }
  const cycle = registrationCycle(current.academic_year, current.semester)
  const [codes] = await connection.query<CodeRow[]>(
    "SELECT version, encrypted_code FROM registration_access_codes WHERE student_id = ? AND cycle_year = ? AND cycle_kind = ? FOR SHARE",
    [studentId, cycle.year, cycle.kind],
  )
  const stored = codes[0]
  if (!stored || !matchesRegistrationCode(stored.encrypted_code, code)) return null
  await connection.query(
    `INSERT INTO registration_access_grants (student_id, term_id, cycle_year, cycle_kind, code_version)
     VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE cycle_year = VALUES(cycle_year), cycle_kind = VALUES(cycle_kind), code_version = VALUES(code_version)`,
    [studentId, current.id, cycle.year, cycle.kind, stored.version],
  )
  return { termId: current.id, status: "open" as const, authorized: true }
}
