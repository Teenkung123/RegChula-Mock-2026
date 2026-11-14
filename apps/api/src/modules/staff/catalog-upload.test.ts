import { describe, expect, it } from "bun:test"
import { catalogUploadSummary } from "./catalog-upload"

function input(course: Record<string, unknown> = {}) {
  return new TextEncoder().encode(JSON.stringify({ datasets: [{
    academicYear: 2569, semester: 2, studyProgram: "S", courses: [{
      courseNo: "1234567", courseNameTh: "ระบบ", courseNameEn: "Systems", faculty: "ENG",
      department: "COMP", credit: 3, sections: [{ sectionNo: "1", capacity: { current: 1, max: 20 } }], ...course,
    }],
  }] }))
}

describe("catalog preview column validation", () => {
  it("accepts valid values and counts Unicode characters for varchar fields", () => {
    const result = catalogUploadSummary(input({ courseNameEn: "😀".repeat(500), credit: 3.5 }))
    expect(result.summary.courseCount).toBe(1)
    expect(() => catalogUploadSummary(input({ courseNameEn: "😀".repeat(501) }))).toThrow("500 characters")
  })

  it("rejects text exceeding the database byte limit even when character count is smaller", () => {
    expect(() => catalogUploadSummary(input({ courseDescTh: "ก".repeat(21_846) }))).toThrow("65535 UTF-8 bytes")
  })

  it("rejects values that overflow a column or would be silently rounded", () => {
    expect(() => catalogUploadSummary(input({ courseNo: "1".repeat(25) }))).toThrow("24 characters")
    expect(() => catalogUploadSummary(input({ credit: 3.55 }))).toThrow("one decimal place")
    expect(() => catalogUploadSummary(input({ credit: 1000 }))).toThrow("999.9")
    expect(() => catalogUploadSummary(input({ sections: [{ sectionNo: "1", capacity: 4_294_967_296 }] }))).toThrow("capacity is out of range")
    expect(catalogUploadSummary(input({ sections: [{ sectionNo: "1", capacity: { current: 21, max: 20 } }] })).summary.overCapacitySections).toBe(1)
  })

  it("rejects oversized meeting and review fields", () => {
    expect(() => catalogUploadSummary(input({ sections: [{ sectionNo: "1", capacity: 20, classes: [
      { type: "A".repeat(81), building: "MAIN" },
    ] }] }))).toThrow("class type exceeds 80 characters")
    expect(() => catalogUploadSummary(input({ reviews: [{ _id: "R".repeat(81), rating: 8, status: "APPROVED" }] }))).toThrow("Review ID exceeds 80 characters")
  })

  it("reports historical review terms and rejects reviews for unrelated courses", () => {
    const review = { _id: "r1", rating: 8, status: "APPROVED", academicYear: 2568, semester: 1 }
    const result = catalogUploadSummary(input({ reviews: [review] }))
    expect(result.summary.reviewTerms).toEqual([{ academicYear: 2568, semester: 1, count: 1 }])
    expect(() => catalogUploadSummary(input({ reviews: [{ ...review, courseNo: "9999999" }] }))).toThrow("Every review must belong")
  })
})
