import { describe, expect, it } from "bun:test"
import { normalizeCatalog } from "./normalize"

const course = {
  academicYear: 2568,
  semester: 2,
  courseNo: "1234567",
  courseNameTh: "ทดสอบระบบ",
  courseNameEn: "SYSTEM TEST",
  faculty: "คณะตัวอย่าง",
  department: "ภาควิชาตัวอย่าง",
  credit: 3,
  courseCondition: "PRER 1111111",
  sections: [
    {
      sectionNo: "1",
      closed: false,
      capacity: 30,
      note: "สำหรับนิสิตหลักสูตร S",
      classes: [
        {
          type: "LECT",
          dayOfWeek: "MO",
          period: { start: "09:00", end: "12:00" },
          building: "TEST",
          room: "101",
          teachers: ["STAFF"],
        },
      ],
    },
  ],
  reviews: [
    {
      _id: "review-1",
      rating: 9,
      courseNo: "1234567",
      academicYear: 2568,
      semester: 2,
      studyProgram: "S",
      content: "ชัดเจน",
      likeCount: 2,
      dislikeCount: 0,
      status: "APPROVED",
    },
  ],
}

const baseSection = () => {
  const section = course.sections[0]
  if (!section) throw new Error("Fixture section is missing")
  return section
}

describe("normalizeCatalog", () => {
  it("merges study programs, meetings, notes, and open availability", () => {
    const input = {
      datasets: [
        {
          studyProgram: "S",
          academicYear: 2568,
          semester: 2,
          courses: [course],
        },
        {
          studyProgram: "I",
          academicYear: 2568,
          semester: 2,
          courses: [
            {
              ...course,
              sections: [
                {
                  ...baseSection(),
                  closed: true,
                  note: "สำหรับนิสิตหลักสูตร I",
                  classes: [
                    ...baseSection().classes,
                    {
                      type: "DISC",
                      dayOfWeek: "IA",
                      period: "IA",
                      building: "-",
                      room: "-",
                      teachers: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    const normalized = normalizeCatalog(input)
    const offering = normalized.offerings[0]
    const section = offering?.sections[0]

    expect(normalized.conflicts).toEqual([])
    expect(offering?.studyPrograms).toEqual(["I", "S"])
    expect(section?.closed).toBe(false)
    expect(section?.note).toContain("หลักสูตร I")
    expect(section?.meetings).toHaveLength(2)
    expect(section?.meetings.some((meeting) => meeting.arranged)).toBe(true)
    expect(normalized.reviews).toHaveLength(1)
  })

  it("merges study-program capacity quotas into one mock-student view", () => {
    const input = {
      datasets: [
        { studyProgram: "S", academicYear: 2568, semester: 2, courses: [course] },
        {
          studyProgram: "I",
          academicYear: 2568,
          semester: 2,
          courses: [
            {
              ...course,
              sections: [{ ...baseSection(), capacity: 20 }],
            },
          ],
        },
      ],
    }

    const normalized = normalizeCatalog(input)
    expect(normalized.conflicts).toEqual([])
    expect(normalized.offerings[0]?.sections[0]?.capacity).toBe(30)
    expect(normalized.offerings[0]?.sections[0]?.closed).toBe(false)
  })

  it("reads current and maximum capacity from the raw object shape", () => {
    const normalized = normalizeCatalog({
      datasets: [
        {
          studyProgram: "S",
          academicYear: 2568,
          semester: 2,
          courses: [
            {
              ...course,
              sections: [
                {
                  ...baseSection(),
                  capacity: { current: 13, max: 20 },
                },
              ],
            },
          ],
        },
      ],
    })
    const section = normalized.offerings[0]?.sections[0]
    expect(section?.baselineEnrolled).toBe(13)
    expect(section?.capacity).toBe(20)
  })

  it("preserves legitimate program-specific catalogue values without rejecting the term", () => {
    const normalized = normalizeCatalog({
      datasets: [
        {
          studyProgram: "S",
          academicYear: 2568,
          semester: 2,
          courses: [
            {
              ...course,
              creditHours: "LECT 3 HR",
              genEdType: "NO",
            },
          ],
        },
        {
          studyProgram: "I",
          academicYear: 2568,
          semester: 2,
          courses: [
            {
              ...course,
              creditHours: "LECT 2 HR + DISC 1 HR",
              genEdType: "SC",
            },
          ],
        },
      ],
    })

    expect(normalized.conflicts).toEqual([])
    expect(normalized.offerings[0]?.creditHours).toBe("LECT 2 HR + DISC 1 HR / LECT 3 HR")
    expect(normalized.offerings[0]?.genEdType).toBe("SC")
    expect(normalized.warnings).toContain("2568/2 1234567: merged program-specific creditHours")
    expect(normalized.warnings).toContain("2568/2 1234567: selected program-specific genEdType")
  })

  it("treats source dash markers as no prerequisite", () => {
    const normalized = normalizeCatalog({
      datasets: [
        {
          studyProgram: "S",
          academicYear: 2569,
          semester: 1,
          courses: [{ ...course, courseCondition: "-" }],
        },
      ],
    })
    expect(normalized.offerings[0]?.prerequisiteText).toBeNull()
  })

  it("normalizes Buddhist exam years while preserving Gregorian years", () => {
    const normalized = normalizeCatalog({
      datasets: [
        {
          studyProgram: "S",
          academicYear: 2569,
          semester: 1,
          courses: [
            {
              ...course,
              academicYear: 2569,
              semester: 1,
              midterm: {
                date: "2569-09-23T00:00:00.000Z",
                period: { start: "16:00", end: "19:00" },
              },
              final: {
                date: "2026-11-25",
                period: { start: "09:30", end: "12:30" },
              },
            },
          ],
        },
      ],
    })

    expect(normalized.offerings[0]?.midterm).toEqual({
      date: "2026-09-23",
      startMinute: 960,
      endMinute: 1140,
    })
    expect(normalized.offerings[0]?.final).toEqual({
      date: "2026-11-25",
      startMinute: 570,
      endMinute: 750,
    })
  })

  it("prefers a populated exam over an empty duplicate", () => {
    const emptyExam = { date: null, period: { start: null, end: null } }
    const populatedExam = {
      date: "2569-02-25T00:00:00.000Z",
      period: { start: "09:00", end: "12:00" },
    }
    const normalized = normalizeCatalog({
      datasets: [
        {
          studyProgram: "S",
          academicYear: 2568,
          semester: 2,
          courses: [{ ...course, midterm: emptyExam }],
        },
        {
          studyProgram: "I",
          academicYear: 2568,
          semester: 2,
          courses: [{ ...course, midterm: populatedExam }],
        },
      ],
    })

    expect(normalized.conflicts).toEqual([])
    expect(normalized.offerings[0]?.midterm).toEqual({
      date: "2026-02-25",
      startMinute: 540,
      endMinute: 720,
    })
  })

  it("reports conflicting populated duplicate exams", () => {
    const firstExam = {
      date: "2569-02-25T00:00:00.000Z",
      period: { start: "09:00", end: "12:00" },
    }
    const secondExam = {
      date: "2569-02-26T00:00:00.000Z",
      period: { start: "09:00", end: "12:00" },
    }
    const normalized = normalizeCatalog({
      datasets: [
        {
          studyProgram: "S",
          academicYear: 2568,
          semester: 2,
          courses: [{ ...course, final: firstExam }],
        },
        {
          studyProgram: "I",
          academicYear: 2568,
          semester: 2,
          courses: [{ ...course, final: secondExam }],
        },
      ],
    })

    expect(normalized.conflicts).toEqual([])
    expect(normalized.warnings).toEqual(["2568/2 1234567: ambiguous final omitted"])
    expect(normalized.offerings[0]?.final).toBeNull()
  })

  it("rejects invalid or incomplete exam dates and times", () => {
    const invalidExams = [
      {
        date: "2569-02-29T00:00:00.000Z",
        period: { start: "09:00", end: "12:00" },
      },
      {
        date: "2569-09-23T00:00:00.000Z",
        period: { start: "24:00", end: "26:00" },
      },
      {
        date: "2569-09-23T00:00:00.000Z",
        period: { start: "12:00", end: "09:00" },
      },
      {
        date: "2569-09-23T00:00:00.000Z",
        period: { start: "09:00", end: null },
      },
    ]

    for (const midterm of invalidExams) {
      expect(() =>
        normalizeCatalog({
          datasets: [
            {
              studyProgram: "S",
              academicYear: 2569,
              semester: 1,
              courses: [{ ...course, academicYear: 2569, semester: 1, midterm }],
            },
          ],
        }),
      ).toThrow(/midterm/)
    }
  })

  it("ignores non-approved and invalid reviews", () => {
    const input = {
      datasets: [
        {
          studyProgram: "S",
          academicYear: 2568,
          semester: 2,
          courses: [
            {
              ...course,
              reviews: [
                { ...course.reviews[0], _id: "rejected", status: "REJECTED" },
                { ...course.reviews[0], _id: "invalid", rating: 11 },
              ],
            },
          ],
        },
      ],
    }

    expect(normalizeCatalog(input).reviews).toEqual([])
  })
})
