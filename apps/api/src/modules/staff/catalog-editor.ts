import { Elysia, t } from "elysia"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import type { PoolConnection } from "mysql2/promise"
import { runTransaction } from "../../db/transaction"
import { appProblem } from "../../shared/problem"
import { requireStaff, staffCookieSchema, type StaffCookieJar } from "./auth"
import {
  applyOfferingDetails,
  applySectionDetails,
  offeringDetailFields,
  sectionDetailFields,
  validateOfferingDetails,
  validateSectionDetails,
  validateSectionMeetingIds,
  type CurrentExamDetails,
  type OfferingDetails,
  type SectionDetails,
} from "./catalog-details"

export interface CatalogEditorSection extends SectionDetails {
  id?: number
  sectionNo: string
  capacity: number
  closed?: boolean
  active?: boolean
}

export interface CatalogEditorInput extends OfferingDetails {
  nameTh: string
  nameEn: string
  faculty: string
  department: string
  credits: number
  active?: boolean
  sections: CatalogEditorSection[]
}

interface CreateCatalogEditorInput extends CatalogEditorInput {
  termId: number
  courseCode: string
}

type EditorResult =
  | { ok: true; data: { id: number; updated: true } }
  | { ok: false; status: number; code: string; detail: string }

const rejected = (status: number, code: string, detail: string): EditorResult => ({
  ok: false, status, code, detail,
})
const emptyExams: CurrentExamDetails = {
  midterm_date: null, midterm_start_minute: null, midterm_end_minute: null,
  final_date: null, final_start_minute: null, final_end_minute: null,
}

interface ExistingSection extends RowDataPacket {
  id: number
  section_no: string
  capacity: number
  baseline_enrolled: number
  local_active: number
}

/** All field-level validation runs before the first data mutation. */
export function validateCatalogEditor(input: CatalogEditorInput): string | null {
  if ([input.nameTh, input.nameEn, input.faculty, input.department].some((value) => !value.trim()))
    return "Course names, faculty and department are required"
  if (!Number.isFinite(input.credits) || input.credits < 0 || input.credits > 99)
    return "Credits must be between 0 and 99"
  const ids = new Set<number>()
  const numbers = new Set<string>()
  for (const section of input.sections) {
    if (section.id !== undefined) {
      if (ids.has(section.id)) return "A section cannot appear more than once"
      ids.add(section.id)
    }
    const number = section.sectionNo.trim().toLowerCase()
    if (!number) return "Section numbers are required"
    if (numbers.has(number)) return "Section numbers must be unique"
    numbers.add(number)
    if (!Number.isInteger(section.capacity) || section.capacity < 0 || section.capacity > 100_000)
      return "Section capacity must be a whole number between 0 and 100000"
    const error = validateSectionDetails(section)
    if (error) return error
    if (section.id === undefined && section.meetings?.some((meeting) => meeting.id !== undefined))
      return "New sections cannot reference existing meetings"
  }
  return null
}

/** The caller owns the transaction; no course, section or audit write commits separately. */
export async function writeCatalogEditor(
  connection: PoolConnection,
  actorId: string,
  id: number | null,
  input: CatalogEditorInput | CreateCatalogEditorInput,
): Promise<EditorResult> {
  const validation = validateCatalogEditor(input)
  if (validation) return rejected(422, "INVALID_CATALOG_EDITOR", validation)

  const [revisions] = await connection.execute<RowDataPacket[]>("SELECT revision FROM catalog_revision WHERE id = 1 FOR UPDATE")
  if (!revisions.length) throw new Error("Catalog revision state is missing; run the catalog migrations")
  let exams = emptyExams
  let existing: ExistingSection[] = []
  if (id === null) {
    const create = input as CreateCatalogEditorInput
    if (!create.courseCode.trim()) return rejected(422, "INVALID_COURSE_CODE", "A course code is required")
    const [terms] = await connection.execute<RowDataPacket[]>("SELECT id FROM academic_terms WHERE id = ?", [create.termId])
    if (!terms.length) return rejected(404, "TERM_NOT_FOUND", "Term not found")
    const [duplicates] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM course_offerings WHERE term_id = ? AND course_code = ?",
      [create.termId, create.courseCode.trim()],
    )
    if (duplicates.length) return rejected(409, "OFFERING_EXISTS", "This course already exists in the term")
  } else {
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT id, midterm_date, midterm_start_minute, midterm_end_minute, final_date, final_start_minute, final_end_minute FROM course_offerings WHERE id = ? FOR UPDATE",
      [id],
    )
    if (!rows.length) return rejected(404, "COURSE_NOT_FOUND", "Course not found")
    exams = rows[0] as CurrentExamDetails
    ;[existing] = await connection.execute<ExistingSection[]>(
      "SELECT id, section_no, capacity, baseline_enrolled, local_active FROM sections WHERE offering_id = ? ORDER BY id FOR UPDATE",
      [id],
    )
  }
  const examError = validateOfferingDetails(input, exams)
  if (examError) return rejected(422, "INVALID_COURSE_DETAILS", examError)

  const owned = new Map(existing.map((section) => [Number(section.id), section]))
  const existingNumbers = new Map(existing.map((section) => [section.section_no.trim().toLowerCase(), Number(section.id)]))
  const ordered = [...input.sections].sort((left, right) => (left.id ?? Number.MAX_SAFE_INTEGER) - (right.id ?? Number.MAX_SAFE_INTEGER))
  for (const section of ordered) {
    if (section.id === undefined) {
      if (existingNumbers.has(section.sectionNo.trim().toLowerCase()))
        return rejected(409, "SECTION_EXISTS", "This section number already exists")
      continue
    }
    const prior = owned.get(section.id)
    if (!prior) return rejected(422, "SECTION_NOT_OWNED", "A section does not belong to this course")
    if (section.sectionNo.trim() !== prior.section_no)
      return rejected(422, "SECTION_NUMBER_UNCHANGED", "Existing section numbers cannot be changed")
    if (section.capacity < prior.capacity && section.capacity < prior.baseline_enrolled + prior.local_active)
      return rejected(409, "CAPACITY_BELOW_OCCUPANCY", "Capacity cannot be reduced below occupied seats")
    const meetingError = await validateSectionMeetingIds(connection, section.id, section)
    if (meetingError) return rejected(422, "INVALID_SECTION_MEETINGS", meetingError)
  }

  // No writes occur above: an invalid section cannot partially save course details.
  let offeringId = id
  if (offeringId === null) {
    const create = input as CreateCatalogEditorInput
    await connection.execute("INSERT INTO courses (course_code) VALUES (?) ON DUPLICATE KEY UPDATE course_code = VALUES(course_code)", [create.courseCode.trim()])
    const [created] = await connection.execute<ResultSetHeader>(
      "INSERT INTO course_offerings (term_id, course_code, name_th, name_en, faculty, department, credits, active, study_programs, source_checksum) VALUES (?, ?, ?, ?, ?, ?, ?, ?, JSON_ARRAY(), ?)",
      [create.termId, create.courseCode.trim(), input.nameTh.trim(), input.nameEn.trim(), input.faculty.trim(), input.department.trim(), input.credits, input.active ?? true, "0".repeat(64)],
    )
    offeringId = created.insertId
  } else {
    await connection.execute(
      `UPDATE course_offerings SET name_th = ?, name_en = ?, faculty = ?, department = ?, credits = ?${input.active === undefined ? "" : ", active = ?"} WHERE id = ?`,
      [input.nameTh.trim(), input.nameEn.trim(), input.faculty.trim(), input.department.trim(), input.credits, ...(input.active === undefined ? [] : [input.active]), offeringId],
    )
  }
  await applyOfferingDetails(connection, offeringId, input)
  for (const section of ordered) {
    let sectionId = section.id
    if (sectionId === undefined) {
      const [created] = await connection.execute<ResultSetHeader>(
        "INSERT INTO sections (offering_id, section_no, capacity, closed, active) VALUES (?, ?, ?, ?, ?)",
        [offeringId, section.sectionNo.trim(), section.capacity, section.closed ?? false, section.active ?? true],
      )
      sectionId = created.insertId
    } else {
      await connection.execute(
        `UPDATE sections SET capacity = ?${section.closed === undefined ? "" : ", closed = ?"}${section.active === undefined ? "" : ", active = ?"} WHERE id = ?`,
        [section.capacity, ...(section.closed === undefined ? [] : [section.closed]), ...(section.active === undefined ? [] : [section.active]), sectionId],
      )
    }
    await applySectionDetails(connection, sectionId, section)
  }
  await connection.execute("UPDATE catalog_revision SET revision = revision + 1 WHERE id = 1")
  await connection.execute(
    "INSERT INTO staff_audit_events (staff_id, action, target, details) VALUES (?, ?, ?, ?)",
    [actorId, id === null ? "catalog_editor_created" : "catalog_editor_updated", `offering:${offeringId}`, JSON.stringify(input)],
  )
  return { ok: true, data: { id: offeringId, updated: true } }
}

const requiredText = (maxLength: number) => t.String({ minLength: 1, maxLength, pattern: "\\S" })
const fields = {
  nameTh: requiredText(500), nameEn: requiredText(500), faculty: requiredText(255), department: requiredText(255),
  credits: t.Number({ minimum: 0, maximum: 99 }), active: t.Optional(t.Boolean()),
  ...offeringDetailFields,
  sections: t.Array(t.Object({
    id: t.Optional(t.Integer({ minimum: 1 })), sectionNo: requiredText(32),
    capacity: t.Integer({ minimum: 0, maximum: 100_000 }), closed: t.Optional(t.Boolean()), active: t.Optional(t.Boolean()),
    ...sectionDetailFields,
  }), { maxItems: 100 }),
}

const responseOf = (request: Request, result: EditorResult) => result.ok
  ? { data: result.data }
  : appProblem(request, result.status, result.code, "Course could not be saved", result.detail)

export const staffCatalogEditorModule = new Elysia({ name: "staff-catalog-editor" })
  .post("/api/v1/staff/catalog/offerings/editor", {
    cookie: staffCookieSchema,
    body: t.Object({ termId: t.Integer({ minimum: 1 }), courseCode: requiredText(24), ...fields }),
  }, async ({ cookie, request, body }) => {
    const actor = await requireStaff(cookie as StaffCookieJar, request, "admin")
    if (actor instanceof Response) return actor
    const result = await runTransaction(async (connection) => {
      const value = await writeCatalogEditor(connection, actor.id, null, body)
      return { commit: value.ok, value }
    })
    return responseOf(request, result)
  })
  .put("/api/v1/staff/catalog/offerings/:id/editor", {
    cookie: staffCookieSchema,
    params: t.Object({ id: t.Numeric({ minimum: 1 }) }), body: t.Object(fields),
  }, async ({ cookie, request, params, body }) => {
    const actor = await requireStaff(cookie as StaffCookieJar, request, "admin")
    if (actor instanceof Response) return actor
    const result = await runTransaction(async (connection) => {
      const value = await writeCatalogEditor(connection, actor.id, params.id, body)
      return { commit: value.ok, value }
    })
    return responseOf(request, result)
  })
