import type { PoolConnection, RowDataPacket } from "mysql2/promise"
import { compareSectionNo } from "../../shared/section-sort"
import {
  runRegistrationBatch,
  runRegistrationPipeline,
  type CourseExams,
  type ExistingRegistration,
  type MeetingSlot,
  type RegistrationCandidate,
} from "./pipeline"

export interface CurrentTermRow extends RowDataPacket {
  id: number
  academic_year: number
  semester: number
  label: string
}

export interface TargetRow extends RowDataPacket {
  section_id: number
  section_no: string
  section_active: number
  section_closed: number
  capacity: number
  baseline_enrolled: number
  local_active: number
  offering_id: number
  term_id: number
  course_code: string
  name_th: string
  name_en: string
  credits: number
  prerequisite_text: string | null
  midterm_date: string | null
  midterm_start_minute: number | null
  midterm_end_minute: number | null
  final_date: string | null
  final_start_minute: number | null
  final_end_minute: number | null
}

export interface MeetingRow extends RowDataPacket {
  section_id: number
  day_code: string | null
  start_minute: number | null
  end_minute: number | null
  arranged: number
  class_type: string | null
  period_label: string | null
  building: string | null
  room: string | null
  teachers: string[] | string | null
}

interface ExistingRow extends MeetingRow {
  short_name: string | null
  registration_id: number
  course_code: string
  status: "active" | "dropped" | "withdrawn" | "removed"
  credits: number
  offering_id: number
  section_no: string
  name_th: string
  name_en: string
  midterm_date: string | null
  midterm_start_minute: number | null
  midterm_end_minute: number | null
  final_date: string | null
  final_start_minute: number | null
  final_end_minute: number | null
}

interface CompletedRow extends RowDataPacket {
  course_code: string
}

export interface RegistrationSummary {
  shortName?: string | null
  registrationId: number
  courseCode: string
  nameTh: string
  nameEn: string
  credits: number
  status: "active" | "dropped" | "withdrawn" | "removed"
  offeringId: number
  sectionId: number
  sectionNo: string
  meetings: Array<
    MeetingSlot & {
      classType: string
      periodLabel: string
      building: string | null
      room: string | null
      teachers: string[]
    }
  >
}

export async function getCurrentTerm(connection: PoolConnection, lock = false): Promise<CurrentTermRow | null> {
  const [rows] = await connection.query<CurrentTermRow[]>(
    [
      "SELECT t.id, t.academic_year, t.semester, t.label",
      "FROM app_settings a",
      "INNER JOIN academic_terms t ON t.id = CAST(a.value AS UNSIGNED)",
      "WHERE a.`key` = 'current_term_id'",
      "LIMIT 1",
      ...(lock ? ["FOR SHARE"] : []),
    ].join(" "),
  )
  return rows[0] ?? null
}

export async function getTarget(
  connection: PoolConnection,
  sectionId: number,
  forUpdate = false,
): Promise<TargetRow | null> {
  return (await getTargets(connection, [sectionId], forUpdate))[0] ?? null
}

export async function getTargets(
  connection: PoolConnection,
  sectionIds: number[],
  forUpdate = false,
): Promise<TargetRow[]> {
  if (sectionIds.length === 0) return []
  const ids = [...new Set(sectionIds)].sort((first, second) => first - second)
  const placeholders = ids.map(() => "?").join(",")
  const [rows] = await connection.query<TargetRow[]>(
    [
      "SELECT s.id AS section_id, s.section_no, s.active AS section_active,",
      "s.closed AS section_closed, s.capacity, s.baseline_enrolled, s.local_active,",
      "o.id AS offering_id, o.term_id, o.course_code, o.name_th, o.name_en,",
      "o.credits, o.prerequisite_text,",
      "DATE_FORMAT(o.midterm_date, '%Y-%m-%d') AS midterm_date,",
      "o.midterm_start_minute, o.midterm_end_minute,",
      "DATE_FORMAT(o.final_date, '%Y-%m-%d') AS final_date,",
      "o.final_start_minute, o.final_end_minute",
      "FROM sections s",
      "INNER JOIN course_offerings o ON o.id = s.offering_id",
      `WHERE s.id IN (${placeholders}) AND o.active = true`,
      "ORDER BY s.id",
      forUpdate ? "FOR UPDATE OF s" : "",
    ].join(" "),
    ids,
  )
  return rows
}

export function meetingSlot(row: MeetingRow): MeetingSlot {
  return {
    dayCode: row.day_code,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    arranged: Boolean(row.arranged),
  }
}

function examSlot(date: string | null, startMinute: number | null, endMinute: number | null) {
  return date === null || startMinute === null || endMinute === null
    ? null
    : { date, startMinute, endMinute }
}

function examsOf(row: TargetRow | ExistingRow): CourseExams {
  return {
    midterm: examSlot(row.midterm_date, row.midterm_start_minute, row.midterm_end_minute),
    final: examSlot(row.final_date, row.final_start_minute, row.final_end_minute),
  }
}

function teachersOf(value: MeetingRow["teachers"]): string[] {
  if (Array.isArray(value)) return value
  if (typeof value !== "string") return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export async function meetingsForSections(
  connection: PoolConnection,
  sectionIds: number[],
): Promise<MeetingRow[]> {
  if (sectionIds.length === 0) return []
  const placeholders = sectionIds.map(() => "?").join(",")
  const [rows] = await connection.query<MeetingRow[]>(
    [
      "SELECT section_id, day_code, start_minute, end_minute, arranged,",
      "class_type, period_label, building, room, teachers",
      "FROM section_meetings",
      `WHERE section_id IN (${placeholders})`,
      "ORDER BY day_code, start_minute",
    ].join(" "),
    sectionIds,
  )
  return rows
}

export async function existingRegistrations(
  connection: PoolConnection,
  studentId: string,
  termId: number,
): Promise<{ pipeline: ExistingRegistration[]; summaries: RegistrationSummary[] }> {
  const [rows] = await connection.query<ExistingRow[]>(
    [
      "SELECT r.id AS registration_id, r.course_code, r.status, r.credits,",
      "r.offering_id, r.section_id, s.section_no, o.name_th, o.name_en, o.short_name,",
      "DATE_FORMAT(o.midterm_date, '%Y-%m-%d') AS midterm_date,",
      "o.midterm_start_minute, o.midterm_end_minute,",
      "DATE_FORMAT(o.final_date, '%Y-%m-%d') AS final_date,",
      "o.final_start_minute, o.final_end_minute,",
      "m.day_code, m.start_minute, m.end_minute, m.arranged,",
      "m.class_type, m.period_label, m.building, m.room, m.teachers",
      "FROM registrations r",
      "INNER JOIN sections s ON s.id = r.section_id",
      "INNER JOIN course_offerings o ON o.id = r.offering_id",
      "LEFT JOIN section_meetings m ON m.section_id = r.section_id",
      "WHERE r.student_id = ? AND r.term_id = ?",
      "ORDER BY r.id, m.day_code, m.start_minute",
    ].join(" "),
    [studentId, termId],
  )
  const grouped = new Map<number, RegistrationSummary>()
  const firstRowByRegistration = new Map<number, ExistingRow>()
  for (const row of rows) {
    if (!firstRowByRegistration.has(row.registration_id)) {
      firstRowByRegistration.set(row.registration_id, row)
    }
    const summary = grouped.get(row.registration_id) ?? {
      registrationId: row.registration_id,
      courseCode: row.course_code,
      nameTh: row.name_th,
      nameEn: row.name_en,
      shortName: row.short_name,
      credits: Number(row.credits),
      status: row.status,
      offeringId: row.offering_id,
      sectionId: row.section_id,
      sectionNo: row.section_no,
      meetings: [],
    }
    if (row.class_type && row.period_label) {
      summary.meetings.push({
        ...meetingSlot(row),
        classType: row.class_type,
        periodLabel: row.period_label,
        building: row.building,
        room: row.room,
        teachers: teachersOf(row.teachers),
      })
    }
    grouped.set(row.registration_id, summary)
  }
  const summaries = [...grouped.values()].sort(
    (first, second) =>
      first.courseCode.localeCompare(second.courseCode) ||
      compareSectionNo(first.sectionNo, second.sectionNo),
  )
  return {
    summaries,
    pipeline: summaries.map((summary) => ({
      registrationId: summary.registrationId,
      courseCode: summary.courseCode,
      status: summary.status,
      credits: summary.credits,
      meetings: summary.meetings.map(({ dayCode, startMinute, endMinute, arranged }) => ({
        dayCode,
        startMinute,
        endMinute,
        arranged,
      })),
      exams: firstRowByRegistration.has(summary.registrationId)
        ? examsOf(firstRowByRegistration.get(summary.registrationId) as ExistingRow)
        : { midterm: null, final: null },
    })),
  }
}

export async function completedCourses(
  connection: PoolConnection,
  studentId: string,
): Promise<Set<string>> {
  const [rows] = await connection.query<CompletedRow[]>(
    "SELECT course_code FROM student_completed_courses WHERE student_id = ?",
    [studentId],
  )
  return new Set(rows.map((row) => row.course_code))
}

export interface RegistrationSectionChoice {
  sectionId: number
  alternateSectionId?: number
}

const candidateOf = (target: TargetRow, meetings: MeetingRow[]): RegistrationCandidate => ({
  termId: target.term_id,
  courseCode: target.course_code,
  credits: Number(target.credits),
  prerequisiteText: target.prerequisite_text,
  sectionId: target.section_id,
  sectionActive: Boolean(target.section_active),
  sectionClosed: Boolean(target.section_closed),
  remainingSeats: Math.max(0, target.capacity - target.baseline_enrolled - target.local_active),
  targetMeetings: meetings.map(meetingSlot),
  targetExams: examsOf(target),
})

export async function evaluateRegistrationBatch(
  connection: PoolConnection,
  studentId: string,
  choices: RegistrationSectionChoice[],
  lock: boolean,
  allowAdvisoryOverride: boolean,
) {
  const currentTerm = await getCurrentTerm(connection)
  if (!currentTerm) return null
  const requestedIds = choices.flatMap((choice) =>
    choice.alternateSectionId === undefined
      ? [choice.sectionId]
      : [choice.sectionId, choice.alternateSectionId],
  )
  const targets = await getTargets(connection, requestedIds, lock)
  const targetBySection = new Map(targets.map((target) => [target.section_id, target]))
  const meetingRows = await meetingsForSections(
    connection,
    targets.map((target) => target.section_id),
  )
  const meetingsBySection = new Map<number, MeetingRow[]>()
  for (const meeting of meetingRows) {
    const rows = meetingsBySection.get(meeting.section_id) ?? []
    rows.push(meeting)
    meetingsBySection.set(meeting.section_id, rows)
  }
  const existing = await existingRegistrations(connection, studentId, currentTerm.id)
  const completed = await completedCourses(connection, studentId)
  const missingPrimaryIndexes: number[] = []
  const invalidAlternateIndexes: number[] = []
  const candidateChoices = choices.map((choice, requestIndex) => {
    const primary = targetBySection.get(choice.sectionId)
    if (!primary) missingPrimaryIndexes.push(requestIndex)
    const alternate =
      choice.alternateSectionId === undefined
        ? undefined
        : targetBySection.get(choice.alternateSectionId)
    if (primary && alternate && primary.course_code !== alternate.course_code) {
      invalidAlternateIndexes.push(requestIndex)
    }
    const candidates = [primary, alternate]
      .filter(
        (target): target is TargetRow =>
          target !== undefined &&
          (!primary || target === primary || target.course_code === primary.course_code),
      )
      .map((target) => candidateOf(target, meetingsBySection.get(target.section_id) ?? []))
    return { requestIndex, candidates }
  })
  const decisions = runRegistrationBatch({
    studentId,
    currentTermId: currentTerm.id,
    choices: candidateChoices,
    existing: existing.pipeline,
    completedCourseCodes: completed,
    allowAdvisoryOverride,
  })
  return {
    currentTerm,
    targets,
    targetBySection,
    meetingsBySection,
    existing,
    decisions,
    missingPrimaryIndexes,
    invalidAlternateIndexes,
  }
}

export async function evaluateRegistration(
  connection: PoolConnection,
  studentId: string,
  sectionId: number,
  lock: boolean,
) {
  const currentTerm = await getCurrentTerm(connection)
  const target = await getTarget(connection, sectionId, lock)
  if (!currentTerm || !target) return null
  const [meetings, existing, completed] = await Promise.all([
    meetingsForSections(connection, [target.section_id]),
    existingRegistrations(connection, studentId, target.term_id),
    completedCourses(connection, studentId),
  ])
  const decision = runRegistrationPipeline({
    studentId,
    termId: target.term_id,
    currentTermId: currentTerm.id,
    courseCode: target.course_code,
    credits: Number(target.credits),
    prerequisiteText: target.prerequisite_text,
    sectionId: target.section_id,
    sectionActive: Boolean(target.section_active),
    sectionClosed: Boolean(target.section_closed),
    remainingSeats: Math.max(0, target.capacity - target.baseline_enrolled - target.local_active),
    targetMeetings: meetings.map(meetingSlot),
    targetExams: examsOf(target),
    existing: existing.pipeline,
    completedCourseCodes: completed,
  })
  return { currentTerm, target, meetings, existing, decision }
}

export async function listCurrentRegistrations(connection: PoolConnection, studentId: string) {
  const term = await getCurrentTerm(connection)
  if (!term) return { term: null, registrations: [] }
  const existing = await existingRegistrations(connection, studentId, term.id)
  return { term, registrations: existing.summaries.filter((registration) => registration.status !== "removed") }
}
