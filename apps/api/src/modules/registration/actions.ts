import type { PoolConnection, RowDataPacket } from "mysql2/promise"
import { config } from "../../config"
import { pool } from "../../db/client"
import { runTransaction } from "../../db/transaction"
import { hashRequest, signToken, verifyToken } from "../../shared/tokens"
import {
  existingRegistrations,
  getCurrentTerm,
  meetingsForSections,
  type CurrentTermRow,
} from "./queries"
import { failed, type ServiceResult } from "./service"

export interface WithdrawalSelectionInput {
  registrationId: number
  reason: string
}

interface BatchDropConfirmation {
  action: "drop"
  studentId: string
  termId: number
  registrationIds: number[]
  exp: number
}

interface WithdrawalFormConfirmation {
  action: "withdrawal-form"
  studentId: string
  termId: number
  selections: WithdrawalSelectionInput[]
  exp: number
}

interface OwnedRegistrationRow extends RowDataPacket {
  registration_id: number
  status: "active" | "dropped" | "withdrawn"
  student_id: string
  term_id: number
  academic_year: number
  semester: number
  term_label: string
  course_code: string
  name_th: string
  name_en: string
  credits: number
  section_id: number
  section_no: string
}

interface IdempotencyRow extends RowDataPacket {
  request_hash: string
  response_status: number
  response_body: unknown
}

interface WithdrawalRow extends RowDataPacket {
  id: string
  student_id: string
  snapshot: Record<string, unknown> | string
  template_version: string
  created_at: Date
}

type SelectedRows = {
  current: CurrentTermRow
  rows: OwnedRegistrationRow[]
}

function normalizeRegistrationIds(registrationIds: readonly number[]): number[] | null {
  if (registrationIds.length === 0 || registrationIds.length > 20) return null
  const ids = registrationIds.map(Number)
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) return null
  return new Set(ids).size === ids.length ? ids : null
}

function normalizeWithdrawalSelections(
  selections: readonly WithdrawalSelectionInput[],
): WithdrawalSelectionInput[] | null {
  if (selections.length === 0 || selections.length > 20) return null
  const seen = new Set<number>()
  const normalized: WithdrawalSelectionInput[] = []
  for (const selection of selections) {
    const registrationId = Number(selection.registrationId)
    const reason = selection.reason.trim()
    if (
      !Number.isSafeInteger(registrationId) ||
      registrationId < 1 ||
      !reason ||
      reason.length > 1_000
    ) {
      return null
    }
    if (seen.has(registrationId)) return null
    seen.add(registrationId)
    normalized.push({ registrationId, reason })
  }
  return normalized
}

async function ownedRegistrations(
  connection: PoolConnection,
  studentId: string,
  registrationIds: readonly number[],
): Promise<OwnedRegistrationRow[]> {
  if (registrationIds.length === 0) return []
  const placeholders = registrationIds.map(() => "?").join(",")
  const [rows] = await connection.query<OwnedRegistrationRow[]>(
    [
      "SELECT r.id AS registration_id, r.status, r.student_id, r.term_id,",
      "t.academic_year, t.semester, t.label AS term_label,",
      "r.course_code, o.name_th, o.name_en, r.credits,",
      "r.section_id, s.section_no",
      "FROM registrations r",
      "INNER JOIN academic_terms t ON t.id = r.term_id",
      "INNER JOIN course_offerings o ON o.id = r.offering_id",
      "INNER JOIN sections s ON s.id = r.section_id",
      "WHERE r.id IN (" + placeholders + ") AND r.student_id = ?",
      "ORDER BY r.id",
    ].join(" "),
    [...registrationIds, studentId],
  )
  return rows
}

async function selectedActiveRows(
  connection: PoolConnection,
  studentId: string,
  registrationIds: readonly number[],
): Promise<ServiceResult<SelectedRows>> {
  const current = await getCurrentTerm(connection)
  if (!current) {
    return failed(409, "CURRENT_TERM_UNAVAILABLE", "ไม่พบภาคการศึกษาปัจจุบัน", "ลองใหม่อีกครั้งภายหลัง")
  }
  const rows = await ownedRegistrations(connection, studentId, registrationIds)
  if (rows.length !== registrationIds.length) {
    return failed(
      404,
      "REGISTRATION_NOT_FOUND",
      "ไม่พบรายวิชา",
      "เลือกรายวิชาจากรายการของคุณแล้วลองอีกครั้ง",
    )
  }
  const byId = new Map(rows.map((row) => [row.registration_id, row]))
  const orderedRows = registrationIds
    .map((id) => byId.get(id))
    .filter(Boolean) as OwnedRegistrationRow[]
  if (orderedRows.some((row) => row.term_id !== current.id)) {
    return failed(
      409,
      "HISTORICAL_TERM",
      "ดำเนินการกับภาคเก่าไม่ได้",
      "ระบบเปิดให้ลดรายวิชาและสร้างคำร้องถอนเฉพาะภาคการศึกษาปัจจุบัน",
    )
  }
  if (orderedRows.some((row) => row.status !== "active")) {
    return failed(
      409,
      "REGISTRATION_NOT_ACTIVE",
      "ดำเนินการไม่ได้",
      "รายวิชาที่เลือกต้องอยู่ในสถานะลงทะเบียนอยู่",
    )
  }
  return { ok: true, data: { current, rows: orderedRows } }
}

function actionRegistration(row: OwnedRegistrationRow) {
  return {
    registrationId: row.registration_id,
    courseCode: row.course_code,
    nameTh: row.name_th,
    nameEn: row.name_en,
    credits: Number(row.credits),
    sectionId: row.section_id,
    sectionNo: row.section_no,
  }
}

function parseBody(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

async function replay(
  connection: PoolConnection,
  studentId: string,
  scope: string,
  key: string,
  requestHash: string,
): Promise<ServiceResult<Record<string, unknown>> | null> {
  const [rows] = await connection.query<IdempotencyRow[]>(
    [
      "SELECT request_hash, response_status, response_body",
      "FROM idempotency_records",
      "WHERE student_id = ? AND scope = ? AND (idempotency_key = ? OR request_hash = ?)",
      "AND expires_at > CURRENT_TIMESTAMP",
      "ORDER BY CASE WHEN idempotency_key = ? THEN 0 ELSE 1 END LIMIT 1",
    ].join(" "),
    [studentId, scope, key, requestHash, key],
  )
  const stored = rows[0]
  if (!stored) return null
  if (stored.request_hash !== requestHash) {
    return failed(409, "IDEMPOTENCY_CONFLICT", "คีย์คำขอถูกใช้แล้ว", "สร้างคีย์คำขอใหม่ก่อนยืนยันรายการอื่น")
  }
  return { ok: true, data: parseBody(stored.response_body), status: stored.response_status }
}

async function lockBatchRows(
  connection: PoolConnection,
  studentId: string,
  rows: readonly OwnedRegistrationRow[],
): Promise<void> {
  const sectionIds = [...new Set(rows.map((row) => row.section_id))].sort(
    (first, second) => first - second,
  )
  const registrationIds = [...new Set(rows.map((row) => row.registration_id))].sort(
    (first, second) => first - second,
  )
  for (const sectionId of sectionIds) {
    await connection.query("SELECT id FROM sections WHERE id = ? FOR UPDATE", [sectionId])
  }
  for (const registrationId of registrationIds) {
    await connection.query(
      "SELECT id FROM registrations WHERE id = ? AND student_id = ? FOR UPDATE",
      [registrationId, studentId],
    )
  }
}

export async function batchDropPreview(
  studentId: string,
  registrationIds: number[],
): Promise<ServiceResult<Record<string, unknown>>> {
  const ids = normalizeRegistrationIds(registrationIds)
  if (!ids) {
    return failed(
      400,
      "DROP_SELECTION_INVALID",
      "เลือกรายวิชาไม่ถูกต้อง",
      "เลือกอย่างน้อยหนึ่งรายวิชาและไม่เลือกซ้ำ",
    )
  }
  const connection = await pool.getConnection()
  try {
    const selected = await selectedActiveRows(connection, studentId, ids)
    if (!selected.ok) return selected
    const expiresAt = Date.now() + 2 * 60_000
    return {
      ok: true,
      data: {
        action: "drop",
        registrations: selected.data.rows.map(actionRegistration),
        confirmationToken: signToken<BatchDropConfirmation>(
          {
            action: "drop",
            studentId,
            termId: selected.data.current.id,
            registrationIds: ids,
            exp: expiresAt,
          },
          config.confirmationSecret,
        ),
        expiresAt: new Date(expiresAt).toISOString(),
      },
    }
  } finally {
    connection.release()
  }
}

export async function commitBatchDrop(
  studentId: string,
  confirmationToken: string,
  idempotencyKey: string,
): Promise<ServiceResult<Record<string, unknown>>> {
  const payload = verifyToken<BatchDropConfirmation>(confirmationToken, config.confirmationSecret)
  const registrationIds = payload ? normalizeRegistrationIds(payload.registrationIds) : null
  if (payload?.action !== "drop" || payload.studentId !== studentId || !registrationIds) {
    return failed(
      409,
      "CONFIRMATION_INVALID",
      "ยืนยันการลดรายวิชาไม่ได้",
      "ข้อมูลยืนยันหมดอายุหรือไม่ตรงกับผู้ใช้ กรุณาตรวจสอบรายการใหม่",
    )
  }

  const scope = "drop-batch"
  const requestHash = hashRequest({ confirmationToken })
  const initial = await pool.getConnection()
  try {
    await initial.query(
      [
        "DELETE FROM idempotency_records",
        "WHERE student_id = ? AND scope = ? AND (idempotency_key = ? OR request_hash = ?)",
        "AND expires_at <= CURRENT_TIMESTAMP",
      ].join(" "),
      [studentId, scope, idempotencyKey, requestHash],
    )
    const stored = await replay(initial, studentId, scope, idempotencyKey, requestHash)
    if (stored) return stored
  } finally {
    initial.release()
  }

  return runTransaction<ServiceResult<Record<string, unknown>>>(async (tx) => {
    await tx.query("INSERT IGNORE INTO student_term_states (student_id, term_id) VALUES (?, ?)", [
      studentId,
      payload.termId,
    ])
    await tx.query(
      [
        "SELECT student_id FROM student_term_states",
        "WHERE student_id = ? AND term_id = ? FOR UPDATE",
      ].join(" "),
      [studentId, payload.termId],
    )

    const concurrentReplay = await replay(tx, studentId, scope, idempotencyKey, requestHash)
    if (concurrentReplay) return { commit: false, value: concurrentReplay }

    const beforeLock = await selectedActiveRows(tx, studentId, registrationIds)
    if (!beforeLock.ok) return { commit: false, value: beforeLock }
    if (beforeLock.data.current.id !== payload.termId) {
      return {
        commit: false,
        value: failed(
          409,
          "CONFIRMATION_INVALID",
          "ยืนยันการลดรายวิชาไม่ได้",
          "ภาคการศึกษาปัจจุบันเปลี่ยนแล้ว กรุณาตรวจสอบรายการใหม่",
        ),
      }
    }

    await lockBatchRows(tx, studentId, beforeLock.data.rows)
    const selected = await selectedActiveRows(tx, studentId, registrationIds)
    if (!selected.ok) return { commit: false, value: selected }

    const meetingRows = await meetingsForSections(
      tx,
      selected.data.rows.map((row) => row.section_id),
    )
    const meetingsBySection = new Map<number, typeof meetingRows>()
    for (const meeting of meetingRows) {
      const entries = meetingsBySection.get(meeting.section_id) ?? []
      entries.push(meeting)
      meetingsBySection.set(meeting.section_id, entries)
    }

    const placeholders = registrationIds.map(() => "?").join(",")
    await tx.query(
      "UPDATE registrations SET status = 'dropped' WHERE id IN (" + placeholders + ")",
      registrationIds,
    )

    const sectionDrops = new Map<number, number>()
    for (const row of selected.data.rows) {
      sectionDrops.set(row.section_id, (sectionDrops.get(row.section_id) ?? 0) + 1)
    }
    for (const [sectionId, count] of sectionDrops) {
      await tx.query(
        "UPDATE sections SET local_active = GREATEST(local_active - ?, 0) WHERE id = ?",
        [count, sectionId],
      )
    }

    const createdAt = new Date().toISOString()
    for (const row of selected.data.rows) {
      const snapshot = {
        studentId,
        term: {
          academicYear: row.academic_year,
          semester: row.semester,
          label: row.term_label,
        },
        course: {
          courseCode: row.course_code,
          nameTh: row.name_th,
          nameEn: row.name_en,
          credits: Number(row.credits),
        },
        section: {
          id: row.section_id,
          sectionNo: row.section_no,
          meetings: meetingsBySection.get(row.section_id) ?? [],
        },
        action: "drop",
        createdAt,
      }
      await tx.query(
        [
          "INSERT INTO registration_events",
          "(registration_id, student_id, action, snapshot)",
          "VALUES (?, ?, 'dropped', ?)",
        ].join(" "),
        [row.registration_id, studentId, JSON.stringify(snapshot)],
      )
    }

    const responseBody = { registrationIds, status: "dropped" }
    await tx.query(
      [
        "INSERT INTO idempotency_records",
        "(student_id, scope, idempotency_key, request_hash, response_status,",
        "response_body, expires_at)",
        "VALUES (?, ?, ?, ?, 200, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 DAY))",
      ].join(" "),
      [studentId, scope, idempotencyKey, requestHash, JSON.stringify(responseBody)],
    )
    return { commit: true, value: { ok: true, data: responseBody } }
  })
}

export async function withdrawalFormPreview(
  studentId: string,
  selections: WithdrawalSelectionInput[],
): Promise<ServiceResult<Record<string, unknown>>> {
  const normalized = normalizeWithdrawalSelections(selections)
  if (!normalized) {
    return failed(
      400,
      "WITHDRAWAL_SELECTION_INVALID",
      "ข้อมูลคำร้องไม่ครบ",
      "เลือกอย่างน้อยหนึ่งรายวิชาและระบุเหตุผลสำหรับทุกรายวิชา",
    )
  }
  const connection = await pool.getConnection()
  try {
    const selected = await selectedActiveRows(
      connection,
      studentId,
      normalized.map((selection) => selection.registrationId),
    )
    if (!selected.ok) return selected
    const reasons = new Map(
      normalized.map((selection) => [selection.registrationId, selection.reason]),
    )
    const expiresAt = Date.now() + 10 * 60_000
    return {
      ok: true,
      data: {
        action: "withdrawal-form",
        registrations: selected.data.rows.map((row) => ({
          ...actionRegistration(row),
          reason: reasons.get(row.registration_id) ?? "",
        })),
        confirmationToken: signToken<WithdrawalFormConfirmation>(
          {
            action: "withdrawal-form",
            studentId,
            termId: selected.data.current.id,
            selections: normalized,
            exp: expiresAt,
          },
          config.confirmationSecret,
        ),
        expiresAt: new Date(expiresAt).toISOString(),
      },
    }
  } finally {
    connection.release()
  }
}

export async function withdrawalFormData(
  studentId: string,
  confirmationToken: string,
): Promise<ServiceResult<{ formId: string; snapshot: Record<string, unknown> }>> {
  const payload = verifyToken<WithdrawalFormConfirmation>(
    confirmationToken,
    config.confirmationSecret,
  )
  const selections = payload ? normalizeWithdrawalSelections(payload.selections) : null
  if (payload?.action !== "withdrawal-form" || payload.studentId !== studentId || !selections) {
    return failed(
      409,
      "CONFIRMATION_INVALID",
      "สร้างแบบฟอร์มไม่ได้",
      "ข้อมูลคำร้องหมดอายุหรือไม่ตรงกับผู้ใช้ กรุณาตรวจสอบรายการใหม่",
    )
  }

  return runTransaction<ServiceResult<{ formId: string; snapshot: Record<string, unknown> }>>(
    async (connection) => {
      await connection.query(
        "INSERT IGNORE INTO student_term_states (student_id, term_id) VALUES (?, ?)",
        [studentId, payload.termId],
      )
      await connection.query(
        [
          "SELECT student_id FROM student_term_states",
          "WHERE student_id = ? AND term_id = ? FOR UPDATE",
        ].join(" "),
        [studentId, payload.termId],
      )
      const selected = await selectedActiveRows(
        connection,
        studentId,
        selections.map((selection) => selection.registrationId),
      )
      if (!selected.ok) return { commit: false, value: selected }
      if (selected.data.current.id !== payload.termId) {
        return {
          commit: false,
          value: failed(
            409,
            "CONFIRMATION_INVALID",
            "สร้างแบบฟอร์มไม่ได้",
            "ภาคการศึกษาปัจจุบันเปลี่ยนแล้ว กรุณาตรวจสอบรายการใหม่",
          ),
        }
      }

      const meetingRows = await meetingsForSections(
        connection,
        selected.data.rows.map((row) => row.section_id),
      )
      const meetingsBySection = new Map<number, typeof meetingRows>()
      for (const meeting of meetingRows) {
        const entries = meetingsBySection.get(meeting.section_id) ?? []
        entries.push(meeting)
        meetingsBySection.set(meeting.section_id, entries)
      }
      const reasons = new Map(
        selections.map((selection) => [selection.registrationId, selection.reason]),
      )
      const existing = await existingRegistrations(connection, studentId, selected.data.current.id)
      const totalCredits = existing.summaries
        .filter((registration) => registration.status === "active")
        .reduce((sum, registration) => sum + registration.credits, 0)
      const requestedCredits = selected.data.rows.reduce((sum, row) => sum + Number(row.credits), 0)
      const createdAt = new Date().toISOString()
      return {
        commit: false,
        value: {
          ok: true,
          data: {
            formId: crypto.randomUUID(),
            snapshot: {
              studentId,
              totalCredits,
              remainingCredits: Math.max(0, totalCredits - requestedCredits),
              term: {
                academicYear: selected.data.current.academic_year,
                semester: selected.data.current.semester,
                label: selected.data.current.label,
              },
              courses: selected.data.rows.map((row) => ({
                courseCode: row.course_code,
                nameTh: row.name_th,
                nameEn: row.name_en,
                credits: Number(row.credits),
                sectionNo: row.section_no,
                meetings: meetingsBySection.get(row.section_id) ?? [],
                instructors: [
                  ...new Set(
                    existing.summaries
                      .find((registration) => registration.registrationId === row.registration_id)
                      ?.meetings.flatMap((meeting) => meeting.teachers) ?? [],
                  ),
                ],
                reason: reasons.get(row.registration_id) ?? "",
              })),
              createdAt,
              submissionStatus: "pending-faculty-review",
            },
          },
        },
      }
    },
  )
}

export async function withdrawalForStudent(
  studentId: string,
  withdrawalId: string,
): Promise<{
  id: string
  snapshot: Record<string, unknown>
  templateVersion: string
  createdAt: Date
} | null> {
  const connection = await pool.getConnection()
  try {
    const [rows] = await connection.query<WithdrawalRow[]>(
      [
        "SELECT id, student_id, snapshot, template_version, created_at",
        "FROM withdrawal_requests",
        "WHERE id = ? AND student_id = ? LIMIT 1",
      ].join(" "),
      [withdrawalId, studentId],
    )
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      snapshot: parseBody(row.snapshot),
      templateVersion: row.template_version,
      createdAt: row.created_at,
    }
  } finally {
    connection.release()
  }
}
