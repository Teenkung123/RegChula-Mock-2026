import { describe, expect, it, spyOn } from "bun:test"
import PDFDocument from "pdfkit"
import { renderWithdrawalPdf } from "./pdf"

const courses = Array.from({ length: 4 }, (_, index) => ({
  courseCode: "2301" + (101 + index),
  nameTh: "วิชาทดสอบภาษาไทย",
  nameEn: "THAI DOCUMENT TEST",
  credits: 3,
  instructors: ["อาจารย์ผู้สอน " + (index + 1)],
  reason: "ต้องปรับแผนการเรียนเพื่อให้เหมาะสมกับภาระงานในภาคการศึกษานี้",
}))
const snapshot = {
  studentId: "6730000021",
  term: { academicYear: 2569, semester: 1 },
  totalCredits: 21,
  remainingCredits: 9,
  courses,
}
const pageCount = (pdf: Buffer) => [...pdf.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)].length

describe("withdrawal PDF", () => {
  it("renders four bilingual courses and reasons on exactly one portrait A4 page", async () => {
    const writes = spyOn(PDFDocument.prototype, "text")
    const strokes = spyOn(PDFDocument.prototype, "moveTo")
    const pdf = await renderWithdrawalPdf("four-courses", snapshot)
    const contents = writes.mock.calls.map((call) => String(call[0]))
    const signatureStarts = strokes.mock.calls.map((call) => [Number(call[0]), Number(call[1])])
    writes.mockRestore()
    strokes.mockRestore()
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF")
    expect(pdf.byteLength).toBeGreaterThan(6_000)
    expect(pageCount(pdf)).toBe(1)
    expect(pdf.toString("latin1")).toMatch(/\/MediaBox\s*\[0 0 595\.28 841\.89\]/)
    expect(contents).toContain("เรียน อธิการบดี / To The President")
    expect(contents).toContain("สำนักงานการทะเบียน / Office of the Registrar")
    expect(contents).toContain("ความเห็นคณบดี / Dean's comment")
    expect(contents).toContain("อธิการบดี / The President")
    expect(contents).toContain("อาจารย์: อาจารย์ผู้สอน 1")
    expect(contents.some((content) => content.includes("Final exam"))).toBe(false)
    expect(contents.some((content) => content.includes("สอบปลายภาค"))).toBe(false)
    expect(signatureStarts).toContainEqual([418, 400])
    expect(signatureStarts).toContainEqual([418, 464])
    expect(signatureStarts).toContainEqual([418, 528])
    expect(signatureStarts).toContainEqual([418, 592])
    expect(signatureStarts).toContainEqual([284, 671])
    expect(signatureStarts).toContainEqual([37, 722])
    expect(signatureStarts).toContainEqual([302, 722])
    expect(signatureStarts).toContainEqual([37, 768])
    expect(signatureStarts).toContainEqual([302, 768])
    expect(signatureStarts).toContainEqual([37, 814])
  })

  it("keeps four row slots with one course and leaves unknown identity fields blank", async () => {
    const writes = spyOn(PDFDocument.prototype, "text")
    try {
      const pdf = await renderWithdrawalPdf("one-course", { courses: courses.slice(0, 1) })
      const contents = writes.mock.calls.map((call) => call[0])
      expect(pageCount(pdf)).toBe(1)
      expect(contents.filter((content) => String(content).startsWith("อาจารย์:"))).toHaveLength(4)
      expect(contents).not.toContain("undefined")
      expect(contents).not.toContain("null")
    } finally {
      writes.mockRestore()
    }
  })

  it("paginates extra courses in groups of four with repeated form context", async () => {
    const writes = spyOn(PDFDocument.prototype, "text")
    try {
      const pdf = await renderWithdrawalPdf("nine-courses", {
        ...snapshot,
        courses: Array.from({ length: 9 }, (_, index) => ({
          ...courses[index % 4],
          courseCode: String(2301100 + index),
        })),
      })
      expect(pageCount(pdf)).toBe(3)
      const contents = writes.mock.calls.map((call) => call[0])
      expect(contents.filter((content) => content === "คำร้องขอถอนรายวิชา (W)")).toHaveLength(3)
      expect(contents).toContain("9")
    } finally {
      writes.mockRestore()
    }
  })

  it("preserves every character of a long unbroken Thai reason across continuation pages", async () => {
    const reason = "จำเป็นต้องปรับแผนการเรียนเนื่องจากมีภาระหน้าที่เพิ่มเติม".repeat(80) + "จบข้อความ"
    const writes = spyOn(PDFDocument.prototype, "text")
    try {
      const pdf = await renderWithdrawalPdf("long-reason", {
        ...snapshot,
        courses: [{ ...courses[0], reason }],
      })
      expect(pageCount(pdf)).toBeGreaterThan(2)
      const continuationText = writes.mock.calls
        .filter((call) => call[1] === 32 && call[2] === 108)
        .map((call) => call[0])
      expect(continuationText.length).toBeGreaterThan(1)
      expect(continuationText.join("")).toBe(reason)
      expect(writes.mock.calls.some((call) => String(call[0]).includes("See continuation"))).toBe(
        true,
      )
    } finally {
      writes.mockRestore()
    }
  })

  it("preserves long course names and instructor names in labeled continuations", async () => {
    const name = "ชื่อรายวิชาที่มีรายละเอียดเพิ่มเติม".repeat(30)
    const instructor = "อาจารย์ผู้สอนและผู้ร่วมสอน".repeat(30)
    const writes = spyOn(PDFDocument.prototype, "text")
    try {
      const pdf = await renderWithdrawalPdf("long-fields", {
        courses: [{ courseCode: "2301101", nameTh: name, instructors: [instructor], credits: 0 }],
        totalCredits: 0,
        remainingCredits: 0,
      })
      expect(pageCount(pdf)).toBe(3)
      const contents = writes.mock.calls.map((call) => call[0])
      expect(contents.some((content) => String(content).startsWith(name))).toBe(true)
      expect(contents).toContain("อาจารย์: " + instructor)
      expect(contents.some((content) => String(content).includes("0 หน่วยกิต / credits"))).toBe(true)
    } finally {
      writes.mockRestore()
    }
  })

  it("still accepts a legacy single-course snapshot", async () => {
    const pdf = await renderWithdrawalPdf("legacy-request", {
      studentId: "6730000021",
      course: courses[0],
      section: { sectionNo: "1" },
    })
    expect(pageCount(pdf)).toBe(1)
  })

  it("uses late-withdrawal wording only when explicitly supplied", async () => {
    const writes = spyOn(PDFDocument.prototype, "text")
    try {
      await renderWithdrawalPdf("late-request", {
        isLateWithdrawal: true,
        courses: courses.slice(0, 1),
      })
      const contents = writes.mock.calls.map((call) => call[0])
      expect(contents).toContain("คำร้องขอถอนรายวิชา (W) หลังกำหนด")
      expect(contents).toContain("Request Form for Late Course Withdrawal")
    } finally {
      writes.mockRestore()
    }
  })

  it("marks only explicitly supplied academic, level, and status options", async () => {
    const writes = spyOn(PDFDocument.prototype, "text")
    try {
      await renderWithdrawalPdf("known-options", {
        academicSystem: "semester",
        studentLevel: "undergraduate",
        studentStatus: "normal",
        courses: courses.slice(0, 1),
      })
      expect(writes.mock.calls.filter((call) => call[0] === "X")).toHaveLength(3)
    } finally {
      writes.mockRestore()
    }
  })
})
