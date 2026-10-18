import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { renderWithdrawalPdf } from "../apps/api/src/modules/withdrawal/pdf"

const output = resolve(import.meta.dir, "../tmp/pdfs/withdrawal-four-courses.pdf")
const courses = [
  {
    courseCode: "2301101",
    nameTh: "แคลคูลัสเบื้องต้น",
    nameEn: "CALCULUS I",
    credits: 3,
    instructors: ["อาจารย์ ก."],
    reason: "ต้องการปรับพื้นฐานคณิตศาสตร์ให้มั่นคงก่อนลงเรียนในภาคการศึกษาถัดไป",
  },
  {
    courseCode: "2302111",
    nameTh: "เคมีทั่วไป",
    nameEn: "GENERAL CHEMISTRY",
    credits: 3,
    instructors: ["อาจารย์ ข."],
    reason: "มีภาระงานเพิ่มขึ้น จึงขอปรับแผนการเรียนให้เหมาะสมและรักษาคุณภาพการศึกษา",
  },
  {
    courseCode: "2303101",
    nameTh: "ฟิสิกส์ทั่วไป",
    nameEn: "GENERAL PHYSICS",
    credits: 3,
    instructors: ["อาจารย์ ค."],
    reason: "ขอจัดสรรเวลาเพื่อทบทวนเนื้อหาและเตรียมความพร้อมสำหรับรายวิชาบังคับ",
  },
  {
    courseCode: "2301170",
    nameTh: "การเขียนโปรแกรม",
    nameEn: "COMPUTER PROGRAMMING",
    credits: 3,
    instructors: ["อาจารย์ ง."],
    reason: "ประสงค์จะย้ายรายวิชาไปเรียนในภาคถัดไป หลังหารือเรื่องแผนการเรียนกับอาจารย์",
  },
]
await mkdir(resolve(output, ".."), { recursive: true })
await Bun.write(
  output,
  await renderWithdrawalPdf("preview-four-courses", {
    studentId: "6730000021",
    term: { academicYear: 2569, semester: 1 },
    totalCredits: 21,
    remainingCredits: 9,
    courses,
  }),
)
console.log(output)
