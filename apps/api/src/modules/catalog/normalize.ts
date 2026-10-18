import type {
  NormalizedCatalog,
  NormalizedExamSlot,
  NormalizedMeeting,
  NormalizedOffering,
  NormalizedReview,
  NormalizedSection,
  RawCatalog,
  RawClass,
  RawCourse,
  RawDataset,
  RawReview,
  RawSection,
} from "./types"

const validDays = new Set(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
const asText = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}
const nullableText = (value: unknown): string | null => asText(value) || null
const prerequisiteText = (value: unknown): string | null => {
  const normalized = asText(value)
  if (!normalized || ["-", "NONE", "N/A", "NA"].includes(normalized.toUpperCase())) {
    return null
  }
  return normalized
}
const asNumber = (value: unknown, fallback = 0): number => {
  const numeric = typeof value === "number" ? value : Number(asText(value))
  return Number.isFinite(numeric) ? numeric : fallback
}
const asInteger = (value: unknown, fallback = 0): number =>
  Math.max(0, Math.trunc(asNumber(value, fallback)))

const capacityOf = (value: unknown): { current: number; max: number } => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const capacity = value as Record<string, unknown>
    const max = asInteger(capacity.max)
    return { current: asInteger(capacity.current), max }
  }
  return { current: 0, max: asInteger(value) }
}

const minuteOfDay = (value: unknown): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(asText(value))
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

const examDate = (value: unknown, label: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.exec(asText(value))
  if (!match) throw new Error(`${label} date is invalid`)

  const sourceYear = Number(match[1])
  const year = sourceYear >= 2400 ? sourceYear - 543 : sourceYear
  const month = Number(match[2])
  const day = Number(match[3])
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    throw new Error(`${label} date is invalid`)
  }
  return `${String(year).padStart(4, "0")}-${match[2]}-${match[3]}`
}

const examMinute = (value: unknown, label: string): number => {
  const minute = minuteOfDay(value)
  if (minute === null) throw new Error(`${label} time is invalid`)
  return minute
}

function normalizeExamSlot(value: unknown, label: string): NormalizedExamSlot | null {
  if (value === null || value === undefined) return null
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is invalid`)
  }

  const raw = value as Record<string, unknown>
  const periodValue = raw.period
  if (
    periodValue !== null &&
    periodValue !== undefined &&
    (typeof periodValue !== "object" || Array.isArray(periodValue))
  ) {
    throw new Error(`${label} period is invalid`)
  }
  const period = (periodValue as Record<string, unknown> | null | undefined) ?? null
  const dateText = asText(raw.date)
  const startText = asText(period?.start)
  const endText = asText(period?.end)
  if (!dateText && !startText && !endText) return null
  if (!dateText || !startText || !endText) {
    throw new Error(`${label} must contain date, start, and end`)
  }

  const startMinute = examMinute(startText, `${label} start`)
  const endMinute = examMinute(endText, `${label} end`)
  if (endMinute <= startMinute) throw new Error(`${label} time range is invalid`)
  return {
    date: examDate(dateText, label),
    startMinute,
    endMinute,
  }
}

const termKey = (academicYear: number, semester: number): string => `${academicYear}|${semester}`
const offeringKey = (academicYear: number, semester: number, courseCode: string): string =>
  `${termKey(academicYear, semester)}|${courseCode}`

function requirePositiveInteger(value: unknown, label: string): number {
  const parsed = Math.trunc(asNumber(value, Number.NaN))
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} is invalid`)
  return parsed
}

function normalizeMeeting(raw: RawClass): NormalizedMeeting {
  const classType = asText(raw.type) || "CLASS"
  const rawDay = asText(raw.dayOfWeek).toUpperCase()
  const period =
    raw.period && typeof raw.period === "object" && !Array.isArray(raw.period)
      ? (raw.period as Record<string, unknown>)
      : null
  const startMinute = period ? minuteOfDay(period.start) : null
  const endMinute = period ? minuteOfDay(period.end) : null
  const dayCode = validDays.has(rawDay) ? rawDay : null
  const arranged =
    dayCode === null || startMinute === null || endMinute === null || endMinute <= startMinute
  const periodLabel = arranged ? "ไม่ระบุเวลา" : `${asText(period?.start)}–${asText(period?.end)}`

  return {
    classType,
    dayCode,
    startMinute: arranged ? null : startMinute,
    endMinute: arranged ? null : endMinute,
    periodLabel,
    building: nullableText(raw.building),
    room: nullableText(raw.room),
    teachers: [...new Set(asArray<unknown>(raw.teachers).map(asText).filter(Boolean))].sort(),
    arranged,
  }
}

function meetingFingerprint(meeting: NormalizedMeeting): string {
  return JSON.stringify([
    meeting.classType,
    meeting.dayCode,
    meeting.startMinute,
    meeting.endMinute,
    meeting.building,
    meeting.room,
    meeting.teachers,
  ])
}

function normalizeSection(raw: RawSection): NormalizedSection {
  const sectionNo = asText(raw.sectionNo)
  if (!sectionNo) throw new Error("sectionNo is missing")
  const capacity = capacityOf(raw.capacity)
  const meetings = new Map<string, NormalizedMeeting>()
  for (const classRow of asArray<RawClass>(raw.classes)) {
    const meeting = normalizeMeeting(classRow)
    meetings.set(meetingFingerprint(meeting), meeting)
  }

  return {
    sectionNo,
    closed: Boolean(raw.closed),
    capacity: capacity.max,
    baselineEnrolled: capacity.current,
    note: nullableText(raw.note),
    genEdType: nullableText(raw.genEdType),
    meetings: [...meetings.values()],
  }
}

function mergeText(first: string | null, next: string | null): string | null {
  const values = [...new Set([first, next].filter((value): value is string => Boolean(value)))]
  return values.length > 0 ? values.sort().join(" / ") : null
}

function mergeSection(target: NormalizedSection, incoming: NormalizedSection): void {
  target.capacity = Math.max(target.capacity, incoming.capacity)
  target.baselineEnrolled = Math.max(target.baselineEnrolled, incoming.baselineEnrolled)
  target.closed &&= incoming.closed
  target.note = mergeText(target.note, incoming.note)
  target.genEdType = mergeText(target.genEdType, incoming.genEdType)
  const meetings = new Map(target.meetings.map((meeting) => [meetingFingerprint(meeting), meeting]))
  for (const meeting of incoming.meetings) meetings.set(meetingFingerprint(meeting), meeting)
  target.meetings = [...meetings.values()]
}

function normalizeOffering(
  dataset: RawDataset,
  raw: RawCourse,
  fallbackYear: number,
  fallbackSemester: number,
): NormalizedOffering {
  const academicYear = asInteger(raw.academicYear, fallbackYear) || fallbackYear
  const semester = asInteger(raw.semester, fallbackSemester) || fallbackSemester
  const courseCode = asText(raw.courseNo)
  if (!courseCode) throw new Error("courseNo is missing")
  const nameTh = asText(raw.courseNameTh) || asText(raw.courseDescTh) || courseCode
  const nameEn = asText(raw.courseNameEn) || asText(raw.courseDescEn) || courseCode

  return {
    academicYear,
    semester,
    termLabel: asText(dataset.termLabel) || asText(dataset.term) || `${academicYear}/${semester}`,
    courseCode,
    nameTh,
    nameEn,
    shortName: nullableText(raw.abbrName),
    descriptionTh: nullableText(raw.courseDescTh),
    descriptionEn: nullableText(raw.courseDescEn),
    faculty: asText(raw.faculty) || "ไม่ระบุคณะ",
    department: asText(raw.department) || "ไม่ระบุภาควิชา",
    credits: Math.max(0, asNumber(raw.credit)),
    creditHours: nullableText(raw.creditHours),
    prerequisiteText: prerequisiteText(raw.courseCondition),
    genEdType: nullableText(raw.genEdType),
    midterm: normalizeExamSlot(raw.midterm, `${academicYear}/${semester} ${courseCode} midterm`),
    final: normalizeExamSlot(raw.final, `${academicYear}/${semester} ${courseCode} final`),
    studyPrograms: [asText(dataset.studyProgram) || "UNKNOWN"],
    sections: asArray<RawSection>(raw.sections).map(normalizeSection),
  }
}

const strictOfferingFields = [
  "nameTh",
  "nameEn",
  "shortName",
  "descriptionTh",
  "descriptionEn",
  "faculty",
  "department",
  "credits",
  "prerequisiteText",
] as const

function preferredGenEdType(first: string | null, next: string | null): string | null {
  const values = [...new Set([first, next].filter((value): value is string => Boolean(value)))]
  return values.find((value) => value !== "NO") ?? values[0] ?? null
}

function mergeOffering(
  target: NormalizedOffering,
  incoming: NormalizedOffering,
  conflicts: string[],
  warnings: string[],
  examConflictKeys: Set<string>,
): void {
  const context = `${target.academicYear}/${target.semester} ${target.courseCode}`
  for (const field of strictOfferingFields) {
    if (target[field] !== incoming[field]) {
      conflicts.push(`${context}: conflicting ${field}`)
    }
  }
  if (target.creditHours !== incoming.creditHours) {
    target.creditHours = mergeText(target.creditHours, incoming.creditHours)
    const warning = `${context}: merged program-specific creditHours`
    if (!warnings.includes(warning)) warnings.push(warning)
  }
  if (target.genEdType !== incoming.genEdType) {
    target.genEdType = preferredGenEdType(target.genEdType, incoming.genEdType)
    const warning = `${context}: selected program-specific genEdType`
    if (!warnings.includes(warning)) warnings.push(warning)
  }
  for (const examType of ["midterm", "final"] as const) {
    const conflictKey = `${context}|${examType}`
    if (examConflictKeys.has(conflictKey)) continue
    const existing = target[examType]
    const incomingExam = incoming[examType]
    if (!existing && incomingExam) target[examType] = incomingExam
    else if (
      existing &&
      incomingExam &&
      JSON.stringify(existing) !== JSON.stringify(incomingExam)
    ) {
      target[examType] = null
      examConflictKeys.add(conflictKey)
      warnings.push(`${context}: ambiguous ${examType} omitted`)
    }
  }
  target.studyPrograms = [...new Set([...target.studyPrograms, ...incoming.studyPrograms])].sort()
  const sections = new Map(target.sections.map((section) => [section.sectionNo, section]))
  for (const section of incoming.sections) {
    const existing = sections.get(section.sectionNo)
    if (existing) mergeSection(existing, section)
    else sections.set(section.sectionNo, section)
  }
  target.sections = [...sections.values()]
}

function normalizeReview(
  raw: RawReview,
  fallbackCourseCode: string,
  fallbackYear: number,
  fallbackSemester: number,
  fallbackProgram: string,
): NormalizedReview | null {
  if (asText(raw.status).toUpperCase() !== "APPROVED") return null
  const reviewId = asText(raw._id)
  if (!reviewId) return null
  const rating = asInteger(raw.rating)
  if (rating < 1 || rating > 10) return null

  return {
    reviewId,
    courseCode: asText(raw.courseNo) || fallbackCourseCode,
    academicYear: asInteger(raw.academicYear, fallbackYear) || fallbackYear,
    semester: asInteger(raw.semester, fallbackSemester) || fallbackSemester,
    studyProgram: nullableText(raw.studyProgram) ?? nullableText(fallbackProgram),
    rating,
    content: asText(raw.content),
    likeCount: asInteger(raw.likeCount),
    dislikeCount: asInteger(raw.dislikeCount),
    status: "APPROVED",
  }
}

export function normalizeCatalog(input: unknown): NormalizedCatalog {
  if (!input || typeof input !== "object" || !Array.isArray((input as RawCatalog).datasets)) {
    throw new Error("Catalog root must contain a datasets array")
  }

  const offerings = new Map<string, NormalizedOffering>()
  const reviews = new Map<string, NormalizedReview>()
  const conflicts: string[] = []
  const warnings: string[] = []
  const examConflictKeys = new Set<string>()

  for (const dataset of (input as RawCatalog).datasets) {
    const academicYear = requirePositiveInteger(dataset.academicYear, "academicYear")
    const semester = requirePositiveInteger(dataset.semester, "semester")
    const studyProgram = asText(dataset.studyProgram) || "UNKNOWN"

    for (const raw of asArray<RawCourse>(dataset.courses)) {
      const offering = normalizeOffering(dataset, raw, academicYear, semester)
      const key = offeringKey(offering.academicYear, offering.semester, offering.courseCode)
      const existing = offerings.get(key)
      if (existing) mergeOffering(existing, offering, conflicts, warnings, examConflictKeys)
      else offerings.set(key, offering)

      for (const rawReview of asArray<RawReview>(raw.reviews)) {
        const review = normalizeReview(
          rawReview,
          offering.courseCode,
          offering.academicYear,
          offering.semester,
          studyProgram,
        )
        if (!review) continue
        const prior = reviews.get(review.reviewId)
        if (prior && JSON.stringify(prior) !== JSON.stringify(review)) {
          conflicts.push(`review ${review.reviewId}: conflicting duplicate`)
        } else {
          reviews.set(review.reviewId, review)
        }
      }
    }
  }

  for (const offering of offerings.values()) {
    offering.sections.sort((a, b) =>
      a.sectionNo.localeCompare(b.sectionNo, undefined, { numeric: true }),
    )
    for (const section of offering.sections) {
      section.meetings.sort((a, b) => meetingFingerprint(a).localeCompare(meetingFingerprint(b)))
    }
  }

  return {
    offerings: [...offerings.values()].sort((a, b) =>
      offeringKey(a.academicYear, a.semester, a.courseCode).localeCompare(
        offeringKey(b.academicYear, b.semester, b.courseCode),
      ),
    ),
    reviews: [...reviews.values()].sort((a, b) => a.reviewId.localeCompare(b.reviewId)),
    conflicts,
    warnings,
  }
}
