import PDFDocument from "pdfkit"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const fontDirectory =
  [
    resolve(import.meta.dir, "../../../assets/fonts"),
    resolve(import.meta.dir, "../assets/fonts"),
  ].find((path) => existsSync(path)) ?? resolve(import.meta.dir, "../../../assets/fonts")
const regularFont = resolve(fontDirectory, "Sarabun-Regular.ttf")
const boldFont = resolve(fontDirectory, "Sarabun-Bold.ttf")

const value = (input: unknown, fallback = ""): string =>
  typeof input === "string" || typeof input === "number" ? String(input) || fallback : fallback
const record = (input: unknown): Record<string, unknown> =>
  input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {}

function coursesOf(snapshot: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(snapshot.courses) && snapshot.courses.length > 0) {
    return snapshot.courses.map(record)
  }
  return snapshot.course ? [{ ...record(snapshot.course), ...record(snapshot.section) }] : []
}

interface Continuation {
  label: string
  content: string
}

const left = 32
const width = 531
const tableTop = 331
const rowHeight = 64
const columns = [22, 56, 113, 42, 148, 150]
const blank = "................................"
/** A fresh printable จท48 layout; every text region is measured before painting. */
export async function renderWithdrawalPdf(
  withdrawalId: string,
  snapshot: Record<string, unknown>,
): Promise<Buffer> {
  const isLateWithdrawal = snapshot.isLateWithdrawal === true || snapshot.lateWithdrawal === true
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 28, right: 32, bottom: 8, left: 32 },
    bufferPages: true,
    info: {
      Title: "จท48 คำร้องขอถอนรายวิชา (W)" + (isLateWithdrawal ? " หลังกำหนด" : ""),
      Author: "RegChula Mock",
      Subject: "เอกสารตัวอย่างสำหรับการถอนรายวิชา",
    },
  })
  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolveBuffer, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk))
    document.on("end", () => resolveBuffer(Buffer.concat(chunks)))
    document.on("error", reject)
  })
  document.registerFont("regular", regularFont).registerFont("bold", boldFont)
  const continuations: Continuation[] = []

  function write(content: string, x: number, y: number, w: number, size = 9, bold = false) {
    document
      .font(bold ? "bold" : "regular")
      .fontSize(size)
      .fillColor("#111111")
      .text(content, x, y, { width: w, lineGap: 0 })
  }
  function line(x: number, y: number, w: number) {
    document
      .strokeColor("#777777")
      .lineWidth(0.45)
      .moveTo(x, y)
      .lineTo(x + w, y)
      .stroke()
  }
  function box(x: number, y: number, w: number, h: number) {
    document.strokeColor("#777777").lineWidth(0.45).rect(x, y, w, h).stroke()
  }
  function option(label: string, x: number, y: number, w: number, size = 8, checked = false) {
    box(x, y + 3, 7, 7)
    if (checked) write("X", x + 1.2, y + 0.5, 6, 7, true)
    write(label, x + 11, y, w - 11, size)
  }
  function height(content: string, w: number, size: number) {
    document.font("regular").fontSize(size)
    return document.heightOfString(content, { width: w, lineGap: 0 })
  }
  function fitted(
    content: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    size = 9,
  ) {
    if (!content) return
    // Avoid shaping arbitrarily large unbroken values repeatedly in a tiny cell.
    for (let candidate = size; content.length <= 512 && candidate >= 8; candidate -= 0.5) {
      if (height(content, w, candidate) <= h) {
        write(content, x, y, w, candidate)
        return
      }
    }
    continuations.push({ label, content })
    write("ดูภาคต่อ " + continuations.length + " / See continuation", x, y, w, 8)
  }
  function field(label: string, content: unknown, y: number, start = 142, end = left + width) {
    write(label, left, y, start - left - 5)
    line(start, y + 16, end - start)
    fitted(value(content), label, start + 3, y, end - start - 6, 16)
  }
  function header() {
    const academicSystem = value(snapshot.academicSystem).toLowerCase()
    const studentLevel = value(snapshot.studentLevel).toLowerCase()
    const studentStatus = value(snapshot.studentStatus).toLowerCase()
    write("สำนักงานการทะเบียน จุฬาลงกรณ์มหาวิทยาลัย", left, 30, 386, 12, true)
    write("Office of the Registrar, Chulalongkorn University", left, 50, 386, 9)
    write("จท48", left, 70, 386, 11, true)
    write("คำร้องขอถอนรายวิชา (W)" + (isLateWithdrawal ? " หลังกำหนด" : ""), left, 89, 386, 16, true)
    write(
      "Request Form for " + (isLateWithdrawal ? "Late " : "") + "Course Withdrawal",
      left,
      112,
      386,
      10,
    )
    box(427, 30, 136, 94)
    write("ทะเบียนคณะ / Received", 434, 34, 122, 9, true)
    ;["เลขที่รับ", "วันที่รับ", "เวลา", "ผู้รับ"].forEach((label, index) => {
      write(label + " " + blank, 434, 52 + index * 16, 122, 8)
    })
    const term = record(snapshot.term)
    fitted(
      "ภาคการศึกษา / Semester " +
        value(term.semester, "..........") +
        "     ปีการศึกษา / Academic Year " +
        value(term.academicYear, ".........."),
      "ภาคการศึกษา / Semester",
      left,
      128,
      width,
      17,
      9,
    )
    write("ระบบการศึกษา / Academic System", left, 145, 175, 8)
    option("ทวิภาค Semester", 215, 145, 126, 8, academicSystem === "semester")
    option(
      "ทวิภาค-นานาชาติ Semester-International",
      341,
      145,
      222,
      8,
      academicSystem === "semester-international",
    )
    option("ตรีภาค Trimester", left, 159, 145, 8, academicSystem === "trimester")
    line(left, 176, width)
    write("เรียน อธิการบดี / To The President", left, 181, 250, 9, true)
    write("ระดับนิสิต / Student level", 333, 181, 120, 8)
    option("ปริญญาตรี Undergraduate", 451, 181, 112, 7.5, studentLevel === "undergraduate")
    option("บัณฑิตศึกษา Graduate", 451, 195, 112, 7.5, studentLevel === "graduate")
    field(
      "ข้าพเจ้า นาย/นางสาว/นาง / Name Mr./Miss/Mrs.",
      [value(snapshot.studentTitle), value(snapshot.studentName)].filter(Boolean).join(" "),
      202,
      249,
    )
    write("เลขประจำตัวนิสิต / Student ID", left, 226, 166)
    const studentId = value(snapshot.studentId)
    if (studentId.length <= 10) {
      for (let index = 0; index < 10; index++) {
        box(204 + index * 24, 220, 21, 22)
        write(studentId[index] ?? "", 209 + index * 24, 222, 15, 10)
      }
    } else {
      fitted(studentId, "Student ID", 204, 222, 359, 18)
    }
    write("คณะ / Faculty", left, 247, 78)
    line(108, 261, 151)
    fitted(value(snapshot.faculty), "คณะ / Faculty", 111, 247, 145, 14)
    write("ภาควิชา/สาขาวิชา / Department/Field of study", 270, 247, 196, 8)
    line(464, 261, 99)
    fitted(
      value(snapshot.department ?? snapshot.fieldOfStudy),
      "Department/Field of study",
      467,
      247,
      93,
      14,
      8,
    )
    write("โทรศัพท์ / Telephone", left, 266, 104, 8)
    line(136, 280, 146)
    fitted(value(snapshot.telephone ?? snapshot.tel), "Telephone", 139, 266, 140, 14, 8)
    write("E-mail", 298, 266, 44)
    line(342, 280, 221)
    fitted(value(snapshot.email), "E-mail", 345, 266, 215, 14, 8)
    write("แต้มเฉลี่ยสะสม / GPAX", left, 285, 113, 8)
    line(145, 299, 82)
    fitted(value(snapshot.gpax), "GPAX", 148, 285, 76, 14, 8)
    write("สถานภาพการเป็นนิสิต / Student status", 242, 285, 174, 8)
    option("ปกติ Normal", 418, 285, 70, 7.5, studentStatus === "normal")
    option(
      "วิทยาทัณฑ์ Probation" +
        (value(snapshot.probationNo) ? " No. " + value(snapshot.probationNo) : ""),
      488,
      285,
      75,
      7,
      studentStatus === "probation",
    )
    fitted(
      "ลงทะเบียน / Registered: " +
        value(snapshot.registeredCourseCount, "..........") +
        " รายวิชา, " +
        value(snapshot.totalCredits, "..........") +
        " หน่วยกิต / credits; หลังถอน / Remaining: " +
        value(snapshot.remainingCourseCount, "..........") +
        " รายวิชา, " +
        value(snapshot.remainingCredits, "..........") +
        " หน่วยกิต / credits",
      "การลงทะเบียนภาคปัจจุบัน / Current semester registration",
      left,
      304,
      width,
      14,
      8,
    )
    write(
      "มีความประสงค์ขอถอนรายวิชาดังนี้ / Request withdrawal from the following courses:",
      left,
      319,
      width,
      8.5,
      true,
    )
  }
  function approvalSection(label: string, x: number, y: number, w: number, approval = false) {
    box(x, y, w, 46)
    write(label, x + 5, y + 4, approval ? 103 : w - 10, 7.5, true)
    if (approval) {
      option("อนุมัติ / Approved", x + 109, y + 4, 72, 6.2)
      option("ไม่อนุมัติ / Disapproved", x + 183, y + 4, 78, 6.2)
    }
    line(x + 5, y + 18, w - 10)
    write("ลงนาม / Signature", x + 5, y + 21, w * 0.55, 7.5)
    write("วันที่ / Date", x + w * 0.6, y + 21, w * 0.35 - 5, 7.5)
    line(x + 5, y + 41, w * 0.52)
    line(x + w * 0.6, y + 41, w * 0.35 - 5)
  }
  function footerForm() {
    write(
      "ข้าพเจ้าจะติดตามผลที่ทะเบียนคณะ หรือ www.reg.chula.ac.th หลังยื่นคำร้อง 5 วันทำการ",
      left,
      621,
      width,
      8,
    )
    write(
      "After 5 working days, I will check the result at the Faculty Registrar's Office or www.reg.chula.ac.th.",
      left,
      635,
      width,
      8,
    )
    write("นิสิตลงนาม / Student's signature", 284, 648, 171, 8.5)
    write("วันที่ / Date", 464, 648, 99, 8)
    line(284, 671, 171)
    line(464, 671, 99)
    approvalSection("ความเห็นอาจารย์ที่ปรึกษา / Advisor's comment", left, 681, 265)
    approvalSection("ความเห็นคณบดี / Dean's comment", 297, 681, 266)
    approvalSection("ความเห็นนายทะเบียนคณะ / Faculty Registrar's comment", left, 727, 265)
    approvalSection("อธิการบดี / The President", 297, 727, 266, true)
    approvalSection("สำนักงานการทะเบียน / Office of the Registrar", left, 773, width)
    write(
      "หากต้องการทักท้วงผล โปรดติดต่อด้วยตนเองพร้อมหลักฐานโดยด่วน / For objections, contact the Office of the Registrar in person with supporting documents.",
      left,
      819,
      width,
      6.2,
    )
  }

  const courses = coursesOf(snapshot)
  const groupCount = Math.max(1, Math.ceil(courses.length / 4))
  for (let group = 0; group < groupCount; group++) {
    if (group > 0) document.addPage()
    header()
    let x = left
    const headings = [
      "ที่\nNo.",
      "รหัสรายวิชา\nCourse No.",
      "ชื่อรายวิชา\nCourse Name",
      "หน่วยกิต\nCredits",
      "เหตุผลการถอน\nReason for withdrawal",
      "ความเห็นผู้สอน\nInstructor's comment",
    ]
    columns.forEach((w, index) => {
      document.rect(x, tableTop, w, 32).fill("#f2f2f2")
      box(x, tableTop, w, 32)
      write(headings[index] ?? "", x + 3, tableTop + 3, w - 6, 8)
      x += w
    })
    for (let slot = 0; slot < 4; slot++) {
      const courseIndex = group * 4 + slot
      const course = courses[courseIndex]
      const y = tableTop + 32 + slot * rowHeight
      const instructorInput = course?.instructors ?? course?.instructor
      const instructor = Array.isArray(instructorInput)
        ? instructorInput
            .map((item) => value(item, value(record(item).name)))
            .filter(Boolean)
            .join(", ")
        : value(instructorInput)
      const cells = course
        ? [
            String(courseIndex + 1),
            value(course.courseCode),
            [value(course.nameTh), value(course.nameEn)].filter(Boolean).join("\n"),
            value(course.credits),
            value(course.reason),
          ]
        : ["", "", "", "", ""]
      x = left
      columns.forEach((w, column) => {
        box(x, y, w, rowHeight)
        if (column < 5) {
          fitted(
            cells[column] ?? "",
            "รายวิชา " + (courseIndex + 1) + " - " + (headings[column] ?? "").replace("\n", " / "),
            x + 4,
            y + 4,
            w - 8,
            rowHeight - 8,
          )
        } else {
          option("เห็นชอบ", x + 5, y + 3, 64)
          option("ไม่เห็นชอบ", x + 74, y + 3, 71)
          write("ลงนาม / Signature", x + 5, y + 17, w - 10, 8)
          line(x + 5, y + 37, w - 10)
          fitted(
            instructor ? "อาจารย์: " + instructor : "อาจารย์: " + blank,
            "รายวิชา " + (courseIndex + 1) + " - อาจารย์ / Instructor",
            x + 5,
            y + 40,
            w - 10,
            11,
            8,
          )
          write("วันที่ / Date ........../........../..........", x + 5, y + 52, w - 10, 7.5)
        }
        x += w
      })
    }
    footerForm()
  }

  // Whole overflow values are carried here, not ellipsized or discarded.
  // Grapheme boundaries preserve Thai combining marks even for unbroken text.
  const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" })
  for (const [index, continuation] of continuations.entries()) {
    const graphemes = Array.from(segmenter.segment(continuation.content), (part) => part.segment)
    let offset = 0
    while (offset < graphemes.length) {
      document.addPage()
      write("จท48 - ภาคต่อ / Continuation " + (index + 1), left, 30, width, 14, true)
      write(continuation.label, left, 58, width, 9, true)
      // Bound context independently: the form already carries its full values.
      write(
        "Student ID: " +
          (value(snapshot.studentId).length <= 40 ? value(snapshot.studentId) : "See main form"),
        left,
        78,
        width,
        9,
      )
      let low = 1
      // Bound each shaping operation even for pasted, unbroken paragraphs.
      let high = Math.min(1200, graphemes.length - offset)
      while (low < high) {
        const mid = Math.ceil((low + high) / 2)
        if (height(graphemes.slice(offset, offset + mid).join(""), width, 10) <= 680) low = mid
        else high = mid - 1
      }
      write(graphemes.slice(offset, offset + low).join(""), left, 108, width, 10)
      offset += low
    }
  }

  const pages = document.bufferedPageRange()
  for (let page = 0; page < pages.count; page++) {
    document.switchToPage(page)
    // IDs are metadata as well, so a long ID need not crowd the printed footer.
    write("RegChula Mock - เอกสารตัวอย่าง ไม่ใช่การอนุมัติถอนรายวิชา", left, 824, 445, 7)
    write(page + 1 + " / " + pages.count, 513, 824, 50, 7)
  }
  document.info.Keywords = withdrawalId
  document.end()
  return done
}
