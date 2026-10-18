export type RegistrationIssueCode =
  | "HISTORICAL_TERM"
  | "SECTION_CLOSED"
  | "SECTION_FULL"
  | "DUPLICATE_COURSE"
  | "CREDIT_LIMIT_EXCEEDED"
  | "SCHEDULE_CONFLICT"
  | "EXAM_CONFLICT"
  | "PREREQUISITE_MISSING"
  | "COREQUISITE_MISSING"
  | "FACULTY_APPROVAL_REQUIRED"

export interface RuleIssue {
  code: RegistrationIssueCode
  message: string
  details?: Record<string, unknown>
}

export interface MeetingSlot {
  dayCode: string | null
  startMinute: number | null
  endMinute: number | null
  arranged: boolean
}

const alwaysAdvisoryIssueCodes = new Set<RegistrationIssueCode>([
  "PREREQUISITE_MISSING",
  "COREQUISITE_MISSING",
  "FACULTY_APPROVAL_REQUIRED",

  "SCHEDULE_CONFLICT",
  "EXAM_CONFLICT",
])

export function blockingRegistrationIssues(
  issues: RuleIssue[],
  _allowAdvisoryOverride: boolean,
): RuleIssue[] {
  return issues.filter((issue) => !alwaysAdvisoryIssueCodes.has(issue.code))
}

export interface ExamSlot {
  date: string
  startMinute: number
  endMinute: number
}

export interface CourseExams {
  midterm: ExamSlot | null
  final: ExamSlot | null
}

export interface ExistingRegistration {
  registrationId: number
  courseCode: string
  status: "active" | "dropped" | "withdrawn"
  credits: number
  meetings: MeetingSlot[]
  exams: CourseExams
}

export interface RegistrationContext {
  studentId: string
  termId: number
  currentTermId: number
  courseCode: string
  credits: number
  prerequisiteText: string | null
  sectionId: number
  sectionActive: boolean
  sectionClosed: boolean
  remainingSeats: number
  targetMeetings: MeetingSlot[]
  targetExams: CourseExams
  existing: ExistingRegistration[]
  completedCourseCodes: Set<string>
  issues: RuleIssue[]
}

export type RegistrationFilter = (context: RegistrationContext) => RegistrationContext

const withIssue = (context: RegistrationContext, issue: RuleIssue): RegistrationContext => ({
  ...context,
  issues: context.issues.some((existing) => existing.code === issue.code)
    ? context.issues
    : [...context.issues, issue],
})

export const currentTermFilter: RegistrationFilter = (context) =>
  context.termId === context.currentTermId
    ? context
    : withIssue(context, {
        code: "HISTORICAL_TERM",
        message: "ภาคการศึกษานี้เปิดให้ดูข้อมูลเท่านั้น",
      })

export const sectionOpenFilter: RegistrationFilter = (context) =>
  context.sectionActive && !context.sectionClosed
    ? context
    : withIssue(context, {
        code: "SECTION_CLOSED",
        message: "ตอนเรียนนี้ปิดรับลงทะเบียน",
      })

export const duplicateCourseFilter: RegistrationFilter = (context) => {
  const duplicate = context.existing.find(
    (registration) =>
      registration.courseCode === context.courseCode &&
      (registration.status === "active" || registration.status === "withdrawn"),
  )
  return duplicate
    ? withIssue(context, {
        code: "DUPLICATE_COURSE",
        message: "มีรายวิชานี้ในรายการลงทะเบียนแล้ว",
        details: { registrationId: duplicate.registrationId, status: duplicate.status },
      })
    : context
}

export const creditLimitFilter: RegistrationFilter = (context) => {
  const activeCredits = context.existing
    .filter((registration) => registration.status === "active")
    .reduce((total, registration) => total + registration.credits, 0)
  const totalCredits = activeCredits + context.credits
  return totalCredits > 21
    ? withIssue(context, {
        code: "CREDIT_LIMIT_EXCEEDED",
        message: "หน่วยกิตรวมเกิน 21 หน่วยกิต",
        details: { activeCredits, requestedCredits: context.credits, totalCredits, limit: 21 },
      })
    : context
}

export function meetingsOverlap(first: MeetingSlot, second: MeetingSlot): boolean {
  if (
    first.arranged ||
    second.arranged ||
    first.dayCode === null ||
    second.dayCode === null ||
    first.dayCode !== second.dayCode ||
    first.startMinute === null ||
    first.endMinute === null ||
    second.startMinute === null ||
    second.endMinute === null ||
    first.startMinute >= first.endMinute ||
    second.startMinute >= second.endMinute
  ) {
    return false
  }
  return first.startMinute < second.endMinute && second.startMinute < first.endMinute
}

export function examSlotsOverlap(first: ExamSlot, second: ExamSlot): boolean {
  return (
    first.date === second.date &&
    first.startMinute < first.endMinute &&
    second.startMinute < second.endMinute &&
    first.startMinute < second.endMinute &&
    second.startMinute < first.endMinute
  )
}

export const scheduleConflictFilter: RegistrationFilter = (context) => {
  const conflicts = context.existing
    .filter((registration) => registration.status === "active")
    .flatMap((registration) =>
      context.targetMeetings.flatMap((target) =>
        registration.meetings
          .filter((existing) => meetingsOverlap(target, existing))
          .map((existing) => ({ courseCode: registration.courseCode, target, existing })),
      ),
    )
  const first = conflicts[0]
  return first
    ? withIssue(context, {
        code: "SCHEDULE_CONFLICT",
        message: `เวลาเรียนซ้อนกับรายวิชา ${first.courseCode}`,
        details: { conflictingCourseCode: first.courseCode, conflicts },
      })
    : context
}

const examKinds = ["midterm", "final"] as const

export const examConflictFilter: RegistrationFilter = (context) => {
  const conflicts = context.existing
    .filter((registration) => registration.status === "active")
    .flatMap((registration) =>
      examKinds.flatMap((targetKind) => {
        const target = context.targetExams[targetKind]
        if (!target) return []
        return examKinds.flatMap((existingKind) => {
          const existing = registration.exams[existingKind]
          return existing && examSlotsOverlap(target, existing)
            ? [{ courseCode: registration.courseCode, target, existing, targetKind, existingKind }]
            : []
        })
      }),
    )
  const first = conflicts[0]
  return first
    ? withIssue(context, {
        code: "EXAM_CONFLICT",
        message: `เวลาสอบซ้อนกับรายวิชา ${first.courseCode}`,
        details: { conflictingCourseCode: first.courseCode, conflicts },
      })
    : context
}

export const prerequisiteFilter: RegistrationFilter = (context) => {
  const text = context.prerequisiteText?.trim()
  if (!text) return context
  // Interpret only an entire simple clause; mixed conditions require manual review.
  const simple = /^(PRER|COREQ|CORE)\s+(\d{7}(?:\s+AND\s+\d{7})*)$/i.exec(text)
  if (!simple) {
    return withIssue(context, {
      code: "FACULTY_APPROVAL_REQUIRED",
      message: "เงื่อนไขรายวิชานี้ต้องตรวจสอบโดยเจ้าหน้าที่",
      details: { prerequisiteText: context.prerequisiteText },
    })
  }
  const codes = [...new Set(simple[2]?.match(/\d{7}/g) ?? [])]
  const corequisite = simple[1]?.toUpperCase() !== "PRER"
  const available = new Set(context.completedCourseCodes)
  if (corequisite) {
    for (const registration of context.existing) {
      if (registration.status === "active") available.add(registration.courseCode)
    }
  }
  const missing = codes.filter((code) => !available.has(code))
  return missing.length > 0
    ? withIssue(context, {
        code: corequisite ? "COREQUISITE_MISSING" : "PREREQUISITE_MISSING",
        message: corequisite ? "ยังไม่มีรายวิชาบังคับร่วม" : "ยังไม่ผ่านรายวิชาบังคับก่อน",
        details: {
          prerequisiteText: context.prerequisiteText,
          requiredCourseCodes: codes,
          missingCourseCodes: missing,
        },
      })
    : context
}

export const capacityFilter: RegistrationFilter = (context) =>
  context.remainingSeats > 0
    ? context
    : withIssue(context, {
        code: "SECTION_FULL",
        message: "ตอนเรียนนี้เต็มแล้ว",
        details: { remainingSeats: context.remainingSeats },
      })

export const registrationFilters: RegistrationFilter[] = [
  currentTermFilter,
  sectionOpenFilter,
  duplicateCourseFilter,
  creditLimitFilter,
  scheduleConflictFilter,
  examConflictFilter,
  prerequisiteFilter,
  capacityFilter,
]

export function runRegistrationPipeline(
  input: Omit<RegistrationContext, "issues">,
): RegistrationContext {
  return registrationFilters.reduce<RegistrationContext>((context, filter) => filter(context), {
    ...input,
    issues: [] as RuleIssue[],
  })
}

export type RegistrationCandidate = Omit<
  RegistrationContext,
  "studentId" | "currentTermId" | "existing" | "completedCourseCodes" | "issues"
>

export interface RegistrationCandidateChoice {
  requestIndex: number
  candidates: RegistrationCandidate[]
}

export interface RegistrationBatchItemDecision {
  requestIndex: number
  chosen: RegistrationCandidate | null
  decision: RegistrationContext | null
}

export function runRegistrationBatch({
  studentId,
  currentTermId,
  choices,
  existing,
  completedCourseCodes,
  allowAdvisoryOverride,
}: {
  studentId: string
  currentTermId: number
  choices: RegistrationCandidateChoice[]
  existing: ExistingRegistration[]
  completedCourseCodes: Set<string>
  allowAdvisoryOverride: boolean
}): RegistrationBatchItemDecision[] {
  const simulated = [...existing]
  const decisions = choices.map((choice) => {
    let lastDecision: RegistrationContext | null = null
    for (const candidate of choice.candidates) {
      const decision = runRegistrationPipeline({
        ...candidate,
        studentId,
        currentTermId,
        existing: simulated,
        completedCourseCodes,
      })
      lastDecision = decision
      if (blockingRegistrationIssues(decision.issues, allowAdvisoryOverride).length > 0) continue
      simulated.push({
        registrationId: -(choice.requestIndex + 1),
        courseCode: candidate.courseCode,
        status: "active",
        credits: candidate.credits,
        meetings: candidate.targetMeetings,
        exams: candidate.targetExams,
      })
      return { requestIndex: choice.requestIndex, chosen: candidate, decision }
    }
    return { requestIndex: choice.requestIndex, chosen: null, decision: lastDecision }
  })
  // Hard decisions remain sequential; academic feedback sees all successful peers.
  return decisions.map((item) => {
    if (!item.decision) return item
    const peers = simulated.filter(
      (registration) => registration.registrationId !== -(item.requestIndex + 1),
    )
    const academicContext = {
      ...item.decision,
      existing: peers,
      issues: blockingRegistrationIssues(item.decision.issues, allowAdvisoryOverride),
    }
    const decision = [scheduleConflictFilter, examConflictFilter, prerequisiteFilter].reduce(
      (context, filter) => filter(context),
      academicContext,
    )
    return { ...item, decision }
  })
}
