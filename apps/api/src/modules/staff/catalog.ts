import { Elysia, t } from "elysia"
import type { ResultSetHeader, RowDataPacket } from "mysql2"
import type { PoolConnection } from "mysql2/promise"
import { pool } from "../../db/client"
import { originIsAllowed } from "../../shared/http"
import { appProblem } from "../../shared/problem"
import { importCatalogUpload, StaffCatalogPreviewStaleError } from "../catalog/importer"
import { requireStaff, staffCookieSchema, type StaffCookieJar } from "./auth"
import { CatalogUploadBusyError, CatalogUploadInvalidError, processCatalogUpload } from "./catalog-upload"
import { applyOfferingDetails, applySectionDetails, offeringDetailFields, sectionDetailFields,
  validateOfferingDetails, validateSectionDetails, validateSectionMeetingIds, type CurrentExamDetails } from "./catalog-details"

const idParam = t.Object({ id: t.Numeric({ minimum: 1 }) })
const text = (maxLength: number) => t.String({ minLength: 1, maxLength, pattern: "\\S" })
const uploadLimit = 64 * 1024 * 1024
const fail = (request: Request, status: number, code: string, detail: string) =>
  appProblem(request, status, code, "Request could not be completed", detail)
const authorized = (cookie: unknown, request: Request, role?: "admin") =>
  requireStaff(cookie as StaffCookieJar, request, role)
const origin = (request: Request) => originIsAllowed(request)

async function audit(conn: PoolConnection, actor: string, action: string, kind: string, id: string, details: unknown) {
  await conn.execute(
    "INSERT INTO staff_audit_events (staff_id, action, target, details) VALUES (?, ?, ?, ?)",
    [actor, action, `${kind}:${id}`, JSON.stringify(details)],
  )
}

async function lockCatalog(conn: PoolConnection) {
  await conn.execute("SELECT revision FROM catalog_revision WHERE id = 1 FOR UPDATE")
  await conn.execute("UPDATE catalog_revision SET revision = revision + 1 WHERE id = 1")
}

export async function readCatalogUpload(request: Request): Promise<Uint8Array> {
  if (!request.body) throw new CatalogUploadInvalidError("Missing catalog")
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > uploadLimit) {
      await reader.cancel()
      throw new CatalogUploadInvalidError("Catalog exceeds the 64 MiB upload limit")
    }
    parts.push(value)
  }
  const output = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

const optionalWindow = t.Optional(t.Union([t.String({ maxLength: 40 }), t.Null()]))
export const staffTermsQuery = `SELECT t.id, t.academic_year AS academicYear, t.semester, t.label, t.active,
      (t.id = CAST(s.value AS UNSIGNED)) AS isCurrent, w.opens_at AS opensAt, w.closes_at AS closesAt
      FROM academic_terms t LEFT JOIN app_settings s ON s.\`key\` = 'current_term_id'
      LEFT JOIN term_registration_windows w ON w.term_id = t.id ORDER BY t.academic_year DESC, t.semester DESC`
const offeringFields = {
  nameTh: t.Optional(text(500)), nameEn: t.Optional(text(500)),
  faculty: t.Optional(text(255)), department: t.Optional(text(255)),
  credits: t.Optional(t.Number({ minimum: 0, maximum: 99 })), active: t.Optional(t.Boolean()),
  ...offeringDetailFields,
}

export const staffCatalogModule = new Elysia({ name: "staff-catalog" })
  .get("/api/v1/staff/terms", { cookie: staffCookieSchema }, async ({ cookie, request }) => {
    const user = await authorized(cookie, request)
    if (user instanceof Response) return user
    const [rows] = await pool.query<RowDataPacket[]>(staffTermsQuery)
    return { data: rows.map((r) => ({ ...r, active: Boolean(r.active), isCurrent: Boolean(r.isCurrent) })) }
  })
  .post("/api/v1/staff/terms", {
    cookie: staffCookieSchema, body: t.Object({ academicYear: t.Integer({ minimum: 1, maximum: 9999 }),
      semester: t.Integer({ minimum: 1, maximum: 3 }), label: text(32) }),
  }, async ({ cookie, request, body }) => {
    const user = await authorized(cookie, request, "admin")
    if (user instanceof Response) return user
    if (!origin(request)) return fail(request, 403, "ORIGIN_NOT_ALLOWED", "Invalid origin")
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await lockCatalog(conn)
      const [exists] = await conn.execute<RowDataPacket[]>("SELECT id FROM academic_terms WHERE academic_year = ? AND semester = ?", [body.academicYear, body.semester])
      if (exists.length) { await conn.rollback(); return fail(request, 409, "TERM_EXISTS", "The term already exists") }
      const [result] = await conn.execute<ResultSetHeader>("INSERT INTO academic_terms (academic_year, semester, label) VALUES (?, ?, ?)", [body.academicYear, body.semester, body.label.trim()])
      await audit(conn, user.id, "create", "term", String(result.insertId), body)
      await conn.commit()
      return { data: { id: result.insertId } }
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
  })
  .patch("/api/v1/staff/terms/:id", {
    cookie: staffCookieSchema, params: idParam,
    body: t.Object({ label: t.Optional(text(32)), active: t.Optional(t.Boolean()), isCurrent: t.Optional(t.Boolean()), opensAt: optionalWindow, closesAt: optionalWindow }),
  }, async ({ cookie, request, body, params }) => {
    const user = await authorized(cookie, request, "admin")
    if (user instanceof Response) return user
    if (!origin(request)) return fail(request, 403, "ORIGIN_NOT_ALLOWED", "Invalid origin")
    const hasWindow = body.opensAt !== undefined || body.closesAt !== undefined
    if (hasWindow && (body.opensAt === undefined || body.closesAt === undefined || (body.opensAt === null) !== (body.closesAt === null)))
      return fail(request, 422, "INVALID_WINDOW", "Provide both dates or clear both dates")
    if ((body.opensAt && !/(?:Z|[+-]\d\d:\d\d)$/i.test(body.opensAt)) || (body.closesAt && !/(?:Z|[+-]\d\d:\d\d)$/i.test(body.closesAt)))
      return fail(request, 422, "INVALID_WINDOW", "Dates must include a timezone")
    const start = body.opensAt ? new Date(body.opensAt) : null
    const end = body.closesAt ? new Date(body.closesAt) : null
    if (hasWindow && body.opensAt !== null && (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end))
      return fail(request, 422, "INVALID_WINDOW", "The registration window must have a valid start before its end")
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await lockCatalog(conn)
      const [settings] = await conn.execute<RowDataPacket[]>("SELECT value FROM app_settings WHERE `key` = 'current_term_id' FOR UPDATE")
      const [rows] = await conn.execute<RowDataPacket[]>("SELECT id, active FROM academic_terms WHERE id = ? FOR UPDATE", [params.id])
      if (!rows.length) { await conn.rollback(); return fail(request, 404, "TERM_NOT_FOUND", "Term not found") }
      if (body.active === false) {
        if (settings[0]?.value === String(params.id)) { await conn.rollback(); return fail(request, 409, "CURRENT_TERM_ACTIVE", "Choose another current term before deactivating this term") }
      }
      if (body.isCurrent === true && !(body.active ?? Boolean(rows[0]?.active))) {
        await conn.rollback()
        return fail(request, 409, "CURRENT_TERM_ACTIVE", "The current term must be active")
      }
      if (body.label !== undefined) await conn.execute("UPDATE academic_terms SET label = ? WHERE id = ?", [body.label.trim(), params.id])
      if (body.active !== undefined) await conn.execute("UPDATE academic_terms SET active = ? WHERE id = ?", [body.active, params.id])
      if (body.isCurrent === true) await conn.execute("INSERT INTO app_settings (`key`, value) VALUES ('current_term_id', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [String(params.id)])
      if (hasWindow && start && end) await conn.execute("INSERT INTO term_registration_windows (term_id, opens_at, closes_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE opens_at = VALUES(opens_at), closes_at = VALUES(closes_at)", [params.id, start, end])
      else if (hasWindow) await conn.execute("DELETE FROM term_registration_windows WHERE term_id = ?", [params.id])
      await conn.execute("INSERT INTO staff_audit_events (staff_id, action, target, details) VALUES (?, 'update', ?, ?)", [user.id, `term:${params.id}`, JSON.stringify(body)])
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    return { data: { updated: true } }
  })
  .post("/api/v1/staff/terms/:id/current", { cookie: staffCookieSchema, params: idParam }, async ({ cookie, request, params }) => {
    const user = await authorized(cookie, request, "admin")
    if (user instanceof Response) return user
    if (!origin(request)) return fail(request, 403, "ORIGIN_NOT_ALLOWED", "Invalid origin")
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await lockCatalog(conn)
      await conn.execute("SELECT value FROM app_settings WHERE `key` = 'current_term_id' FOR UPDATE")
      const [rows] = await conn.execute<RowDataPacket[]>("SELECT id FROM academic_terms WHERE id = ? AND active = 1 FOR UPDATE", [params.id])
      if (!rows.length) { await conn.rollback(); return fail(request, 404, "TERM_NOT_FOUND", "Active term not found") }
      await conn.execute("INSERT INTO app_settings (`key`, value) VALUES ('current_term_id', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [String(params.id)])
      await audit(conn, user.id, "set_current", "term", String(params.id), {})
      await conn.commit()
      return { data: { updated: true } }
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
  })
  .get("/api/v1/staff/catalog", { cookie: staffCookieSchema, query: t.Object({ termId: t.Numeric({ minimum: 1 }), q: t.Optional(t.String({ maxLength: 100 })) }) }, async ({ cookie, request, query }) => {
    const user = await authorized(cookie, request, "admin")
    if (user instanceof Response) return user
    const pattern = `%${(query.q ?? "").replace(/[\\%_]/g, "\\$&")}%`
    const [offerings] = await pool.execute<RowDataPacket[]>(`SELECT id, course_code AS courseCode, name_th AS nameTh, name_en AS nameEn, faculty, department, credits, active,
      short_name AS shortName, description_th AS descriptionTh, description_en AS descriptionEn, credit_hours AS creditHours,
      prerequisite_text AS prerequisiteText, gen_ed_type AS genEdType, study_programs AS studyPrograms,
      midterm_date AS midtermDate, midterm_start_minute AS midtermStartMinute, midterm_end_minute AS midtermEndMinute,
      final_date AS finalDate, final_start_minute AS finalStartMinute, final_end_minute AS finalEndMinute
      FROM course_offerings WHERE term_id = ? AND (course_code LIKE ? OR name_th LIKE ? OR name_en LIKE ?) ORDER BY course_code LIMIT 200`, [query.termId, pattern, pattern, pattern])
    if (!offerings.length) return { data: [] }
    const ids = offerings.map((r) => r.id)
    const [sectionRows] = await pool.query<RowDataPacket[]>(`SELECT id, offering_id AS offeringId, section_no AS sectionNo, capacity, baseline_enrolled AS baselineEnrolled, local_active AS localActive, closed, active, note, gen_ed_type AS genEdType FROM sections WHERE offering_id IN (?) ORDER BY section_no`, [ids])
    const sectionIds = sectionRows.map((s) => s.id)
    const [meetingRows] = sectionIds.length ? await pool.query<RowDataPacket[]>(`SELECT id, section_id AS sectionId, class_type AS classType, day_code AS dayCode, start_minute AS startMinute, end_minute AS endMinute, period_label AS periodLabel, building, room, teachers, arranged FROM section_meetings WHERE section_id IN (?)`, [sectionIds]) : [[]]
    const array = (value: unknown) => typeof value === "string" ? JSON.parse(value) : value
    const date = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : value
    return { data: offerings.map((r) => ({ ...r, active: Boolean(r.active), studyPrograms: array(r.studyPrograms), midtermDate: date(r.midtermDate), finalDate: date(r.finalDate), sections: sectionRows.filter((s) => s.offeringId === r.id).map((s) => ({ ...s, active: Boolean(s.active), closed: Boolean(s.closed), meetings: meetingRows.filter((m) => m.sectionId === s.id).map((m) => ({ ...m, arranged: Boolean(m.arranged), teachers: array(m.teachers) })) })) })) }
  })
  .post("/api/v1/staff/catalog/offerings", { cookie: staffCookieSchema, body: t.Object({ termId: t.Integer({ minimum: 1 }), courseCode: text(24), nameTh: text(500), nameEn: text(500), faculty: text(255), department: text(255), credits: t.Number({ minimum: 0, maximum: 99 }) }) }, async ({ cookie, request, body }) => {
    const user = await authorized(cookie, request, "admin")
    if (user instanceof Response) return user
    if (!origin(request)) return fail(request, 403, "ORIGIN_NOT_ALLOWED", "Invalid origin")
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await lockCatalog(conn)
      const [term] = await conn.execute<RowDataPacket[]>("SELECT id FROM academic_terms WHERE id = ?", [body.termId])
      if (!term.length) { await conn.rollback(); return fail(request, 404, "TERM_NOT_FOUND", "Term not found") }
      const [existing] = await conn.execute<RowDataPacket[]>("SELECT id FROM course_offerings WHERE term_id = ? AND course_code = ?", [body.termId, body.courseCode])
      if (existing.length) { await conn.rollback(); return fail(request, 409, "OFFERING_EXISTS", "This course already exists in the term") }
      await conn.execute("INSERT INTO courses (course_code) VALUES (?) ON DUPLICATE KEY UPDATE course_code = VALUES(course_code)", [body.courseCode])
      const [result] = await conn.execute<ResultSetHeader>("INSERT INTO course_offerings (term_id, course_code, name_th, name_en, faculty, department, credits, study_programs, source_checksum) VALUES (?, ?, ?, ?, ?, ?, ?, JSON_ARRAY(), ?)", [body.termId, body.courseCode, body.nameTh, body.nameEn, body.faculty, body.department, body.credits, "0".repeat(64)])
      await conn.execute("INSERT INTO staff_audit_events (staff_id, action, target, details) VALUES (?, 'create', ?, ?)", [user.id, `offering:${result.insertId}`, JSON.stringify(body)])
      await conn.commit()
      return { data: { id: result.insertId } }
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
  })
  .patch("/api/v1/staff/catalog/offerings/:id", { cookie: staffCookieSchema, params: idParam, body: t.Object(offeringFields) }, async ({ cookie, request, body, params }) => {
    const user = await authorized(cookie, request, "admin")
    if (user instanceof Response) return user
    if (!origin(request)) return fail(request, 403, "ORIGIN_NOT_ALLOWED", "Invalid origin")
    const names = { nameTh: "name_th", nameEn: "name_en", faculty: "faculty", department: "department", credits: "credits", active: "active" } as const
    const entries = Object.entries(body).filter(([key, value]) => key in names && value !== undefined) as Array<[keyof typeof names, string | number | boolean]>
    if (!Object.keys(body).length) return fail(request, 422, "NO_CHANGES", "No changes provided")
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await lockCatalog(conn)
      const [exists] = await conn.execute<RowDataPacket[]>("SELECT id, midterm_date, midterm_start_minute, midterm_end_minute, final_date, final_start_minute, final_end_minute FROM course_offerings WHERE id = ? FOR UPDATE", [params.id])
      if (!exists.length) { await conn.rollback(); return fail(request, 404, "COURSE_NOT_FOUND", "Course not found") }
      const validation = validateOfferingDetails(body, exists[0] as CurrentExamDetails)
      if (validation) { await conn.rollback(); return fail(request, 422, "INVALID_COURSE_DETAILS", validation) }
      if (entries.length) await conn.execute(`UPDATE course_offerings SET ${entries.map(([key]) => `${names[key]} = ?`).join(", ")} WHERE id = ?`, [...entries.map(([, value]) => value), params.id])
      await applyOfferingDetails(conn, params.id, body)
      await audit(conn, user.id, "update", "offering", String(params.id), body)
      await conn.commit()
      return { data: { updated: true } }
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
  })
  .post("/api/v1/staff/catalog/sections", { cookie: staffCookieSchema, body: t.Object({ offeringId: t.Integer({ minimum: 1 }), sectionNo: text(32), capacity: t.Integer({ minimum: 0, maximum: 100000 }) }) }, async ({ cookie, request, body }) => {
    const user = await authorized(cookie, request, "admin")
    if (user instanceof Response) return user
    if (!origin(request)) return fail(request, 403, "ORIGIN_NOT_ALLOWED", "Invalid origin")
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await lockCatalog(conn)
      const [offering] = await conn.execute<RowDataPacket[]>("SELECT id FROM course_offerings WHERE id = ? FOR UPDATE", [body.offeringId])
      if (!offering.length) { await conn.rollback(); return fail(request, 404, "COURSE_NOT_FOUND", "Course not found") }
      const [exists] = await conn.execute<RowDataPacket[]>("SELECT id FROM sections WHERE offering_id = ? AND section_no = ?", [body.offeringId, body.sectionNo])
      if (exists.length) { await conn.rollback(); return fail(request, 409, "SECTION_EXISTS", "Section already exists") }
      const [result] = await conn.execute<ResultSetHeader>("INSERT INTO sections (offering_id, section_no, capacity) VALUES (?, ?, ?)", [body.offeringId, body.sectionNo, body.capacity])
      await audit(conn, user.id, "create", "section", String(result.insertId), body)
      await conn.commit()
      return { data: { id: result.insertId } }
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
  })
  .patch("/api/v1/staff/catalog/sections/:id", { cookie: staffCookieSchema, params: idParam, body: t.Object({ capacity: t.Optional(t.Integer({ minimum: 0, maximum: 100000 })), closed: t.Optional(t.Boolean()), active: t.Optional(t.Boolean()), ...sectionDetailFields }) }, async ({ cookie, request, body, params }) => {
    const user = await authorized(cookie, request, "admin")
    if (user instanceof Response) return user
    if (!origin(request)) return fail(request, 403, "ORIGIN_NOT_ALLOWED", "Invalid origin")
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await lockCatalog(conn)
      const [rows] = await conn.execute<RowDataPacket[]>("SELECT capacity, baseline_enrolled, local_active FROM sections WHERE id = ? FOR UPDATE", [params.id])
      const row = rows[0]
      if (!row) { await conn.rollback(); return fail(request, 404, "SECTION_NOT_FOUND", "Section not found") }
      if (body.capacity !== undefined && body.capacity < row.capacity && body.capacity < row.baseline_enrolled + row.local_active) { await conn.rollback(); return fail(request, 409, "CAPACITY_BELOW_OCCUPANCY", "Capacity cannot be reduced below occupied seats") }
      const names = { capacity: "capacity", closed: "closed", active: "active" } as const
      const entries = Object.entries(body).filter(([key, value]) => key in names && value !== undefined) as Array<[keyof typeof names, number | boolean]>
      if (!Object.keys(body).length) { await conn.rollback(); return fail(request, 422, "NO_CHANGES", "No changes provided") }
      const validation = validateSectionDetails(body)
      if (validation) { await conn.rollback(); return fail(request, 422, "INVALID_SECTION_DETAILS", validation) }
      const meetingValidation = await validateSectionMeetingIds(conn, params.id, body)
      if (meetingValidation) { await conn.rollback(); return fail(request, 422, "INVALID_SECTION_DETAILS", meetingValidation) }
      if (entries.length) await conn.execute(`UPDATE sections SET ${entries.map(([key]) => `${names[key]} = ?`).join(", ")} WHERE id = ?`, [...entries.map(([, value]) => value), params.id])
      await applySectionDetails(conn, params.id, body)
      await conn.execute("INSERT INTO staff_audit_events (staff_id, action, target, details) VALUES (?, 'update', ?, ?)", [user.id, `section:${params.id}`, JSON.stringify(body)])
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    return { data: { updated: true } }
  })
  .post("/api/v1/staff/catalog/import/preview", { cookie: staffCookieSchema, parse: "none" }, async ({ cookie, request }) => {
    const user = await authorized(cookie, request, "admin")
    if (user instanceof Response) return user
    if (!origin(request)) return fail(request, 403, "ORIGIN_NOT_ALLOWED", "Invalid origin")
    let upload: Awaited<ReturnType<typeof processCatalogUpload>>
    try { upload = await processCatalogUpload(() => readCatalogUpload(request)) }
    catch (error) {
      if (error instanceof CatalogUploadBusyError) return fail(request, 503, "CATALOG_BUSY", error.message)
      if (error instanceof CatalogUploadInvalidError) return fail(request, 422, "INVALID_CATALOG", error.message)
      throw error
    }
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [revisions] = await conn.execute<RowDataPacket[]>("SELECT revision FROM catalog_revision WHERE id = 1 FOR SHARE")
      const changes = []
      for (const term of upload.summary.terms) {
        const [rows] = await conn.execute<RowDataPacket[]>(`SELECT o.course_code FROM course_offerings o
          JOIN academic_terms t ON t.id = o.term_id WHERE t.academic_year = ? AND t.semester = ? AND o.active = 1`, [term.academicYear, term.semester])
        const [seatRows] = await conn.execute<RowDataPacket[]>(`SELECT o.course_code, s.section_no, s.local_active FROM sections s
          JOIN course_offerings o ON o.id = s.offering_id JOIN academic_terms t ON t.id = o.term_id
          WHERE t.academic_year = ? AND t.semester = ?`, [term.academicYear, term.semester])
        const existing = new Set(rows.map((r) => String(r.course_code)))
        const termOfferings = upload.catalog.offerings.filter((o) => o.academicYear === term.academicYear && o.semester === term.semester)
        const incoming = new Set(termOfferings.map((o) => o.courseCode))
        const occupied = new Map(seatRows.map((r) => [`${r.course_code}/${r.section_no}`, Number(r.local_active)]))
        const overCapacitySections = termOfferings.reduce((count, offering) => count + offering.sections.filter((section) =>
          section.baselineEnrolled + (occupied.get(`${offering.courseCode}/${section.sectionNo}`) ?? 0) > section.capacity).length, 0)
        changes.push({ ...term, added: [...incoming].filter((code) => !existing.has(code)).length,
          replaced: [...incoming].filter((code) => existing.has(code)).length,
          removed: [...existing].filter((code) => !incoming.has(code)).length, overCapacitySections })
      }
      await conn.execute("INSERT INTO staff_catalog_previews (staff_id, checksum, catalog_revision, expires_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE catalog_revision = VALUES(catalog_revision), expires_at = VALUES(expires_at)", [user.id, upload.summary.checksum, revisions[0]?.revision, new Date(Date.now() + 15 * 60_000)])
      await conn.commit()
      return { data: { ...upload.summary, changes } }
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
  })
  .post("/api/v1/staff/catalog/import/confirm", { cookie: staffCookieSchema, parse: "none", query: t.Object({ checksum: t.String({ pattern: "^[a-f0-9]{64}$" }) }) }, async ({ cookie, request, query }) => {
    const user = await authorized(cookie, request, "admin")
    if (user instanceof Response) return user
    if (!origin(request)) return fail(request, 403, "ORIGIN_NOT_ALLOWED", "Invalid origin")
    let upload: Awaited<ReturnType<typeof processCatalogUpload>>
    try { upload = await processCatalogUpload(() => readCatalogUpload(request)) }
    catch (error) {
      if (error instanceof CatalogUploadBusyError) return fail(request, 503, "CATALOG_BUSY", error.message)
      if (error instanceof CatalogUploadInvalidError) return fail(request, 422, "INVALID_CATALOG", error.message)
      throw error
    }
    if (upload.summary.checksum !== query.checksum) return fail(request, 409, "CATALOG_CHANGED", "The file differs from the preview")
    const [previews] = await pool.execute<RowDataPacket[]>("SELECT catalog_revision FROM staff_catalog_previews WHERE staff_id = ? AND checksum = ? AND expires_at > UTC_TIMESTAMP(3)", [user.id, query.checksum])
    if (!previews.length) return fail(request, 409, "PREVIEW_REQUIRED", "Preview this file again before importing")
    let result: Awaited<ReturnType<typeof importCatalogUpload>>
    try { result = await importCatalogUpload(upload.summary.checksum, upload.catalog, user.id, Number(previews[0]?.catalog_revision)) }
    catch (error) {
      if (error instanceof StaffCatalogPreviewStaleError) return fail(request, 409, "PREVIEW_STALE", "Catalog changed after preview; preview again")
      throw error
    }
    await pool.execute("DELETE FROM staff_catalog_previews WHERE staff_id = ? AND checksum = ?", [user.id, query.checksum])
    return { data: result }
  })
  .get("/api/v1/staff/catalog/export", { cookie: staffCookieSchema, query: t.Object({ termId: t.Numeric({ minimum: 1 }) }) }, async ({ cookie, request, query }) => {
    const user = await authorized(cookie, request, "admin")
    if (user instanceof Response) return user
    const [termRows] = await pool.execute<RowDataPacket[]>("SELECT id, academic_year, semester, label FROM academic_terms WHERE id = ?", [query.termId])
    const term = termRows[0]
    if (!term) return fail(request, 404, "TERM_NOT_FOUND", "Term not found")
    const [offerings] = await pool.execute<RowDataPacket[]>("SELECT * FROM course_offerings WHERE term_id = ? AND active = 1 ORDER BY course_code", [query.termId])
    const [sectionRows] = await pool.execute<RowDataPacket[]>("SELECT s.* FROM sections s JOIN course_offerings o ON o.id = s.offering_id WHERE o.term_id = ? AND o.active = 1 AND s.active = 1 ORDER BY s.section_no", [query.termId])
    const [meetings] = await pool.execute<RowDataPacket[]>("SELECT m.* FROM section_meetings m JOIN sections s ON s.id = m.section_id JOIN course_offerings o ON o.id = s.offering_id WHERE o.term_id = ? AND o.active = 1 AND s.active = 1", [query.termId])
    const [reviews] = await pool.execute<RowDataPacket[]>("SELECT * FROM course_reviews WHERE term_id = ?", [query.termId])
    const time = (minute: number | null) => minute === null ? null : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
    const jsonArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : typeof value === "string" ? JSON.parse(value) as string[] : []
    const exam = (date: unknown, start: number | null, end: number | null) => {
      if (!date || start === null || end === null) return null
      return { date: date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10), period: { start: time(start), end: time(end) } }
    }
    const datasets = new Map<string, { studyProgram: string; academicYear: number; semester: number; termLabel: string; courses: unknown[] }>()
    for (const offering of offerings) {
      const programs = jsonArray(offering.study_programs)
      if (!programs.length) programs.push("UNKNOWN")
      const sectionData = sectionRows.filter((row) => row.offering_id === offering.id).map((section) => ({
        sectionNo: section.section_no, closed: Boolean(section.closed), capacity: { max: section.capacity, current: section.baseline_enrolled }, note: section.note, genEdType: section.gen_ed_type,
        classes: meetings.filter((m) => m.section_id === section.id).map((m) => ({ type: m.class_type, dayOfWeek: m.day_code,
          period: { start: time(m.start_minute), end: time(m.end_minute) }, building: m.building, room: m.room, teachers: jsonArray(m.teachers) })),
      }))
      for (const program of programs) {
        const dataset = datasets.get(program) ?? { studyProgram: program, academicYear: term.academic_year, semester: term.semester, termLabel: term.label, courses: [] as unknown[] }
        dataset.courses.push({ courseNo: offering.course_code, courseNameTh: offering.name_th, courseNameEn: offering.name_en,
          courseDescTh: offering.description_th, courseDescEn: offering.description_en, abbrName: offering.short_name,
          faculty: offering.faculty, department: offering.department, credit: offering.credits, creditHours: offering.credit_hours,
          courseCondition: offering.prerequisite_text, genEdType: offering.gen_ed_type,
          midterm: exam(offering.midterm_date, offering.midterm_start_minute, offering.midterm_end_minute),
          final: exam(offering.final_date, offering.final_start_minute, offering.final_end_minute), sections: sectionData,
          reviews: reviews.filter((r) => r.course_code === offering.course_code && program === programs[0]).map((r) => ({
            _id: r.review_id, rating: r.rating, content: r.content, likeCount: r.like_count, dislikeCount: r.dislike_count, status: r.status, studyProgram: r.study_program,
          })) })
        datasets.set(program, dataset)
      }
    }
    return new Response(JSON.stringify({ source: "RegChula", datasets: [...datasets.values()] }), { headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="catalog-${term.academic_year}-${term.semester}.json"`,
    } })
  })
