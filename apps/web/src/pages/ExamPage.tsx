import { Chip, Table } from "@heroui/react"
import type { ExamCourseDto, ExamSlotDto } from "@regchula/api/public-types"
import { useQuery } from "@tanstack/react-query"
import { TriangleAlert } from "lucide-react"
import { Status } from "../components/ui"
import { PlanViewTabs } from "../components/PlanViewTabs"
import { useI18n } from "../i18n"
import { getExams } from "../lib/api"
import { useCourseColors } from "../lib/course-colors"
import { examSlotsClash } from "../lib/schedule-conflicts"
import styles from "./Exam.module.css"
import pageStyles from "./pages.module.css"

type ExamKind = "midterm" | "final"

interface ExamEvent {
  course: ExamCourseDto
  kind: ExamKind
  slot: ExamSlotDto
  date: Date
}

const eventKey = (course: ExamCourseDto, kind: ExamKind) =>
  `${course.courseCode}-${course.sectionNo}-${kind}`

function conflictingExamKeys(events: ExamEvent[]) {
  const conflicts = new Set<string>()
  events.forEach((event, index) => {
    events.slice(index + 1).forEach((other) => {
      if (!examSlotsClash(event.slot, other.slot)) return
      conflicts.add(eventKey(event.course, event.kind))
      conflicts.add(eventKey(other.course, other.kind))
    })
  })
  return conflicts
}

const timeText = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`

function examDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

const courseSlots = (course: ExamCourseDto) => [
  { kind: "midterm" as const, slot: course.midterm },
  { kind: "final" as const, slot: course.final },
]

function firstExamTime(course: ExamCourseDto) {
  const times = courseSlots(course)
    .flatMap(({ slot }) => {
      const date = slot ? examDate(slot.date) : null
      return date && slot ? [date.getTime() + slot.startMinute * 60_000] : []
    })
    .sort((left, right) => left - right)
  return times[0] ?? Number.POSITIVE_INFINITY
}

export function ExamPage() {
  const { language, locale, t, text } = useI18n()
  const exams = useQuery({ queryKey: ["exams"], queryFn: getExams })
  const courseColors = useCourseColors()
  const courses = exams.data?.courses ?? []
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
  const courseName = (course: Pick<ExamCourseDto, "nameTh" | "nameEn">) =>
    language === "th" ? course.nameTh || course.nameEn : course.nameEn || course.nameTh
  const courseSecondaryName = (course: Pick<ExamCourseDto, "nameTh" | "nameEn">) =>
    language === "th" ? course.nameEn : course.nameTh || course.nameEn
  const examLabel = (kind: ExamKind) =>
    kind === "midterm"
      ? text({ th: "สอบกลางภาค", en: "Midterm", zh: "期中考试" })
      : text({ th: "สอบปลายภาค", en: "Final", zh: "期末考试" })
  const unannounced = text({ th: "ยังไม่ประกาศ", en: "Not announced", zh: "尚未公布" })
  const invalidDate = text({
    th: "ข้อมูลวันสอบไม่ถูกต้อง",
    en: "Invalid exam date",
    zh: "考试日期无效",
  })
  const sectionLabel = (sectionNo: string) =>
    text({ th: `ตอน ${sectionNo}`, en: `Section ${sectionNo}`, zh: `第 ${sectionNo} 班` })
  const slotTime = (slot: ExamSlotDto) =>
    text({
      th: `${timeText(slot.startMinute)}–${timeText(slot.endMinute)} น.`,
      en: `${timeText(slot.startMinute)}–${timeText(slot.endMinute)} hrs`,
      zh: `${timeText(slot.startMinute)}–${timeText(slot.endMinute)} 时`,
    })
  const renderExamSlot = (course: ExamCourseDto, kind: ExamKind) => {
    const slot = course[kind]
    if (!slot) return <span className={styles.unannounced}>{unannounced}</span>
    const date = examDate(slot.date)
    if (!date) return <span className={styles.unannounced}>{invalidDate}</span>
    return (
      <span className={styles.slot}>
        <strong className={styles.slotDate}>{dateFormatter.format(date)}</strong>
        <small className={styles.slotTime}>{slotTime(slot)}</small>
        {examConflicts.has(eventKey(course, kind)) ? (
          <Chip color="danger" size="sm" variant="soft" className={styles.conflictBadge ?? ""}>
            <TriangleAlert aria-hidden="true" size={13} />
            {text({ th: "เวลาสอบซ้อน", en: "Exam overlap", zh: "考试时间重叠" })}
          </Chip>
        ) : null}
      </span>
    )
  }
  const announced = courses.reduce(
    (count, course) => count + Number(Boolean(course.midterm)) + Number(Boolean(course.final)),
    0,
  )
  const total = courses.length * 2
  const term = exams.data?.term
  const termLabel = term
    ? `${String(term.academicYear)}/${String(term.semester)}`
    : t("common.currentTerm")
  const sortedCourses = [...courses].sort((left, right) => {
    const leftTime = firstExamTime(left)
    const rightTime = firstExamTime(right)
    if (leftTime === rightTime) return left.courseCode.localeCompare(right.courseCode)
    return leftTime - rightTime
  })
  const examEvents = sortedCourses.flatMap((course) =>
    courseSlots(course).flatMap(({ kind, slot }) => {
      const date = slot ? examDate(slot.date) : null
      return date && slot ? [{ course, kind, slot, date }] : []
    }),
  )
  const examConflicts = conflictingExamKeys(examEvents)

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBody}>
          <p className={pageStyles.context}>
            {text({
              th: `ภาคการศึกษา ${termLabel}`,
              en: `Term ${termLabel}`,
              zh: `学期 ${termLabel}`,
            })}
          </p>
          <h1>{text({ th: "ตารางสอบ", en: "Exam schedule", zh: "考试安排" })}</h1>
          <p>
            {text({
              th: "วันและเวลาสอบระดับรายวิชาจากข้อมูลที่นำเข้า โดยไม่มีข้อมูลห้องสอบ",
              en: "Course-level exam dates and times from imported data. Exam rooms are not available.",
              zh: "从导入数据提供课程级考试日期和时间，不包含考场信息。",
            })}
          </p>
        </div>
      </header>

      <PlanViewTabs active="exams" />

      <section
        className={pageStyles.stats}
        aria-label={text({ th: "สรุปกำหนดการสอบ", en: "Exam schedule summary", zh: "考试安排摘要" })}
      >
        <div className={pageStyles.stat}>
          <span>{text({ th: "รายวิชาที่ลงทะเบียน", en: "Registered courses", zh: "已选课程" })}</span>
          <strong>{courses.length}</strong>
          <small>
            {text({
              th: "รายการในภาคปัจจุบัน",
              en: "Courses in the current term",
              zh: "当前学期课程",
            })}
          </small>
        </div>
        <div className={pageStyles.stat}>
          <span>
            {text({ th: "กำหนดการที่ประกาศแล้ว", en: "Announced sessions", zh: "已公布安排" })}
          </span>
          <strong>{announced}</strong>
          <small>
            {text({
              th: `จากทั้งหมด ${total} กำหนดการ`,
              en: `${total} sessions in total`,
              zh: `共 ${total} 项安排`,
            })}
          </small>
        </div>
        <div className={pageStyles.stat}>
          <span>
            {text({ th: "กำหนดการที่ยังไม่ประกาศ", en: "Unannounced sessions", zh: "未公布安排" })}
          </span>
          <strong>{Math.max(total - announced, 0)}</strong>
          <small>
            {text({
              th: "ตรวจสอบข้อมูลล่าสุดก่อนวันสอบ",
              en: "Check the latest information before the exam date.",
              zh: "请在考试日期前查看最新信息。",
            })}
          </small>
        </div>
      </section>

      <Status tone="neutral">
        {text({
          th: "ตารางนี้ใช้วันและเวลาระดับรายวิชาจากไฟล์นำเข้า ซึ่งไม่มีข้อมูลห้องสอบ",
          en: "This schedule uses course-level dates and times from imported data; exam rooms are unavailable.",
          zh: "本安排使用导入数据中的课程级日期和时间，不提供考场信息。",
        })}
      </Status>
      {exams.isError ? (
        <Status tone="error">
          {text({
            th: "โหลดตารางสอบไม่ได้ ลองรีเฟรชหน้าอีกครั้ง",
            en: "Could not load the exam schedule. Refresh the page and try again.",
            zh: "无法加载考试安排。请刷新页面后重试。",
          })}
        </Status>
      ) : null}
      {courseColors.error ? (
        <Status tone="error">
          {text({
            th: "โหลดสีรายวิชาไม่ได้",
            en: "Could not load course colors",
            zh: "无法加载课程颜色",
          })}
        </Status>
      ) : null}
      {exams.isPending ? (
        <p className={pageStyles.muted}>
          {text({ th: "กำลังโหลดตารางสอบ", en: "Loading exam schedule", zh: "正在加载考试安排" })}
        </p>
      ) : null}
      {exams.isSuccess && courses.length === 0 ? (
        <div className={pageStyles.empty}>
          <div>
            <h2>
              {text({
                th: "ยังไม่มีรายวิชาในตารางสอบ",
                en: "No courses in the exam schedule",
                zh: "考试安排中没有课程",
              })}
            </h2>
            <p>
              {text({
                th: "ลงทะเบียนรายวิชาแล้วระบบจะแสดงกำหนดการสอบที่มีในไฟล์นำเข้า",
                en: "Register for courses and the system will show exam information found in the imported data.",
                zh: "选课后，系统将显示导入数据中提供的考试信息。",
              })}
            </p>
          </div>
        </div>
      ) : null}

      {courses.length > 0 ? (
        <>
          <section
            className={styles.examBoards}
            data-testid="exam-boards"
            aria-label={text({
              th: "สรุปตารางสอบกลางภาคและปลายภาค",
              en: "Midterm and final exam boards",
              zh: "期中和期末考试概览",
            })}
          >
            {(["midterm", "final"] as const).map((kind) => (
              <section className={styles.examBoard} key={kind}>
                <h2>{examLabel(kind)}</h2>
                <ol>
                  {[...sortedCourses]
                    .sort((left, right) => {
                      const leftSlot = left[kind]
                      const rightSlot = right[kind]
                      const leftDate = leftSlot
                        ? (examDate(leftSlot.date)?.getTime() ?? Number.POSITIVE_INFINITY)
                        : Number.POSITIVE_INFINITY
                      const rightDate = rightSlot
                        ? (examDate(rightSlot.date)?.getTime() ?? Number.POSITIVE_INFINITY)
                        : Number.POSITIVE_INFINITY
                      return (
                        leftDate - rightDate ||
                        (leftSlot?.startMinute ?? 0) - (rightSlot?.startMinute ?? 0) ||
                        left.courseCode.localeCompare(right.courseCode)
                      )
                    })
                    .map((course, index) => {
                      const slot = course[kind]
                      const date = slot ? examDate(slot.date) : null
                      const hasConflict = examConflicts.has(eventKey(course, kind))
                      return (
                        <li
                          data-conflict={hasConflict}
                          data-course-code={course.courseCode}
                          data-testid="exam-course-card"
                          key={course.courseCode + "-" + course.sectionNo + "-" + kind}
                          style={courseColors.styleFor(course.courseCode)}
                        >
                          <span className={styles.examIndex}>{index + 1}</span>
                          <div>
                            <strong>
                              {course.courseCode} {courseName(course)}
                            </strong>
                            <small>{sectionLabel(course.sectionNo)}</small>
                          </div>
                          <div className={styles.examBoardTime}>
                            <strong>
                              {date ? dateFormatter.format(date) : slot ? invalidDate : unannounced}
                            </strong>
                            {slot && date ? <small>{slotTime(slot)}</small> : null}
                          </div>
                          {hasConflict ? (
                            <Chip
                              color="danger"
                              size="sm"
                              variant="soft"
                              className={styles.conflictBadge ?? ""}
                            >
                              <TriangleAlert aria-hidden="true" size={13} />
                              {text({ th: "เวลาสอบซ้อน", en: "Exam overlap", zh: "考试时间重叠" })}
                            </Chip>
                          ) : null}
                        </li>
                      )
                    })}
                </ol>
              </section>
            ))}
          </section>

          <section
            className={styles.tableWrap}
            data-testid="exam-table-wrap"
            aria-labelledby="exam-table-heading"
          >
            <header className={styles.tableHeader}>
              <div>
                <h2 id="exam-table-heading">
                  {text({
                    th: "กำหนดการสอบตามรายวิชา",
                    en: "Exam sessions by course",
                    zh: "按课程列出的考试安排",
                  })}
                </h2>
                <p>
                  {text({
                    th: "เรียงตามกำหนดการสอบแรกที่ประกาศของแต่ละรายวิชา",
                    en: "Ordered by each course's first announced exam session.",
                    zh: "按每门课程最早公布的考试安排排序。",
                  })}
                </p>
              </div>
              <span>
                {text({
                  th: `${courses.length} รายวิชา`,
                  en: `${courses.length} courses`,
                  zh: `${courses.length} 门课程`,
                })}
              </span>
            </header>
            <Table className={styles.heroTable ?? ""}>
              <Table.Content
                aria-label={text({
                  th: "ตารางสอบกลางภาคและปลายภาค",
                  en: "Midterm and final exam schedule",
                  zh: "期中和期末考试安排",
                })}
              >
                <Table.Header>
                  <Table.Column isRowHeader>
                    {text({ th: "รายวิชา", en: "Course", zh: "课程" })}
                  </Table.Column>
                  <Table.Column>{text({ th: "ตอน", en: "Section", zh: "班次" })}</Table.Column>
                  <Table.Column>{examLabel("midterm")}</Table.Column>
                  <Table.Column>{examLabel("final")}</Table.Column>
                </Table.Header>
                <Table.Body>
                  {sortedCourses.map((course) => (
                    <Table.Row
                      data-conflict={courseSlots(course).some(({ kind }) =>
                        examConflicts.has(eventKey(course, kind)),
                      )}
                      key={`${course.courseCode}-${course.sectionNo}`}
                      style={courseColors.styleFor(course.courseCode)}
                    >
                      <Table.Cell>
                        <div className={styles.courseIdentity}>
                          <strong>{course.courseCode}</strong>
                          <span>{courseName(course)}</span>
                          <small>{courseSecondaryName(course)}</small>
                        </div>
                      </Table.Cell>
                      <Table.Cell>{course.sectionNo}</Table.Cell>
                      <Table.Cell>{renderExamSlot(course, "midterm")}</Table.Cell>
                      <Table.Cell>{renderExamSlot(course, "final")}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table>
          </section>
        </>
      ) : null}
    </div>
  )
}
