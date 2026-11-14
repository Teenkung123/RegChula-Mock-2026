import { t } from "elysia"
import type { RowDataPacket } from "mysql2"
import type { PoolConnection } from "mysql2/promise"

const optionalText = (maxLength: number) =>
  t.Optional(t.Union([t.String({ maxLength }), t.Null()]))
const optionalMinute = () =>
  t.Optional(t.Union([t.Integer({ minimum: 0, maximum: 1439 }), t.Null()]))
const optionalDate = () =>
  t.Optional(t.Union([t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), t.Null()]))
const nullableMinute = t.Union([t.Integer({ minimum: 0, maximum: 1439 }), t.Null()])
const nullableDay = t.Union([
  t.Literal("MO"), t.Literal("TU"), t.Literal("WE"), t.Literal("TH"),
  t.Literal("FR"), t.Literal("SA"), t.Literal("SU"), t.Null(),
])

export const offeringDetailFields = {
  shortName: optionalText(255),
  descriptionTh: optionalText(16_000),
  descriptionEn: optionalText(16_000),
  creditHours: optionalText(255),
  prerequisiteText: optionalText(16_000),
  genEdType: optionalText(100),
  studyPrograms: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 32 }), { maxItems: 64 })),
  midtermDate: optionalDate(),
  midtermStartMinute: optionalMinute(),
  midtermEndMinute: optionalMinute(),
  finalDate: optionalDate(),
  finalStartMinute: optionalMinute(),
  finalEndMinute: optionalMinute(),
}

export const sectionDetailFields = {
  note: optionalText(16_000),
  genEdType: optionalText(100),
  meetings: t.Optional(t.Array(t.Object({
    id: t.Optional(t.Integer({ minimum: 1 })),
    classType: t.String({ minLength: 1, maxLength: 80 }),
    dayCode: nullableDay,
    startMinute: nullableMinute,
    endMinute: nullableMinute,
    building: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    room: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    teachers: t.Array(t.String({ minLength: 1, maxLength: 255 }), { maxItems: 100 }),
  }), { maxItems: 100 })),
}

export interface OfferingDetails {
  shortName?: string | null
  descriptionTh?: string | null
  descriptionEn?: string | null
  creditHours?: string | null
  prerequisiteText?: string | null
  genEdType?: string | null
  studyPrograms?: string[]
  midtermDate?: string | null
  midtermStartMinute?: number | null
  midtermEndMinute?: number | null
  finalDate?: string | null
  finalStartMinute?: number | null
  finalEndMinute?: number | null
}

export interface MeetingDetails {
  id?: number
  classType: string
  dayCode: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | null
  startMinute: number | null
  endMinute: number | null
  building: string | null
  room: string | null
  teachers: string[]
}

export interface SectionDetails {
  note?: string | null
  genEdType?: string | null
  meetings?: MeetingDetails[]
}

/** Values are the snake-case columns from the offering selected under a row lock. */
export interface CurrentExamDetails {
  midterm_date: unknown
  midterm_start_minute: number | null
  midterm_end_minute: number | null
  final_date: unknown
  final_start_minute: number | null
  final_end_minute: number | null
}

function validDate(value: unknown): boolean {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(`${text}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text
}

/** Return a user-readable validation error, or null for a valid partial update. */
export function validateOfferingDetails(body: OfferingDetails, current: CurrentExamDetails): string | null {
  if (body.studyPrograms?.some((program) => !program.trim())) return "Study programs cannot be blank"
  for (const exam of ["midterm", "final"] as const) {
    const dateKey = `${exam}Date` as const
    const startKey = `${exam}StartMinute` as const
    const endKey = `${exam}EndMinute` as const
    if (body[dateKey] === undefined && body[startKey] === undefined && body[endKey] === undefined) continue
    const date = body[dateKey] === undefined ? current[`${exam}_date`] : body[dateKey]
    const start = body[startKey] === undefined ? current[`${exam}_start_minute`] : body[startKey]
    const end = body[endKey] === undefined ? current[`${exam}_end_minute`] : body[endKey]
    if (date == null && start == null && end == null) continue
    if (date == null || start == null || end == null || !validDate(date) || start < 0 || end > 1439 || start >= end) {
      return `${exam} requires a valid date and an end time after its start time`
    }
  }
  return null
}

export function validateSectionDetails(body: SectionDetails): string | null {
  for (const meeting of body.meetings ?? []) {
    if (!meeting.classType.trim()) return "Class type cannot be blank"
    if (meeting.teachers.some((teacher) => !teacher.trim())) return "Instructor names cannot be blank"
    if ((meeting.startMinute === null) !== (meeting.endMinute === null)) return "Provide both class times or leave both blank"
    if (meeting.startMinute !== null && meeting.endMinute !== null &&
        (meeting.dayCode === null || meeting.startMinute < 0 || meeting.endMinute > 1439 || meeting.startMinute >= meeting.endMinute)) {
      return "A scheduled class requires a day and an end time after its start time"
    }
  }
  return null
}

const offeringColumns = {
  shortName: "short_name", descriptionTh: "description_th", descriptionEn: "description_en",
  creditHours: "credit_hours", prerequisiteText: "prerequisite_text", genEdType: "gen_ed_type",
  studyPrograms: "study_programs", midtermDate: "midterm_date", midtermStartMinute: "midterm_start_minute",
  midtermEndMinute: "midterm_end_minute", finalDate: "final_date", finalStartMinute: "final_start_minute",
  finalEndMinute: "final_end_minute",
} as const

/** Execute inside the caller's transaction, after locking the offering. */
export async function applyOfferingDetails(conn: PoolConnection, id: number, body: OfferingDetails): Promise<void> {
  const entries = Object.entries(body).filter(([key, value]) => key in offeringColumns && value !== undefined) as Array<[keyof typeof offeringColumns, string | number | null | string[]]>
  if (!entries.length) return
  await conn.execute(`UPDATE course_offerings SET ${entries.map(([key]) => `${offeringColumns[key]} = ?`).join(", ")} WHERE id = ?`, [
    ...entries.map(([key, value]) => key === "studyPrograms" ? JSON.stringify((value as string[]).map((item) => item.trim())) : value), id,
  ])
}

const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`

interface ExistingMeeting extends RowDataPacket {
  id: number
  class_type: string
  day_code: MeetingDetails["dayCode"]
  start_minute: number | null
  end_minute: number | null
  building: string | null
  room: string | null
  teachers: string[] | string
}

function meetingIdError(meetings: MeetingDetails[], existingIds: Set<number>): string | null {
  const submitted = new Set<number>()
  for (const meeting of meetings) {
    if (meeting.id === undefined) continue
    if (!Number.isSafeInteger(meeting.id) || meeting.id < 1 || !existingIds.has(meeting.id)) {
      return "A meeting does not belong to this section"
    }
    if (submitted.has(meeting.id)) return "A meeting cannot appear more than once"
    submitted.add(meeting.id)
  }
  return null
}

/** Validate meeting ownership after locking the section, before making any updates. */
export async function validateSectionMeetingIds(conn: PoolConnection, id: number, body: SectionDetails): Promise<string | null> {
  if (body.meetings === undefined) return null
  const [rows] = await conn.execute<ExistingMeeting[]>("SELECT id FROM section_meetings WHERE section_id = ? FOR UPDATE", [id])
  return meetingIdError(body.meetings, new Set(rows.map((row) => row.id)))
}

function storedTeachers(value: ExistingMeeting["teachers"]): string[] {
  if (Array.isArray(value)) return value
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.map(String) : []
}

function meetingUnchanged(existing: ExistingMeeting, meeting: MeetingDetails): boolean {
  return existing.class_type === meeting.classType && existing.day_code === meeting.dayCode &&
    existing.start_minute === meeting.startMinute && existing.end_minute === meeting.endMinute &&
    existing.building === meeting.building && existing.room === meeting.room &&
    JSON.stringify(storedTeachers(existing.teachers)) === JSON.stringify(meeting.teachers)
}

/** Execute inside the caller's transaction, after locking the section. */
export async function applySectionDetails(conn: PoolConnection, id: number, body: SectionDetails): Promise<void> {
  let existing: ExistingMeeting[] = []
  if (body.meetings !== undefined) {
    ;[existing] = await conn.execute<ExistingMeeting[]>(`SELECT id, class_type, day_code, start_minute, end_minute,
      building, room, teachers FROM section_meetings WHERE section_id = ? FOR UPDATE`, [id])
    const error = meetingIdError(body.meetings, new Set(existing.map((row) => row.id)))
    if (error) throw new Error(error)
  }
  if (body.note !== undefined) await conn.execute("UPDATE sections SET note = ? WHERE id = ?", [body.note, id])
  if (body.genEdType !== undefined) await conn.execute("UPDATE sections SET gen_ed_type = ? WHERE id = ?", [body.genEdType, id])
  if (body.meetings === undefined) return
  const retained = new Set(body.meetings.flatMap((meeting) => meeting.id === undefined ? [] : [meeting.id]))
  for (const row of existing) {
    if (!retained.has(row.id)) await conn.execute("DELETE FROM section_meetings WHERE section_id = ? AND id = ?", [id, row.id])
  }
  const existingById = new Map(existing.map((row) => [row.id, row]))
  for (const meeting of body.meetings) {
    const prior = meeting.id === undefined ? undefined : existingById.get(meeting.id)
    if (prior && meetingUnchanged(prior, meeting)) continue
    const arranged = meeting.dayCode === null || meeting.startMinute === null || meeting.endMinute === null
    const periodLabel = arranged ? "ไม่ระบุเวลา" : `${time(meeting.startMinute as number)}–${time(meeting.endMinute as number)}`
    const values = [meeting.classType.trim(), meeting.dayCode, meeting.startMinute, meeting.endMinute, periodLabel,
      meeting.building, meeting.room, JSON.stringify([...new Set(meeting.teachers.map((teacher) => teacher.trim()))]), arranged]
    if (prior) {
      await conn.execute(`UPDATE section_meetings SET class_type = ?, day_code = ?, start_minute = ?, end_minute = ?,
        period_label = ?, building = ?, room = ?, teachers = ?, arranged = ? WHERE section_id = ? AND id = ?`, [...values, id, prior.id])
    } else {
      await conn.execute(`INSERT INTO section_meetings
        (class_type, day_code, start_minute, end_minute, period_label, building, room, teachers, arranged, section_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...values, id])
    }
  }
}
