import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { config } from "../../config"
import { pool } from "../../db/client"
import { runTransaction } from "../../db/transaction"
import { hashRequest, signToken, verifyToken } from "../../shared/tokens"
import { registrationAccess } from "./access"
import { blockingRegistrationIssues, type RuleIssue } from "./pipeline"
import {
  evaluateRegistration,
  evaluateRegistrationBatch,
  listCurrentRegistrations,
  type RegistrationSectionChoice,
  type RegistrationSummary,
} from "./queries"

interface RegistrationConfirmation {
  action: "register"
  studentId: string
  termId: number
  sectionId: number
  allowAdvisoryOverride: boolean
  exp: number
}

export interface RegistrationChoiceInput extends RegistrationSectionChoice {}

interface BatchRegistrationConfirmation {
  action: "register-batch"
  studentId: string
  termId: number
  choices: RegistrationChoiceInput[]
  allowAdvisoryOverride: boolean
  exp: number
}

interface RegistrationRecordRow extends RowDataPacket {
  id: number
  status: "active" | "dropped" | "withdrawn" | "removed"
  section_id: number
}

interface IdempotencyRow extends RowDataPacket {
  request_hash: string
  response_status: number
  response_body: unknown
}

export type ServiceResult<T> =
  | { ok: true; data: T; status?: number }
  | {
      ok: false
      status: number
      code: string
      title: string
      detail: string
      details?: Record<string, unknown>
    }

export function failed(
  status: number,
  code: string,
  title: string,
  detail: string,
  details?: Record<string, unknown>,
): ServiceResult<never> {
  const result: ServiceResult<never> = { ok: false, status, code, title, detail }
  if (details) result.details = details
  return result
}

async function requireRegistrationAccess(connection: PoolConnection, studentId: string, termId?: number, lock = false) {
  const access = await registrationAccess(connection, studentId, termId, lock)
  if (access.authorized) return null
  const details = {
    closed: ["REGISTRATION_CLOSED", "ยังไม่อยู่ในช่วงลงทะเบียน"],
    profile_required: ["REGISTRATION_PROFILE_REQUIRED", "ติดต่อสำนักงานทะเบียนเพื่อตรวจสอบข้อมูลนิสิตและอาจารย์ที่ปรึกษา"],
    code_required: ["REGISTRATION_CODE_REQUIRED", "กรอกรหัสลงทะเบียนจากอาจารย์ที่ปรึกษา"],
    open: ["REGISTRATION_ACCESS_REQUIRED", "ตรวจสอบสิทธิ์ลงทะเบียน"],
  } as const
  const [code, detail] = details[access.status]
  return failed(409, code, "ไม่สามารถลงทะเบียนได้", detail)
}

function blockingIssues(issues: RuleIssue[], allowAdvisoryOverride: boolean): RuleIssue[] {
  return blockingRegistrationIssues(issues, allowAdvisoryOverride)
}

function ruleFailure(issues: RuleIssue[]): ServiceResult<never> {
  const first = issues[0]
  return failed(
    409,
    first?.code ?? "REGISTRATION_REJECTED",
    "ไม่สามารถลงทะเบียนได้",
    first?.message ?? "เงื่อนไขการลงทะเบียนไม่ผ่าน",
    { issues },
  )
}

export async function registrationPreview(
  studentId: string,
  sectionId: number,
  allowAdvisoryOverride = false,
): Promise<ServiceResult<Record<string, unknown>>> {
  const connection = await pool.getConnection()
  try {
    const access = await requireRegistrationAccess(connection, studentId)
    if (access) return access
    const evaluation = await evaluateRegistration(connection, studentId, sectionId, false)
    if (!evaluation) {
      return failed(404, "SECTION_NOT_FOUND", "ไม่พบตอนเรียน", "เลือกตอนเรียนที่เปิดอยู่แล้วลองอีกครั้ง")
    }
    const { currentTerm, target, meetings, decision } = evaluation
    const blocking = blockingIssues(decision.issues, allowAdvisoryOverride)
    const expiresAt = Date.now() + 2 * 60_000
    return {
      ok: true,
      data: {
        eligible: blocking.length === 0,
        issues: decision.issues,
        advisoryOverrideAvailable:
          allowAdvisoryOverride && decision.issues.length > 0 && blocking.length === 0,
        term: currentTerm,
        course: {
          courseCode: target.course_code,
          nameTh: target.name_th,
          nameEn: target.name_en,
          credits: Number(target.credits),
        },
        section: {
          id: target.section_id,
          sectionNo: target.section_no,
          remainingSeats: decision.remainingSeats,
          meetings,
        },
        confirmationToken:
          blocking.length === 0
            ? signToken<RegistrationConfirmation>(
                {
                  action: "register",
                  studentId,
                  termId: target.term_id,
                  sectionId: target.section_id,
                  allowAdvisoryOverride,
                  exp: expiresAt,
                },
                config.confirmationSecret,
              )
            : null,
        expiresAt: blocking.length === 0 ? new Date(expiresAt).toISOString() : null,
      },
    }
  } finally {
    connection.release()
  }
}

function parseStoredBody(value: unknown): Record<string, unknown> {
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

async function existingIdempotency(
  connection: PoolConnection,
  studentId: string,
  scope: string,
  key: string,
  requestHash: string,
): Promise<IdempotencyRow | null> {
  const [rows] = await connection.query<IdempotencyRow[]>(
    [
      "SELECT request_hash, response_status, response_body",
      "FROM idempotency_records",
      "WHERE student_id = ? AND scope = ? AND (idempotency_key = ? OR request_hash = ?)",
      "AND expires_at > CURRENT_TIMESTAMP",
      "ORDER BY CASE WHEN idempotency_key = ? THEN 0 ELSE 1 END",
      "LIMIT 1",
    ].join(" "),
    [studentId, scope, key, requestHash, key],
  )
  return rows[0] ?? null
}

async function deleteExpiredIdempotency(
  connection: PoolConnection,
  studentId: string,
  scope: string,
  key: string,
  requestHash: string,
): Promise<void> {
  await connection.query(
    [
      "DELETE FROM idempotency_records",
      "WHERE student_id = ? AND scope = ? AND (idempotency_key = ? OR request_hash = ?)",
      "AND expires_at <= CURRENT_TIMESTAMP",
    ].join(" "),
    [studentId, scope, key, requestHash],
  )
}

async function replayOrConflict(
  connection: PoolConnection,
  studentId: string,
  scope: string,
  key: string,
  requestHash: string,
): Promise<ServiceResult<Record<string, unknown>> | null> {
  const stored = await existingIdempotency(connection, studentId, scope, key, requestHash)
  if (!stored) return null
  if (stored.request_hash !== requestHash) {
    return failed(409, "IDEMPOTENCY_CONFLICT", "คีย์คำขอถูกใช้แล้ว", "สร้างคีย์คำขอใหม่ก่อนยืนยันรายการอื่น")
  }
  return {
    ok: true,
    data: parseStoredBody(stored.response_body),
    status: stored.response_status,
  }
}

const isDuplicateEntry = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      String((error as { code: unknown }).code) === "ER_DUP_ENTRY",
  )

export async function commitRegistration(
  studentId: string,
  confirmationToken: string,
  idempotencyKey: string,
): Promise<ServiceResult<Record<string, unknown>>> {
  const payload = verifyToken<RegistrationConfirmation>(
    confirmationToken,
    config.confirmationSecret,
  )
  if (payload?.action !== "register" || payload.studentId !== studentId) {
    return failed(
      409,
      "CONFIRMATION_INVALID",
      "ยืนยันรายการไม่ได้",
      "ข้อมูลยืนยันหมดอายุหรือไม่ตรงกับผู้ใช้ กรุณาตรวจสอบรายการใหม่",
    )
  }
  const scope = "register"
  const requestHash = hashRequest({ confirmationToken })
  const initialConnection = await pool.getConnection()
  try {
    await deleteExpiredIdempotency(initialConnection, studentId, scope, idempotencyKey, requestHash)
    const replay = await replayOrConflict(
      initialConnection,
      studentId,
      scope,
      idempotencyKey,
      requestHash,
    )
    if (replay) return replay
  } finally {
    initialConnection.release()
  }

  try {
    return await runTransaction<ServiceResult<Record<string, unknown>>>(async (tx) => {
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
      const concurrentReplay = await replayOrConflict(
        tx,
        studentId,
        scope,
        idempotencyKey,
        requestHash,
      )
      if (concurrentReplay) return { commit: false, value: concurrentReplay }
      const access = await requireRegistrationAccess(tx, studentId, payload.termId, true)
      if (access) return { commit: false, value: access }
      const evaluation = await evaluateRegistration(tx, studentId, payload.sectionId, true)
      if (!evaluation) {
        return {
          commit: false,
          value: failed(404, "SECTION_NOT_FOUND", "ไม่พบตอนเรียน", "เลือกตอนเรียนที่เปิดอยู่แล้วลองอีกครั้ง"),
        }
      }
      const blocking = blockingIssues(evaluation.decision.issues, payload.allowAdvisoryOverride)
      if (blocking.length > 0) {
        return { commit: false, value: ruleFailure(blocking) }
      }

      const [existingRows] = await tx.query<RegistrationRecordRow[]>(
        [
          "SELECT id, status, section_id FROM registrations",
          "WHERE student_id = ? AND term_id = ? AND course_code = ?",
          "LIMIT 1 FOR UPDATE",
        ].join(" "),
        [studentId, payload.termId, evaluation.target.course_code],
      )
      const prior = existingRows[0]
      if (prior && prior.status !== "dropped" && prior.status !== "removed") {
        return {
          commit: false,
          value: failed(
            409,
            "DUPLICATE_COURSE",
            "ไม่สามารถลงทะเบียนได้",
            "มีรายวิชานี้ในประวัติภาคการศึกษาแล้ว",
          ),
        }
      }

      const [seatResult] = await tx.execute<ResultSetHeader>(
        [
          "UPDATE sections SET local_active = local_active + 1",
          "WHERE id = ? AND active = true AND closed = false",
          "AND baseline_enrolled + local_active < capacity",
        ].join(" "),
        [payload.sectionId],
      )
      if (seatResult.affectedRows !== 1) {
        return {
          commit: false,
          value: failed(409, "SECTION_FULL", "ตอนเรียนเต็มแล้ว", "เลือกตอนเรียนอื่นแล้วลองอีกครั้ง"),
        }
      }

      let registrationId: number
      let eventAction: "registered" | "reactivated"
      if (prior) {
        await tx.query(
          [
            "UPDATE registrations",
            "SET offering_id = ?, section_id = ?, status = 'active', credits = ?,",
            "registered_at = CURRENT_TIMESTAMP",
            "WHERE id = ?",
          ].join(" "),
          [
            evaluation.target.offering_id,
            payload.sectionId,
            Number(evaluation.target.credits),
            prior.id,
          ],
        )
        registrationId = prior.id
        eventAction = "reactivated"
      } else {
        const [result] = await tx.execute<ResultSetHeader>(
          [
            "INSERT INTO registrations",
            "(student_id, term_id, course_code, offering_id, section_id, status, credits)",
            "VALUES (?, ?, ?, ?, ?, 'active', ?)",
          ].join(" "),
          [
            studentId,
            payload.termId,
            evaluation.target.course_code,
            evaluation.target.offering_id,
            payload.sectionId,
            Number(evaluation.target.credits),
          ],
        )
        registrationId = result.insertId
        eventAction = "registered"
      }

      const responseBody = {
        registrationId,
        status: "active",
        courseCode: evaluation.target.course_code,
        sectionId: payload.sectionId,
        sectionNo: evaluation.target.section_no,
      }
      await tx.query(
        [
          "INSERT INTO registration_events",
          "(registration_id, student_id, action, snapshot)",
          "VALUES (?, ?, ?, ?)",
        ].join(" "),
        [registrationId, studentId, eventAction, JSON.stringify(responseBody)],
      )
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
  } catch (error) {
    if (isDuplicateEntry(error)) {
      const retryConnection = await pool.getConnection()
      try {
        const replay = await replayOrConflict(
          retryConnection,
          studentId,
          scope,
          idempotencyKey,
          requestHash,
        )
        if (replay) return replay
      } finally {
        retryConnection.release()
      }
    }
    throw error
  }
}

export async function registrationBatchPreview(
  studentId: string,
  choices: RegistrationChoiceInput[],
  allowAdvisoryOverride = false,
): Promise<ServiceResult<Record<string, unknown>>> {
  const connection = await pool.getConnection()
  try {
    const access = await requireRegistrationAccess(connection, studentId)
    if (access) return access
    const evaluation = await evaluateRegistrationBatch(
      connection,
      studentId,
      choices,
      false,
      allowAdvisoryOverride,
    )
    if (!evaluation) {
      return failed(409, "CURRENT_TERM_UNAVAILABLE", "ไม่พบภาคการศึกษาปัจจุบัน", "ลองใหม่อีกครั้งภายหลัง")
    }
    if (evaluation.missingPrimaryIndexes.length > 0) {
      return failed(404, "SECTION_NOT_FOUND", "ไม่พบตอนเรียน", "เลือกตอนเรียนที่เปิดอยู่แล้วลองอีกครั้ง", {
        itemIndexes: evaluation.missingPrimaryIndexes,
      })
    }
    if (evaluation.invalidAlternateIndexes.length > 0) {
      return failed(
        400,
        "ALTERNATE_SECTION_COURSE_MISMATCH",
        "ตอนเรียนทางเลือกไม่ถูกต้อง",
        "ตอนเรียนหลักและตอนเรียนทางเลือกต้องเป็นรายวิชาเดียวกัน",
        { itemIndexes: evaluation.invalidAlternateIndexes },
      )
    }
    const items = evaluation.decisions.map((item) => {
      const primary = evaluation.targetBySection.get(choices[item.requestIndex]?.sectionId ?? -1)
      const selected = item.chosen ? evaluation.targetBySection.get(item.chosen.sectionId) : primary
      const issues = item.decision?.issues ?? []
      return {
        requestIndex: item.requestIndex,
        eligible: item.chosen !== null,
        issues,
        advisoryOverrideAvailable:
          allowAdvisoryOverride &&
          issues.length > 0 &&
          blockingIssues(issues, allowAdvisoryOverride).length === 0,
        course: selected
          ? {
              courseCode: selected.course_code,
              nameTh: selected.name_th,
              nameEn: selected.name_en,
              credits: Number(selected.credits),
            }
          : null,
        section: selected
          ? {
              id: selected.section_id,
              sectionNo: selected.section_no,
              remainingSeats: Math.max(
                0,
                selected.capacity - selected.baseline_enrolled - selected.local_active,
              ),
              meetings: evaluation.meetingsBySection.get(selected.section_id) ?? [],
            }
          : null,
      }
    })
    const eligible = items.length > 0 && items.every((item) => item.eligible)
    const expiresAt = Date.now() + 2 * 60_000
    return {
      ok: true,
      data: {
        eligible,
        items,
        confirmationToken: eligible
          ? signToken<BatchRegistrationConfirmation>(
              {
                action: "register-batch",
                studentId,
                termId: evaluation.currentTerm.id,
                choices,
                allowAdvisoryOverride,
                exp: expiresAt,
              },
              config.confirmationSecret,
            )
          : null,
        expiresAt: eligible ? new Date(expiresAt).toISOString() : null,
      },
    }
  } finally {
    connection.release()
  }
}

export async function commitRegistrationBatch(
  studentId: string,
  confirmationToken: string,
  idempotencyKey: string,
): Promise<ServiceResult<Record<string, unknown>>> {
  const payload = verifyToken<BatchRegistrationConfirmation>(
    confirmationToken,
    config.confirmationSecret,
  )
  if (
    payload?.action !== "register-batch" ||
    payload.studentId !== studentId ||
    !Array.isArray(payload.choices) ||
    payload.choices.length === 0 ||
    payload.choices.length > 20
  ) {
    return failed(
      409,
      "CONFIRMATION_INVALID",
      "ยืนยันรายการไม่ได้",
      "ข้อมูลยืนยันหมดอายุหรือไม่ตรงกับผู้ใช้ กรุณาตรวจสอบรายการใหม่",
    )
  }
  const scope = "register-batch"
  const requestHash = hashRequest({ confirmationToken })
  const initialConnection = await pool.getConnection()
  try {
    await deleteExpiredIdempotency(initialConnection, studentId, scope, idempotencyKey, requestHash)
    const replay = await replayOrConflict(
      initialConnection,
      studentId,
      scope,
      idempotencyKey,
      requestHash,
    )
    if (replay) return replay
  } finally {
    initialConnection.release()
  }

  try {
    return await runTransaction<ServiceResult<Record<string, unknown>>>(async (tx) => {
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
      const replay = await replayOrConflict(tx, studentId, scope, idempotencyKey, requestHash)
      if (replay) return { commit: false, value: replay }

      const access = await requireRegistrationAccess(tx, studentId, payload.termId, true)
      if (access) return { commit: false, value: access }

      const evaluation = await evaluateRegistrationBatch(
        tx,
        studentId,
        payload.choices,
        true,
        payload.allowAdvisoryOverride,
      )
      if (!evaluation || evaluation.currentTerm.id !== payload.termId) {
        return {
          commit: false,
          value: failed(
            409,
            "CURRENT_TERM_CHANGED",
            "ภาคการศึกษาปัจจุบันเปลี่ยนแล้ว",
            "ตรวจสอบรายการใหม่ก่อนยืนยันอีกครั้ง",
          ),
        }
      }
      if (
        evaluation.missingPrimaryIndexes.length > 0 ||
        evaluation.invalidAlternateIndexes.length > 0
      ) {
        return {
          commit: false,
          value: failed(
            409,
            "CONFIRMATION_INVALID",
            "ยืนยันรายการไม่ได้",
            "ตอนเรียนในรายการเปลี่ยนแปลงแล้ว",
          ),
        }
      }
      const rejected = evaluation.decisions.find((item) => item.chosen === null)
      if (rejected) {
        return {
          commit: false,
          value: ruleFailure(rejected.decision?.issues ?? []),
        }
      }

      const priorByCourse = new Map(
        evaluation.existing.summaries.map((registration) => [
          registration.courseCode,
          registration,
        ]),
      )
      const registrations: Array<Record<string, unknown>> = []
      const events: Array<{
        registrationId: number
        action: "registered" | "reactivated"
        snapshot: Record<string, unknown>
      }> = []
      for (const item of evaluation.decisions) {
        const chosen = item.chosen
        if (!chosen) continue
        const target = evaluation.targetBySection.get(chosen.sectionId)
        if (!target) {
          return {
            commit: false,
            value: failed(
              409,
              "CONFIRMATION_INVALID",
              "ยืนยันรายการไม่ได้",
              "ตอนเรียนในรายการเปลี่ยนแปลงแล้ว",
            ),
          }
        }
        const [seatResult] = await tx.execute<ResultSetHeader>(
          [
            "UPDATE sections SET local_active = local_active + 1",
            "WHERE id = ? AND active = true AND closed = false",
            "AND baseline_enrolled + local_active < capacity",
          ].join(" "),
          [target.section_id],
        )
        if (seatResult.affectedRows !== 1) {
          return {
            commit: false,
            value: failed(409, "SECTION_FULL", "ตอนเรียนเต็มแล้ว", "เลือกตอนเรียนอื่นแล้วลองอีกครั้ง"),
          }
        }

        const prior = priorByCourse.get(target.course_code)
        let registrationId: number
        let eventAction: "registered" | "reactivated"
        if (prior?.status === "dropped" || prior?.status === "removed") {
          await tx.query(
            [
              "UPDATE registrations",
              "SET offering_id = ?, section_id = ?, status = 'active', credits = ?,",
              "registered_at = CURRENT_TIMESTAMP",
              "WHERE id = ?",
            ].join(" "),
            [target.offering_id, target.section_id, Number(target.credits), prior.registrationId],
          )
          registrationId = prior.registrationId
          eventAction = "reactivated"
        } else {
          const [result] = await tx.execute<ResultSetHeader>(
            [
              "INSERT INTO registrations",
              "(student_id, term_id, course_code, offering_id, section_id, status, credits)",
              "VALUES (?, ?, ?, ?, ?, 'active', ?)",
            ].join(" "),
            [
              studentId,
              payload.termId,
              target.course_code,
              target.offering_id,
              target.section_id,
              Number(target.credits),
            ],
          )
          registrationId = result.insertId
          eventAction = "registered"
        }
        const response = {
          registrationId,
          status: "active",
          courseCode: target.course_code,
          sectionId: target.section_id,
          sectionNo: target.section_no,
        }
        registrations.push(response)
        events.push({ registrationId, action: eventAction, snapshot: response })
      }

      if (events.length > 0) {
        const placeholders = events.map(() => "(?, ?, ?, ?)").join(",")
        await tx.query(
          [
            "INSERT INTO registration_events",
            "(registration_id, student_id, action, snapshot)",
            `VALUES ${placeholders}`,
          ].join(" "),
          events.flatMap((event) => [
            event.registrationId,
            studentId,
            event.action,
            JSON.stringify(event.snapshot),
          ]),
        )
      }
      const responseBody = { registrations, status: "active" }
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
  } catch (error) {
    if (isDuplicateEntry(error)) {
      const retryConnection = await pool.getConnection()
      try {
        const replay = await replayOrConflict(
          retryConnection,
          studentId,
          scope,
          idempotencyKey,
          requestHash,
        )
        if (replay) return replay
      } finally {
        retryConnection.release()
      }
    }
    throw error
  }
}

export async function listRegistrations(
  studentId: string,
): Promise<{ term: Record<string, unknown> | null; registrations: RegistrationSummary[] }> {
  const connection = await pool.getConnection()
  try {
    const result = await listCurrentRegistrations(connection, studentId)
    return {
      term: result.term
        ? {
            id: result.term.id,
            academicYear: result.term.academic_year,
            semester: result.term.semester,
            label: result.term.label,
          }
        : null,
      registrations: result.registrations,
    }
  } finally {
    connection.release()
  }
}
