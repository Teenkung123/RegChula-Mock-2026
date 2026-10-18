import type { RowDataPacket } from "mysql2/promise"
import { pool } from "../../db/client"
import { compareSectionNo } from "../../shared/section-sort"
import type { ExamScheduleDto, ExamSlotDto } from "../../public-types"
import { getCurrentTerm } from "../registration/queries"

interface ExamRow extends RowDataPacket {
  course_code: string
  name_th: string
  name_en: string
  section_no: string
  midterm_date: string | null
  midterm_start_minute: number | null
  midterm_end_minute: number | null
  final_date: string | null
  final_start_minute: number | null
  final_end_minute: number | null
}

function examSlot(
  date: string | null,
  startMinute: number | null,
  endMinute: number | null,
): ExamSlotDto | null {
  if (date === null || startMinute === null || endMinute === null) return null
  return { date, startMinute, endMinute }
}

export async function listCurrentExams(studentId: string): Promise<ExamScheduleDto> {
  const connection = await pool.getConnection()
  try {
    const term = await getCurrentTerm(connection)
    if (!term) return { term: null, courses: [] }

    const [rows] = await connection.query<ExamRow[]>(
      [
        "SELECT o.course_code, o.name_th, o.name_en, s.section_no,",
        "DATE_FORMAT(o.midterm_date, '%Y-%m-%d') AS midterm_date,",
        "o.midterm_start_minute, o.midterm_end_minute,",
        "DATE_FORMAT(o.final_date, '%Y-%m-%d') AS final_date,",
        "o.final_start_minute, o.final_end_minute",
        "FROM registrations r",
        "INNER JOIN course_offerings o ON o.id = r.offering_id",
        "INNER JOIN sections s ON s.id = r.section_id",
        "WHERE r.student_id = ? AND r.term_id = ? AND r.status = 'active'",
        "ORDER BY o.course_code",
      ].join(" "),
      [studentId, term.id],
    )

    return {
      term: {
        id: term.id,
        academicYear: term.academic_year,
        semester: term.semester,
        label: term.label,
      },
      courses: rows
        .sort(
          (first, second) =>
            first.course_code.localeCompare(second.course_code) ||
            compareSectionNo(first.section_no, second.section_no),
        )
        .map((row) => ({
          courseCode: row.course_code,
          nameTh: row.name_th,
          nameEn: row.name_en,
          sectionNo: row.section_no,
          midterm: examSlot(row.midterm_date, row.midterm_start_minute, row.midterm_end_minute),
          final: examSlot(row.final_date, row.final_start_minute, row.final_end_minute),
        })),
    }
  } finally {
    connection.release()
  }
}
