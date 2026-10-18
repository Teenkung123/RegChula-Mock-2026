import { Button } from "@heroui/react"
import type { RuleIssueDto } from "@regchula/api/public-types"
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  Users,
} from "lucide-react"
import { type CSSProperties, useId, useState } from "react"
import { Link } from "react-router"
import { useI18n } from "../i18n"
import styles from "./RegistrationWarnings.module.css"
import { CourseReference, type CourseReferenceContext } from "./CourseReference"

const categories = [
  {
    code: "PREREQUISITE_MISSING",
    icon: BookOpen,
    label: { th: "วิชาบังคับก่อน", en: "Prerequisites", zh: "先修课程" },
  },
  {
    code: "COREQUISITE_MISSING",
    icon: Users,
    label: { th: "วิชาที่ต้องเรียนร่วม", en: "Corequisites", zh: "共修课程" },
  },
  {
    code: "FACULTY_APPROVAL_REQUIRED",
    icon: AlertTriangle,
    label: {
      th: "เงื่อนไขที่ต้องตรวจสอบ",
      en: "Requirements to review",
      zh: "待核实的要求",
    },
  },
  {
    code: "SCHEDULE_CONFLICT",
    icon: Clock,
    label: { th: "เวลาเรียนทับซ้อน", en: "Class times overlap", zh: "上课时间冲突" },
  },
  {
    code: "EXAM_CONFLICT",
    icon: CalendarClock,
    label: { th: "เวลาสอบทับซ้อน", en: "Exam times overlap", zh: "考试时间冲突" },
  },
] as const

export function isAdvisoryIssue(issue: RuleIssueDto): boolean {
  return categories.some(({ code }) => code === issue.code)
}

export interface RegistrationWarningsProps extends CourseReferenceContext {
  issues: RuleIssueDto[]
  prerequisiteText?: string | null | undefined
  courseCode: string
  defaultExpanded?: boolean
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function examDay(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null
  }
  if (typeof value !== "string") return null
  const day = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(value)?.[1]
  if (!day) return null
  const date = new Date(`${day}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null
  if (value !== day && !Number.isFinite(Date.parse(value))) return null
  return day
}

function slot(value: unknown, exam: boolean) {
  const data = record(value)
  if (!data) return null
  const { startMinute, endMinute } = data
  if (
    typeof startMinute !== "number" ||
    typeof endMinute !== "number" ||
    !Number.isInteger(startMinute) ||
    !Number.isInteger(endMinute) ||
    startMinute < 0 ||
    endMinute > 1440 ||
    startMinute >= endMinute
  )
    return null
  const day = exam ? examDay(data.date) : data.dayCode
  if (typeof day !== "string" || !day.trim()) return null
  return { day, startMinute, endMinute }
}

function time(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
}

function missingCodes(issues: RuleIssueDto[]): string[] {
  return [
    ...new Set(
      issues.flatMap((issue) => {
        const codes = record(issue.details)?.missingCourseCodes
        return Array.isArray(codes)
          ? codes.filter((code): code is string => typeof code === "string" && /^\d{7}$/.test(code))
          : []
      }),
    ),
  ]
}

function DependencyLinks({ codes, courses, term }: CourseReferenceContext & { codes: string[] }) {
  const { text } = useI18n()
  return (
    <span className={styles.links}>
      {codes.map((code) => (
        <Link
          key={code}
          to={`/search?q=${code}${term?.academicYear !== undefined && term.semester !== undefined ? `&academicYear=${term.academicYear}&semester=${term.semester}` : ""}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className={styles.srOnly}>{text({ th: "ค้นหา", en: "Search", zh: "搜索" })}</span>{" "}
          <CourseReference courseCode={code} courses={courses} term={term} />{" "}
          <span className={styles.srOnly}>
            {text({ th: " (เปิดในแท็บใหม่)", en: " (opens in a new tab)", zh: "（在新标签页打开）" })}
          </span>
        </Link>
      ))}
    </span>
  )
}

function dayLabel(day: string, exam: boolean, locale: string) {
  const weekday = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"].indexOf(day)
  if (!exam && weekday < 0) return day
  return new Intl.DateTimeFormat(
    locale,
    exam
      ? { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }
      : { weekday: "long", timeZone: "UTC" },
  ).format(new Date(exam ? `${day}T00:00:00Z` : Date.UTC(2026, 0, 4 + weekday)))
}

function ComparisonBars({
  target,
  existing,
}: {
  target: NonNullable<ReturnType<typeof slot>>
  existing: NonNullable<ReturnType<typeof slot>>
}) {
  const start = Math.min(target.startMinute, existing.startMinute)
  const end = Math.max(target.endMinute, existing.endMinute)
  const geometry = (from: number, to: number) =>
    ({
      "--bar-start": `${((from - start) / (end - start)) * 100}%`,
      "--bar-width": `${((to - from) / (end - start)) * 100}%`,
    }) as CSSProperties
  const overlap = geometry(
    Math.max(target.startMinute, existing.startMinute),
    Math.min(target.endMinute, existing.endMinute),
  )
  return (
    <div className={styles.bars} aria-hidden="true">
      {[target, existing].map((entry, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Two fixed decorative lanes, target then existing.
        <div className={styles.track} key={index}>
          <span className={styles.bar} style={geometry(entry.startMinute, entry.endMinute)} />
          <span className={styles.overlap} style={overlap} />
        </div>
      ))}
      <div className={styles.axis}>
        <span>{time(start)}</span>
        <span>{time(end)}</span>
      </div>
    </div>
  )
}

function ConflictDetail({
  issue,
  courseCode,
  courses,
  term,
}: CourseReferenceContext & { issue: RuleIssueDto; courseCode: string }) {
  const { text, locale } = useI18n()
  const exam = issue.code === "EXAM_CONFLICT"
  const details = record(issue.details)
  const conflicts = Array.isArray(details?.conflicts) ? details.conflicts : []
  const valid = conflicts.flatMap((value) => {
    const conflict = record(value)
    if (
      !conflict ||
      typeof conflict.courseCode !== "string" ||
      !/^\d{7}$/.test(conflict.courseCode)
    )
      return []
    const target = slot(conflict.target, exam)
    const existing = slot(conflict.existing, exam)
    if (!target || !existing || target.day !== existing.day) return []
    const duration =
      Math.min(target.endMinute, existing.endMinute) -
      Math.max(target.startMinute, existing.startMinute)
    if (duration <= 0) return []
    const kind = (value: unknown) =>
      value === "midterm"
        ? text({ th: "กลางภาค", en: "Midterm", zh: "期中" })
        : value === "final"
          ? text({ th: "ปลายภาค", en: "Final", zh: "期末" })
          : text({ th: "ไม่ระบุประเภทสอบ", en: "Exam kind unavailable", zh: "考试类型未提供" })
    return [
      {
        courseCode: conflict.courseCode,
        target,
        existing,
        duration,
        targetKind: exam ? kind(conflict.targetKind) : "",
        existingKind: exam ? kind(conflict.existingKind) : "",
      },
    ]
  })
  const fallback =
    typeof details?.conflictingCourseCode === "string" &&
    /^\d{7}$/.test(details.conflictingCourseCode)
      ? details.conflictingCourseCode
      : null
  return (
    <>
      {valid.map((conflict, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Read-only source rows have no IDs or local state; duplicates must remain visible.
        <div className={styles.comparison} key={`${conflict.courseCode}-${index}`}>
          <p>
            <strong>
              <CourseReference courseCode={courseCode} courses={courses} term={term} />
            </strong>{" "}
            · {dayLabel(conflict.target.day, exam, locale)} {conflict.targetKind} ·{" "}
            {time(conflict.target.startMinute)}–{time(conflict.target.endMinute)}
          </p>
          <p>
            <strong>
              <CourseReference courseCode={conflict.courseCode} courses={courses} term={term} />
            </strong>{" "}
            · {dayLabel(conflict.existing.day, exam, locale)} {conflict.existingKind} ·{" "}
            {time(conflict.existing.startMinute)}–{time(conflict.existing.endMinute)}
          </p>
          <ComparisonBars target={conflict.target} existing={conflict.existing} />
          <p className={styles.conflictText}>
            {text({
              th: `ทับซ้อน ${conflict.duration} นาที`,
              en: `Overlap: ${conflict.duration} minutes`,
              zh: `重叠 ${conflict.duration} 分钟`,
            })}
          </p>
        </div>
      ))}
      {valid.length === 0 && fallback ? (
        <p>
          <CourseReference courseCode={courseCode} courses={courses} term={term} /> ↔{" "}
          <CourseReference courseCode={fallback} courses={courses} term={term} />
        </p>
      ) : null}
      {valid.length === 0 || valid.length < conflicts.length ? (
        <p>
          {text({
            th: "รายละเอียดเวลาบางส่วนไม่มีหรือไม่ถูกต้อง โปรดตรวจสอบตารางต้นทาง",
            en: "Some timing details are missing or invalid. Check the source schedule.",
            zh: "部分时间信息缺失或无效，请核实原始课表。",
          })}
        </p>
      ) : null}
    </>
  )
}

export function RegistrationWarnings({
  issues,
  prerequisiteText,
  courseCode,
  courses,
  term,
  defaultExpanded = false,
}: RegistrationWarningsProps) {
  const { text } = useI18n()
  const id = useId()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const warnings = categories
    .map((category) => ({
      ...category,
      issues: issues.filter((issue) => issue.code === category.code),
    }))
    .filter((group) => group.issues.length > 0)
  const groups = [
    ...(prerequisiteText?.trim()
      ? [
          {
            code: "REQUIREMENTS",
            icon: BookOpen,
            label: { th: "เงื่อนไขรายวิชา", en: "Course requirements", zh: "课程要求" },
            issues: [] as RuleIssueDto[],
          },
        ]
      : []),
    ...warnings,
  ]
  if (!groups.length) return null
  const dependencies = [...new Set(prerequisiteText?.match(/(?<!\d)\d{7}(?!\d)/g) ?? [])]
  return (
    <div className={styles.root}>
      {warnings.length > 0 ? (
        <p className={styles.notice}>
          {text({
            th: "คำเตือนเท่านั้น · ยังลงทะเบียนได้ โปรดตรวจสอบเงื่อนไขและตารางด้วยตนเอง",
            en: "Warnings only · You can still register. Check requirements and schedules yourself.",
            zh: "仅作提醒 · 仍可选课。请自行核实课程要求和时间安排。",
          })}
        </p>
      ) : null}
      {groups.map((group) => {
        const open = expanded[group.code] ?? defaultExpanded
        const conflict = group.code === "SCHEDULE_CONFLICT" || group.code === "EXAM_CONFLICT"
        const neutral = group.code === "REQUIREMENTS"
        const missing = missingCodes(group.issues)
        const count = neutral
          ? null
          : conflict
            ? group.issues.reduce((total, issue) => {
                const details = record(issue.details)
                return (
                  total +
                  (Array.isArray(details?.conflicts)
                    ? details.conflicts.length
                    : typeof details?.conflictingCourseCode === "string"
                      ? 1
                      : 0)
                )
              }, 0)
            : missing.length || group.issues.length
        const Icon = group.icon
        const Chevron = open ? ChevronUp : ChevronDown
        const panelId = `${id}-${group.code}`
        return (
          <div
            className={styles.group}
            data-conflict={conflict}
            data-neutral={neutral}
            key={group.code}
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={styles.toggle ?? ""}
              id={`${panelId}-button`}
              aria-expanded={open}
              aria-controls={panelId}
              onPress={() => setExpanded((current) => ({ ...current, [group.code]: !open }))}
            >
              <Icon aria-hidden="true" className={styles.categoryIcon} />
              <span className={styles.label}>{text(group.label)}</span>{" "}
              {count !== null ? <span className={styles.count}>{count}</span> : null}
              <Chevron aria-hidden="true" />
            </Button>
            <section
              id={panelId}
              hidden={!open}
              aria-labelledby={`${panelId}-button`}
              className={styles.details}
            >
              {!open ? null : conflict ? (
                group.issues.map((issue, index) => (
                  <ConflictDetail
                    // biome-ignore lint/suspicious/noArrayIndexKey: API issues have no IDs and these detail components hold no state.
                    key={`${issue.code}-${index}`}
                    issue={issue}
                    courseCode={courseCode}
                    courses={courses}
                    term={term}
                  />
                ))
              ) : (
                <>
                  {!neutral ? (
                    <>
                      <p className={styles.sourceLabel}>
                        {text({ th: "ยังไม่ยืนยัน", en: "Not verified", zh: "尚未确认" })}
                      </p>
                      {missing.length > 0 ? (
                        <DependencyLinks codes={missing} courses={courses} term={term} />
                      ) : null}
                      <p>
                        {text({
                          th: "โปรดตรวจสอบเงื่อนไขต้นทาง ระบบไม่ได้ยืนยันว่าผ่านเงื่อนไขหรือได้รับอนุมัติแล้ว",
                          en: "Review the source requirements. Completion or approval has not been verified.",
                          zh: "请核实原始要求；尚未确认已满足条件或获得批准。",
                        })}
                      </p>
                    </>
                  ) : null}
                  {neutral ? (
                    <>
                      <p>
                        {text({
                          th: "PRER: ต้องผ่านก่อน · CORE/COREQ: เรียนร่วมกัน อ่าน AND/OR และเงื่อนไขอื่นตามต้นฉบับ ข้อมูลนี้ไม่ใช่ผลตรวจคุณสมบัติ",
                          en: "PRER: pass beforehand · CORE/COREQ: take alongside. Read AND/OR and other conditions as written. This is source information, not an eligibility result.",
                          zh: "PRER：须提前通过 · CORE/COREQ：须同时修读。请按原文理解 AND/OR 及其他条件；此处仅展示来源信息，并非资格检查结果。",
                        })}
                      </p>
                      <p className={styles.sourceLabel}>
                        {text({
                          th: "เงื่อนไขจากต้นทาง",
                          en: "Source requirements",
                          zh: "原始课程要求",
                        })}
                      </p>
                      <p className={styles.source}>
                        {prerequisiteText?.trim()
                          ? prerequisiteText
                          : text({
                              th: "ไม่มีข้อความเงื่อนไขจากต้นทาง",
                              en: "Source requirement text is unavailable.",
                              zh: "未提供原始要求文本。",
                            })}
                      </p>
                      {dependencies.length > 0 ? (
                        <nav
                          aria-label={text({
                            th: "ค้นหาวิชาที่ระบุในเงื่อนไข",
                            en: "Search courses mentioned in requirements",
                            zh: "搜索要求中提及的课程",
                          })}
                          className={styles.links}
                        >
                          <DependencyLinks codes={dependencies} courses={courses} term={term} />
                        </nav>
                      ) : null}
                    </>
                  ) : !prerequisiteText?.trim() ? (
                    <p>
                      {text({
                        th: "ไม่มีข้อความเงื่อนไขจากต้นทาง",
                        en: "Source requirement text is unavailable.",
                        zh: "未提供原始要求文本。",
                      })}
                    </p>
                  ) : null}
                </>
              )}
            </section>
          </div>
        )
      })}
    </div>
  )
}
