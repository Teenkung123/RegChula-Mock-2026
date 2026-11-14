import { describe, expect, it } from "bun:test"
import {
  blockingRegistrationIssues,
  examSlotsOverlap,
  meetingsOverlap,
  runRegistrationBatch,
  runRegistrationPipeline,
  type ExistingRegistration,
  type MeetingSlot,
  type RegistrationContext,
} from "./pipeline"

const slot = (
  dayCode: string | null,
  startMinute: number | null,
  endMinute: number | null,
  arranged = false,
): MeetingSlot => ({ dayCode, startMinute, endMinute, arranged })

const context = (
  overrides: Partial<Omit<RegistrationContext, "issues">> = {},
): Omit<RegistrationContext, "issues"> => ({
  studentId: "test",
  termId: 1,
  currentTermId: 1,
  courseCode: "1234567",
  credits: 3,
  prerequisiteText: null,
  sectionId: 10,
  sectionActive: true,
  sectionClosed: false,
  remainingSeats: 5,
  targetMeetings: [slot("MO", 540, 600)],
  targetExams: { midterm: null, final: null },
  existing: [],
  completedCourseCodes: new Set(),
  ...overrides,
})

const activeRegistration = (
  overrides: Partial<ExistingRegistration> = {},
): ExistingRegistration => ({
  registrationId: 1,
  courseCode: "7654321",
  status: "active",
  credits: 3,
  meetings: [slot("TU", 540, 600)],
  exams: { midterm: null, final: null },
  ...overrides,
})

describe("registration pipeline", () => {
  it("allows re-registration after an administrative removal", () => {
    const result = runRegistrationPipeline(context({
      courseCode: "7654321",
      existing: [activeRegistration({ status: "removed" })],
    }))
    expect(result.issues.some((issue) => issue.code === "DUPLICATE_COURSE")).toBe(false)
  })

  it("accepts 22 credits and rejects 23 credits", () => {
    const existing = Array.from({ length: 19 }, (_, index) =>
      activeRegistration({
        registrationId: index + 1,
        courseCode: String(7_000_000 + index),
        credits: 1,
        meetings: [],
      }),
    )
    expect(runRegistrationPipeline(context({ existing })).issues).toEqual([])
    const rejected = runRegistrationPipeline(context({ existing, credits: 4 }))
    expect(rejected.issues).toEqual([
      {
        code: "CREDIT_LIMIT_EXCEEDED",
        message: "หน่วยกิตรวมเกิน 22 หน่วยกิต",
        details: { activeCredits: 19, requestedCredits: 4, totalCredits: 23, limit: 22 },
      },
    ])
  })

  it("reports every applicable business issue in one preview", () => {
    const existing = [
      activeRegistration({
        courseCode: "1234567",
        credits: 20,
        meetings: [slot("MO", 570, 630)],
      }),
    ]
    const result = runRegistrationPipeline(
      context({
        termId: 2,
        sectionClosed: true,
        remainingSeats: 0,
        prerequisiteText: "PRER 1111111",
        existing,
      }),
    )
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "HISTORICAL_TERM",
      "SECTION_CLOSED",
      "DUPLICATE_COURSE",
      "CREDIT_LIMIT_EXCEEDED",
      "SCHEDULE_CONFLICT",
      "PREREQUISITE_MISSING",
      "SECTION_FULL",
    ])
  })

  it("allows a dropped duplicate but blocks a withdrawn duplicate", () => {
    const dropped = runRegistrationPipeline(
      context({ existing: [activeRegistration({ courseCode: "1234567", status: "dropped" })] }),
    )
    const withdrawn = runRegistrationPipeline(
      context({
        existing: [activeRegistration({ courseCode: "1234567", status: "withdrawn" })],
      }),
    )
    expect(dropped.issues).toEqual([])
    expect(withdrawn.issues[0]?.code).toBe("DUPLICATE_COURSE")
  })

  it("treats adjacent and arranged meetings as non-conflicting", () => {
    expect(meetingsOverlap(slot("MO", 540, 600), slot("MO", 600, 660))).toBe(false)
    expect(meetingsOverlap(slot(null, null, null, true), slot("MO", 600, 660))).toBe(false)
    expect(meetingsOverlap(slot("MO", null, null), slot("MO", 600, 660))).toBe(false)
    expect(meetingsOverlap(slot("MO", 600, 600), slot("MO", 570, 630))).toBe(false)
    expect(meetingsOverlap(slot("MO", 540, 601), slot("MO", 600, 660))).toBe(true)
  })

  it("reports class conflicts as advisory pipeline feedback", () => {
    const result = runRegistrationPipeline(
      context({
        existing: [activeRegistration({ meetings: [slot("MO", 570, 630)] })],
      }),
    )
    expect(result.issues.map((issue) => issue.code)).toEqual(["SCHEDULE_CONFLICT"])
  })

  it("detects same-date exam overlap but not adjacency or different dates", () => {
    const first = { date: "2026-09-20", startMinute: 540, endMinute: 600 }
    expect(examSlotsOverlap(first, { ...first, startMinute: 570, endMinute: 630 })).toBe(true)
    expect(examSlotsOverlap(first, { ...first, startMinute: 600, endMinute: 660 })).toBe(false)
    expect(examSlotsOverlap(first, { date: "2026-09-21", startMinute: 570, endMinute: 630 })).toBe(
      false,
    )
  })

  it("reports exam conflicts and ignores unknown exam slots", () => {
    const result = runRegistrationPipeline(
      context({
        targetExams: {
          midterm: { date: "2026-09-20", startMinute: 540, endMinute: 600 },
          final: null,
        },
        existing: [
          activeRegistration({
            exams: {
              midterm: { date: "2026-09-20", startMinute: 570, endMinute: 630 },
              final: null,
            },
          }),
        ],
      }),
    )
    expect(result.issues.map((issue) => issue.code)).toEqual(["EXAM_CONFLICT"])
    expect(runRegistrationPipeline(context()).issues).toEqual([])
  })

  it("never blocks academic conflicts and keeps hard failures blocking", () => {
    const issues = runRegistrationPipeline(
      context({
        remainingSeats: 0,
        prerequisiteText: "PRER 1111111",
        targetExams: {
          midterm: { date: "2026-09-20", startMinute: 540, endMinute: 600 },
          final: null,
        },
        existing: [
          activeRegistration({
            meetings: [slot("MO", 570, 630)],
            exams: {
              midterm: { date: "2026-09-20", startMinute: 570, endMinute: 630 },
              final: null,
            },
          }),
        ],
      }),
    ).issues
    expect(blockingRegistrationIssues(issues, false).map((issue) => issue.code)).toEqual([
      "SECTION_FULL",
    ])
    expect(blockingRegistrationIssues(issues, true).map((issue) => issue.code)).toEqual([
      "SECTION_FULL",
    ])
  })

  it("passes parsed prerequisites when every course is completed", () => {
    const result = runRegistrationPipeline(
      context({
        prerequisiteText: "PRER 1111111 AND 2222222",
        completedCourseCodes: new Set(["1111111", "2222222"]),
      }),
    )
    expect(result.issues).toEqual([])
  })

  it("requires manual approval for C.F. and unparseable text", () => {
    const faculty = runRegistrationPipeline(context({ prerequisiteText: "C.F." }))
    const manual = runRegistrationPipeline(context({ prerequisiteText: "ตามประกาศคณะ" }))
    expect(faculty.issues[0]?.code).toBe("FACULTY_APPROVAL_REQUIRED")
    expect(manual.issues[0]?.code).toBe("FACULTY_APPROVAL_REQUIRED")
  })

  it("evaluates a multi-course draft against choices accepted earlier in the batch", () => {
    const candidate = (overrides: Partial<ReturnType<typeof context>> = {}) => {
      const {
        studentId: _studentId,
        currentTermId: _currentTermId,
        existing: _existing,
        completedCourseCodes: _completed,
        ...value
      } = context(overrides)
      return value
    }
    const result = runRegistrationBatch({
      studentId: "test",
      currentTermId: 1,
      existing: [activeRegistration({ credits: 16, meetings: [] })],
      completedCourseCodes: new Set(),
      allowAdvisoryOverride: true,
      choices: [
        { requestIndex: 0, candidates: [candidate({ courseCode: "1111111", sectionId: 11 })] },
        { requestIndex: 1, candidates: [candidate({ courseCode: "2222222", sectionId: 12 })] },
        { requestIndex: 2, candidates: [candidate({ courseCode: "3333333", sectionId: 13 })] },
      ],
    })
    expect(result.map((item) => item.chosen?.sectionId ?? null)).toEqual([11, 12, null])
    expect(result[2]?.decision?.issues.map((issue) => issue.code)).toContain(
      "CREDIT_LIMIT_EXCEEDED",
    )
  })

  it("uses an alternate section when the primary section is full", () => {
    const base = context()
    const candidate = (sectionId: number, remainingSeats: number) => {
      const {
        studentId: _studentId,
        currentTermId: _currentTermId,
        existing: _existing,
        completedCourseCodes: _completed,
        ...value
      } = base
      return { ...value, sectionId, remainingSeats }
    }
    const [result] = runRegistrationBatch({
      studentId: "test",
      currentTermId: 1,
      existing: [],
      completedCourseCodes: new Set(),
      allowAdvisoryOverride: true,
      choices: [{ requestIndex: 0, candidates: [candidate(10, 0), candidate(11, 5)] }],
    })
    expect(result?.chosen?.sectionId).toBe(11)
    expect(result?.decision?.issues).toEqual([])
  })
})

describe("academic advisory policy", () => {
  const batch = (
    candidates: Array<ReturnType<typeof context>>,
    existing: ExistingRegistration[] = [],
  ) =>
    runRegistrationBatch({
      studentId: "test",
      currentTermId: 1,
      existing,
      completedCourseCodes: new Set(),
      allowAdvisoryOverride: false,
      choices: candidates.map((candidate, requestIndex) => ({
        requestIndex,
        candidates: [candidate],
      })),
    })

  it("keeps every academic requirement advisory without override", () => {
    for (const prerequisiteText of [
      "PRER 1111111",
      "COREQ 1111111",
      "CORE 1111111",
      "C.F.",
      "DEPEND 1111111",
    ]) {
      const input = context({ prerequisiteText })
      const issues = runRegistrationPipeline(input).issues
      expect(issues.length).toBe(1)
      expect(blockingRegistrationIssues(issues, false)).toEqual([])
      expect(batch([input])[0]?.chosen).not.toBeNull()
    }
  })

  it("preserves complex raw requirements even when all referenced codes are completed", () => {
    for (const prerequisiteText of [
      " PRER 1111111 OR 2222222 ",
      "PRER 1111111 CONCUR 2222222",
      "COREQ 1111111 OR C.F.",
      "PRER 1111111, 2222222",
      "PRER 1111111 grade B",
    ]) {
      const issues = runRegistrationPipeline(
        context({ prerequisiteText, completedCourseCodes: new Set(["1111111", "2222222"]) }),
      ).issues
      expect(issues).toMatchObject([
        { code: "FACULTY_APPROVAL_REQUIRED", details: { prerequisiteText } },
      ])
    }
  })

  it("recognizes simple corequisites using completed or active courses only", () => {
    for (const prefix of ["COREQ", "CORE"]) {
      const input = context({ prerequisiteText: `${prefix} 7654321` })
      expect(runRegistrationPipeline(input).issues).toMatchObject([
        {
          code: "COREQUISITE_MISSING",
          details: {
            prerequisiteText: input.prerequisiteText,
            requiredCourseCodes: ["7654321"],
            missingCourseCodes: ["7654321"],
          },
        },
      ])
      expect(
        runRegistrationPipeline({ ...input, completedCourseCodes: new Set(["7654321"]) }).issues,
      ).toEqual([])
      expect(
        runRegistrationPipeline({ ...input, existing: [activeRegistration()] }).issues,
      ).toEqual([])
      for (const status of ["dropped", "withdrawn"] as const) {
        expect(
          runRegistrationPipeline({ ...input, existing: [activeRegistration({ status })] })
            .issues[0]?.code,
        ).toBe("COREQUISITE_MISSING")
      }
    }
  })

  it("reevaluates symmetric class, exam and mutual corequisites in either batch order", () => {
    const exam = { date: "2026-09-20", startMinute: 540, endMinute: 600 }
    const first = context({
      courseCode: "1111111",
      prerequisiteText: "COREQ 2222222",
      targetExams: { midterm: exam, final: null },
    })
    const second = context({
      sectionId: 20,
      courseCode: "2222222",
      prerequisiteText: "COREQ 1111111",
      targetExams: { midterm: null, final: exam },
    })
    for (const inputs of [
      [first, second],
      [second, first],
    ]) {
      const result = batch(inputs)
      for (const [index, item] of result.entries()) {
        expect(item.requestIndex).toBe(index)
        expect(item.chosen).not.toBeNull()
        expect(item.decision?.issues.map((issue) => issue.code)).toEqual([
          "SCHEDULE_CONFLICT",
          "EXAM_CONFLICT",
        ])
        expect(item.decision?.issues[0]?.details?.conflicts).toMatchObject([
          { courseCode: inputs[1 - index]?.courseCode },
        ])
      }
    }
    expect(batch([first])[0]?.decision?.issues.map((issue) => issue.code)).toEqual([
      "COREQUISITE_MISSING",
    ])
    expect(
      batch([first, { ...second, remainingSeats: 0 }])[0]?.decision?.issues.map(
        (issue) => issue.code,
      ),
    ).toEqual(["COREQUISITE_MISSING"])
  })

  it("returns every overlapping pair with slots and exam kinds", () => {
    const target = slot("MO", 540, 600)
    const existingSlot = slot("MO", 570, 630)
    const exam = { date: "2026-09-20", startMinute: 540, endMinute: 600 }
    const existing = ["1111111", "2222222"].map((courseCode) =>
      activeRegistration({
        courseCode,
        meetings: [existingSlot, existingSlot],
        exams: { midterm: exam, final: exam },
      }),
    )
    const issues = runRegistrationPipeline(
      context({ targetMeetings: [target], targetExams: { midterm: exam, final: exam }, existing }),
    ).issues
    expect(issues[0]?.details).toEqual({
      conflictingCourseCode: "1111111",
      conflicts: existing.flatMap(({ courseCode }) =>
        [0, 1].map(() => ({ courseCode, target, existing: existingSlot })),
      ),
    })
    expect(issues[1]?.details).toEqual({
      conflictingCourseCode: "1111111",
      conflicts: existing.flatMap(({ courseCode }) =>
        (["midterm", "final"] as const).flatMap((targetKind) =>
          (["midterm", "final"] as const).map((existingKind) => ({
            courseCode,
            target: exam,
            existing: exam,
            targetKind,
            existingKind,
          })),
        ),
      ),
    })
  })

  it("never overrides hard constraints in single or batch evaluation", () => {
    const input = context({
      termId: 2,
      sectionClosed: true,
      remainingSeats: 0,
      prerequisiteText: "COREQ 1111111",
    })
    const existing = [activeRegistration({ courseCode: input.courseCode, credits: 21 })]
    const issues = runRegistrationPipeline({ ...input, existing }).issues
    for (const override of [false, true]) {
      expect(blockingRegistrationIssues(issues, override).map((issue) => issue.code)).toEqual([
        "HISTORICAL_TERM",
        "SECTION_CLOSED",
        "DUPLICATE_COURSE",
        "CREDIT_LIMIT_EXCEEDED",
        "SECTION_FULL",
      ])
    }
    expect(batch([input], existing)[0]?.chosen).toBeNull()
  })
})
