import { ScheduleActivities, useActivities, activityTime } from "../components/ScheduleActivities"
import { PageLoading } from "../components/PageLoading"
import type { ActivityDto } from "@regchula/api/public-types"
import { Chip } from "@heroui/react"
import type { MeetingDto, RegistrationDto } from "@regchula/api/public-types"
import { useQuery } from "@tanstack/react-query"
import { CalendarDays, Download, TriangleAlert } from "lucide-react"
import { Fragment, type CSSProperties, useRef, useState } from "react"
import { Button, Status } from "../components/ui"
import { CourseColorPicker } from "../components/CourseColorPicker"
import { PlanViewTabs } from "../components/PlanViewTabs"
import { useI18n } from "../i18n"
import { getSchedule } from "../lib/api"
import { useCourseColors } from "../lib/course-colors"
import { meetingsClash } from "../lib/schedule-conflicts"
import { exportSchedulePng } from "../lib/schedule-export"
import { compactTimetableAxis } from "../lib/compact-timetable"
import pageStyles from "./pages.module.css"
import styles from "./Schedule.module.css"

const dayCodes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const

const meetingValues = (meeting: MeetingDto, unspecifiedTime: string) => ({
  dayCode: meeting.dayCode ?? meeting.day_code ?? null,
  startMinute: meeting.startMinute ?? meeting.start_minute ?? null,
  endMinute: meeting.endMinute ?? meeting.end_minute ?? null,
  periodLabel: meeting.periodLabel ?? meeting.period_label ?? unspecifiedTime,
})

function scheduledMeetings(registrations: RegistrationDto[], unspecifiedTime: string) {
  return registrations.flatMap((registration) =>
    registration.meetings.map((meeting) => ({
      registration,
      meeting,
      key: meetingKey(registration, meeting),
      values: meetingValues(meeting, unspecifiedTime),
    })),
  )
}

type ScheduledMeeting = ReturnType<typeof scheduledMeetings>[number]
type TimedMeeting = ScheduledMeeting & {
  values: ScheduledMeeting["values"] & {
    dayCode: string
    startMinute: number
    endMinute: number
  }
}

function isTimedMeeting(item: ScheduledMeeting): item is TimedMeeting {
  const { dayCode, startMinute, endMinute } = item.values
  return (
    !item.meeting.arranged &&
    dayCodes.some((code) => code === dayCode) &&
    startMinute !== null &&
    endMinute !== null &&
    Number.isFinite(startMinute) &&
    Number.isFinite(endMinute) &&
    startMinute >= 0 &&
    endMinute <= 24 * 60 &&
    endMinute > startMinute
  )
}

type TimedEntry =
  | (TimedMeeting & { activity?: never })
  | {
      registration: null
      activity: ActivityDto
      meeting: MeetingDto
      key: string
      values: TimedMeeting["values"]
    }

function meetingLayout(meetings: TimedEntry[]) {
  const conflicts = new Set<string>()
  const positions = new Map<string, { lane: number; laneCount: number }>()
  dayCodes.forEach((dayCode) => {
    const dayMeetings = meetings
      .filter(({ values }) => values.dayCode === dayCode)
      .sort((first, second) => first.values.startMinute - second.values.startMinute)
    const laneEnds: number[] = []
    const dayPositions: Array<{ key: string; lane: number }> = []
    dayMeetings.forEach((item, index) => {
      const lane = laneEnds.findIndex((endMinute) => endMinute <= item.values.startMinute)
      const assignedLane = lane === -1 ? laneEnds.length : lane
      laneEnds[assignedLane] = item.values.endMinute
      dayPositions.push({ key: item.key, lane: assignedLane })
      dayMeetings.slice(index + 1).forEach((other) => {
        if (!meetingsClash(item.meeting, other.meeting)) return
        conflicts.add(item.key)
        conflicts.add(other.key)
      })
    })
    dayPositions.forEach(({ key, lane }) => {
      positions.set(key, { lane, laneCount: Math.max(laneEnds.length, 1) })
    })
  })
  return { conflicts, positions }
}

const meetingKey = (registration: RegistrationDto, meeting: MeetingDto): string =>
  [
    registration.registrationId,
    meeting.dayCode ?? meeting.day_code ?? "IA",
    meeting.startMinute ?? meeting.start_minute ?? "NA",
    meeting.endMinute ?? meeting.end_minute ?? "NA",
    meeting.classType ?? meeting.class_type ?? "CLASS",
    meeting.room ?? "ROOM",
  ].join("-")

export function SchedulePage() {
  const { language, t, text } = useI18n()
  const schedule = useQuery({ queryKey: ["schedule"], queryFn: getSchedule })
  const courseColors = useCourseColors()
  const activities = useActivities(schedule.data?.term?.id)
  const gridRef = useRef<HTMLDivElement>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const exportInProgress = useRef(false)
  const unspecifiedTime = text({ th: "ไม่ระบุเวลา", en: "Time not specified", zh: "时间未注明" })
  const registrations = schedule.data?.registrations ?? []
  const meetings = scheduledMeetings(registrations, unspecifiedTime)
  const arranged = meetings.filter((item) => !isTimedMeeting(item))
  const timedMeetings: TimedEntry[] = [
    ...meetings.filter(isTimedMeeting),
    ...(activities.data ?? []).map((activity) => {
      const values = {
        dayCode: activity.dayCode,
        startMinute: activity.startMinute,
        endMinute: activity.endMinute,
        periodLabel: `${activityTime(activity.startMinute)}–${activityTime(activity.endMinute)}`,
      }
      return {
        registration: null,
        activity,
        key: `activity-${activity.id}`,
        values,
        meeting: { ...values, arranged: false, building: null, room: null, teachers: null },
      }
    }),
  ]
  const startOfDay =
    Math.floor(Math.min(8 * 60, ...timedMeetings.map(({ values }) => values.startMinute)) / 60) * 60
  const endOfDay =
    Math.ceil(Math.max(20 * 60, ...timedMeetings.map(({ values }) => values.endMinute)) / 60) * 60
  const hours = Array.from(
    { length: (endOfDay - startOfDay) / 60 },
    (_, index) => startOfDay / 60 + index,
  )
  const { conflicts, positions } = meetingLayout(timedMeetings)
  const compactAxis = compactTimetableAxis(
    hours,
    timedMeetings.map(({ values }) => values),
  )
  const visibleDays = dayCodes.filter(
    (code) =>
      (code !== "SA" && code !== "SU") ||
      meetings.some(({ values }) => values.dayCode === code) ||
      timedMeetings.some(({ values }) => values.dayCode === code),
  )
  const conflictCount = conflicts.size
  const conflictingCourses = new Set(
    timedMeetings
      .filter((item) => item.registration && conflicts.has(item.key))
      .map(({ registration }) => registration?.courseCode),
  )
  const totalCredits = registrations.reduce((sum, registration) => sum + registration.credits, 0)
  const term = schedule.data?.term
  const termLabel = term
    ? `${String(term.academicYear)}/${String(term.semester)}`
    : t("common.currentTerm")
  const courseName = (nameTh: string, nameEn: string) =>
    language === "th" ? nameTh || nameEn : nameEn || nameTh
  const sectionLabel = (sectionNo: string) =>
    text({ th: `ตอน ${sectionNo}`, en: `Section ${sectionNo}`, zh: `第 ${sectionNo} 班` })
  const dayLabel = (code: (typeof dayCodes)[number]) => {
    switch (code) {
      case "MO":
        return text({ th: "จันทร์", en: "Monday", zh: "星期一" })
      case "TU":
        return text({ th: "อังคาร", en: "Tuesday", zh: "星期二" })
      case "WE":
        return text({ th: "พุธ", en: "Wednesday", zh: "星期三" })
      case "TH":
        return text({ th: "พฤหัสบดี", en: "Thursday", zh: "星期四" })
      case "FR":
        return text({ th: "ศุกร์", en: "Friday", zh: "星期五" })
      case "SA":
        return text({ th: "เสาร์", en: "Saturday", zh: "星期六" })
      case "SU":
        return text({ th: "อาทิตย์", en: "Sunday", zh: "星期日" })
    }
  }

  const exportPng = async () => {
    const node = gridRef.current
    if (!node || exportInProgress.current) return
    exportInProgress.current = true
    setExporting(true)
    try {
      setExportError(null)
      const dataUrl = await exportSchedulePng(node, hours.length)
      const link = document.createElement("a")
      link.download =
        text({ th: "regchula-ตารางเรียน", en: "regchula-schedule", zh: "regchula-课程表" }) +
        "-" +
        String(
          schedule.data?.term?.academicYear ?? text({ th: "ภาคการศึกษา", en: "term", zh: "学期" }),
        ) +
        "-" +
        String(schedule.data?.term?.semester ?? "") +
        ".png"
      link.href = dataUrl
      link.click()
    } catch {
      setExportError(
        text({
          th: "สร้างไฟล์ PNG ไม่สำเร็จ ลองใช้เบราว์เซอร์ Chrome หรือ Edge",
          en: "Could not create the PNG. Try Chrome or Edge.",
          zh: "无法创建 PNG 文件。请尝试使用 Chrome 或 Edge。",
        }),
      )
    } finally {
      exportInProgress.current = false
      setExporting(false)
    }
  }

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
          <h1>{text({ th: "ตารางเรียนรายสัปดาห์", en: "Weekly schedule", zh: "每周课程表" })}</h1>
          <p>
            {text({
              th: "มุมมองแผนเรียนจากรายวิชาที่ลงทะเบียนอยู่ในภาคปัจจุบัน",
              en: "A weekly plan built from active registrations in the current term.",
              zh: "根据当前学期已选课程生成的每周计划。",
            })}
          </p>
        </div>
        <Button
          disabled={
            timedMeetings.length === 0 ||
            exporting ||
            !activities.isSuccess ||
            activities.isFetching
          }
          aria-busy={exporting}
          onClick={() => void exportPng()}
          variant="quiet"
        >
          <Download aria-hidden="true" size={17} />
          {exporting
            ? text({ th: "กำลังสร้าง PNG", en: "Creating PNG", zh: "正在生成 PNG" })
            : text({ th: "ดาวน์โหลด PNG", en: "Download PNG", zh: "下载 PNG" })}
        </Button>
      </header>

      <PlanViewTabs active="schedule" />

      {term ? (
        <ScheduleActivities
          key={term.id}
          termId={term.id}
          activities={activities}
          dayLabel={dayLabel}
        />
      ) : null}

      {exportError ? <Status tone="error">{exportError}</Status> : null}
      {schedule.isError ? (
        <Status tone="error">
          {text({
            th: "โหลดตารางเรียนไม่ได้ ลองรีเฟรชหน้าอีกครั้ง",
            en: "Could not load the schedule. Refresh the page and try again.",
            zh: "无法加载课程表。请刷新页面后重试。",
          })}
        </Status>
      ) : null}
      {courseColors.error ? (
        <Status tone="error">
          {text({
            th: "โหลดหรือบันทึกสีรายวิชาไม่ได้",
            en: "Could not load or save course colors",
            zh: "无法加载或保存课程颜色",
          })}
        </Status>
      ) : null}

      <section
        className={styles.scheduleContext}
        aria-label={text({ th: "สรุปตารางเรียน", en: "Schedule summary", zh: "课程表摘要" })}
      >
        <div>
          <span>{text({ th: "ภาคการศึกษา", en: "Term", zh: "学期" })}</span>
          <strong>{term ? termLabel : "—"}</strong>
        </div>
        <div>
          <span>{text({ th: "รายการที่จัดลงตาราง", en: "Scheduled meetings", zh: "已排课时" })}</span>
          <strong>{timedMeetings.length}</strong>
        </div>
        <div>
          <span>{text({ th: "ยังไม่ระบุเวลา", en: "Time not specified", zh: "时间未注明" })}</span>
          <strong>{arranged.length}</strong>
        </div>
        <div>
          <span>
            {text({ th: "รายการเวลาซ้อน", en: "Overlapping meetings", zh: "时间重叠课程" })}
          </span>
          <strong>{conflictCount}</strong>
        </div>
      </section>

      {schedule.isPending ? (
        <PageLoading
          label={text({ th: "กำลังโหลดตารางเรียน", en: "Loading schedule", zh: "正在加载课程表" })}
        />
      ) : null}
      {registrations.length === 0 && activities.data?.length === 0 && schedule.isSuccess ? (
        <div className={pageStyles.empty}>
          <CalendarDays aria-hidden="true" size={22} />
          <div>
            <h2>
              {text({ th: "ตารางเรียนยังว่าง", en: "Your schedule is empty", zh: "课程表为空" })}
            </h2>
            <p>
              {text({
                th: "ลงทะเบียนรายวิชาแล้วตารางจะจัดกลุ่มตามวันและเวลาโดยอัตโนมัติ",
                en: "Register for courses and the schedule will group them by day and time automatically.",
                zh: "选课后，系统会自动按日期和时间整理课程表。",
              })}
            </p>
          </div>
        </div>
      ) : null}

      {registrations.length > 0 || timedMeetings.length > 0 ? (
        <div className={styles.scheduleContent} ref={gridRef}>
          <header className={styles.exportHeading}>
            <h2>{text({ th: "ตารางเรียนรายสัปดาห์", en: "Weekly schedule", zh: "每周课程表" })}</h2>
            <p>
              {text({
                th: `ภาคการศึกษา ${termLabel}`,
                en: `Term ${termLabel}`,
                zh: `学期 ${termLabel}`,
              })}
            </p>
          </header>
          <section
            className={styles.desktopFrame}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Named horizontal timetable requires keyboard scrolling.
            tabIndex={0}
            aria-label={text({
              th: "ตารางเรียนแบบรายสัปดาห์",
              en: "Weekly schedule",
              zh: "每周课程表",
            })}
          >
            <div
              className={styles.desktopSchedule}
              data-testid="schedule-grid"
              style={
                {
                  "--hour-count": hours.length,
                  "--compact-tracks": compactAxis.weights.map((weight) => `${weight}fr`).join(" "),
                  "--compact-grid-width": `${4.5 + compactAxis.total}rem`,
                } as CSSProperties
              }
            >
              <div className={styles.cornerLabel}>
                {text({ th: "วัน / เวลา", en: "Day / time", zh: "日期 / 时间" })}
              </div>
              <div className={styles.timeHeader} data-testid="schedule-time-axis">
                {hours.map((hour, index) => (
                  <span data-hour={hour} data-empty={compactAxis.weights[index] === 2.5} key={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
              {visibleDays.map((code) => (
                <Fragment key={code}>
                  <strong
                    className={styles.dayLabel}
                    data-empty={!timedMeetings.some(({ values }) => values.dayCode === code)}
                  >
                    {dayLabel(code)}
                  </strong>
                  <div
                    className={styles.dayCanvas}
                    data-testid="schedule-day-row"
                    data-day={code}
                    data-empty={!timedMeetings.some(({ values }) => values.dayCode === code)}
                    style={
                      {
                        "--day-lanes": Math.max(
                          1,
                          ...timedMeetings
                            .filter(({ values }) => values.dayCode === code)
                            .map((item) => positions.get(item.key)?.laneCount ?? 1),
                        ),
                      } as CSSProperties
                    }
                  >
                    <div className={styles.hourLines} aria-hidden="true">
                      {hours.map((hour) => (
                        <span key={hour} />
                      ))}
                    </div>
                    {timedMeetings
                      .filter(({ values }) => values.dayCode === code)
                      .map(({ registration, meeting, values, key, activity }) => {
                        if (values.startMinute === null || values.endMinute === null) return null
                        const visibleStart = Math.max(values.startMinute, startOfDay)
                        const visibleEnd = Math.min(values.endMinute, endOfDay)
                        if (visibleEnd <= visibleStart) return null
                        const left = ((visibleStart - startOfDay) / (endOfDay - startOfDay)) * 100
                        const width = ((visibleEnd - visibleStart) / (endOfDay - startOfDay)) * 100
                        const position = positions.get(key) ?? { lane: 0, laneCount: 1 }
                        const hasConflict = conflicts.has(key)
                        const style = {
                          ...(registration ? courseColors.styleFor(registration.courseCode) : {}),
                          "--left": `${String(left)}%`,
                          "--width": `${String(width)}%`,
                          "--compact-left": `${compactAxis.offset(visibleStart)}%`,
                          "--compact-width": `${compactAxis.offset(visibleEnd) - compactAxis.offset(visibleStart)}%`,
                          "--lane": position.lane,
                          "--lane-count": position.laneCount,
                        } as CSSProperties
                        if (activity)
                          return (
                            <article
                              key={key}
                              data-testid="schedule-activity-block"
                              data-conflict={hasConflict}
                              className={`${styles.classBlock} ${styles.activityBlock} ${hasConflict ? styles.conflict : ""}`}
                              style={style}
                              title={`${activity.title} · ${values.periodLabel}`}
                            >
                              {hasConflict ? (
                                <Chip color="danger" size="sm" variant="soft">
                                  <TriangleAlert size={13} aria-hidden="true" />
                                  {text({ th: "เวลาซ้อน", en: "Overlap", zh: "时间重叠" })}
                                </Chip>
                              ) : null}
                              <strong>{activity.title}</strong>
                              <span>
                                {text({
                                  th: "กิจกรรมส่วนตัว",
                                  en: "Personal activity",
                                  zh: "个人活动",
                                })}
                              </span>
                              <small>{values.periodLabel}</small>
                            </article>
                          )
                        if (!registration) return null
                        return (
                          <article
                            data-course-code={registration.courseCode}
                            data-testid="schedule-class-block"
                            data-conflict={hasConflict}
                            className={[styles.classBlock, hasConflict ? styles.conflict : ""].join(
                              " ",
                            )}
                            key={key}
                            title={`${registration.courseCode} ${courseName(registration.nameTh, registration.nameEn)} · ${sectionLabel(registration.sectionNo)} · ${values.periodLabel} · ${[meeting.building, meeting.room].filter(Boolean).join(" ") || "—"}`}
                            style={style}
                          >
                            {hasConflict ? (
                              <Chip
                                color="danger"
                                size="sm"
                                variant="soft"
                                className={[styles.conflictBadge, styles.classBlockConflictBadge]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                <TriangleAlert aria-hidden="true" size={13} />
                                {text({ th: "เวลาซ้อน", en: "Overlap", zh: "时间重叠" })}
                              </Chip>
                            ) : null}
                            <strong>{registration.courseCode}</strong>
                            <span className={styles.className}>
                              {registration.shortName?.trim() ||
                                courseName(registration.nameTh, registration.nameEn)}
                            </span>
                            <span className={styles.classRoom} data-testid="schedule-class-room">
                              {meeting.building?.trim() ? (
                                <span className={styles.classBuilding}>
                                  {meeting.building.trim()}
                                </span>
                              ) : null}
                              <span className={styles.classRoomNumber}>
                                {meeting.room?.trim()
                                  ? meeting.building?.trim()
                                    ? `· ${meeting.room.trim()}`
                                    : text({
                                        th: `ห้อง ${meeting.room}`,
                                        en: `Room ${meeting.room}`,
                                        zh: `教室 ${meeting.room}`,
                                      })
                                  : text({ th: "ห้อง —", en: "Room —", zh: "教室 —" })}
                              </span>
                            </span>
                            <small>{sectionLabel(registration.sectionNo)}</small>
                            <small>{values.periodLabel}</small>
                          </article>
                        )
                      })}
                  </div>
                </Fragment>
              ))}
            </div>
          </section>

          <section className={styles.courseSection} aria-labelledby="schedule-courses-heading">
            <header className={styles.courseSectionHeader}>
              <div>
                <h2 id="schedule-courses-heading">
                  {text({
                    th: "รายวิชาในตาราง",
                    en: "Courses in this schedule",
                    zh: "课程表中的课程",
                  })}
                </h2>
                <p data-schedule-export-omit>
                  {text({
                    th: "เลือกสีของแต่ละรายวิชา สีแดงสงวนไว้สำหรับเวลาซ้อน",
                    en: "Choose a color for each course. Red is reserved for overlaps.",
                    zh: "为每门课程选择颜色；红色用于时间冲突。",
                  })}
                </p>
              </div>
              <strong>
                {totalCredits} {text({ th: "หน่วยกิต", en: "credits", zh: "学分" })}
              </strong>
            </header>
            <div className={styles.courseCards}>
              {registrations.map((registration) => (
                <article
                  className={styles.courseCard}
                  data-conflict={conflictingCourses.has(registration.courseCode)}
                  data-course-code={registration.courseCode}
                  data-testid="schedule-course-card"
                  key={registration.registrationId}
                  style={courseColors.styleFor(registration.courseCode)}
                >
                  <span className={styles.courseColorBar} aria-hidden="true" />
                  <div className={styles.courseCardBody}>
                    <div className={styles.courseCardTitle}>
                      <div>
                        <strong>
                          {registration.courseCode}{" "}
                          {courseName(registration.nameTh, registration.nameEn)}
                        </strong>
                        <span>
                          {registration.credits} {text({ th: "หน่วยกิต", en: "credits", zh: "学分" })}{" "}
                          · {sectionLabel(registration.sectionNo)}
                        </span>
                      </div>
                      <div data-schedule-export-omit>
                        <CourseColorPicker
                          colorId={courseColors.colorIdFor(registration.courseCode)}
                          courseCode={registration.courseCode}
                          onChange={(colorId) =>
                            courseColors.save(registration.courseCode, colorId)
                          }
                          onReset={() => courseColors.reset(registration.courseCode)}
                          pending={courseColors.isPending(registration.courseCode)}
                        />
                      </div>
                    </div>
                    <div className={styles.courseMeetings}>
                      {registration.meetings.map((meeting, index) => {
                        const values = meetingValues(meeting, unspecifiedTime)
                        const teachers = Array.isArray(meeting.teachers)
                          ? meeting.teachers.join(", ")
                          : typeof meeting.teachers === "string"
                            ? meeting.teachers
                            : "—"
                        return (
                          <div key={meeting.id ?? index}>
                            <span>{teachers}</span>
                            <span>
                              {values.dayCode
                                ? dayLabel(values.dayCode as (typeof dayCodes)[number])
                                : "IA"}{" "}
                              {values.periodLabel}
                            </span>
                            <span>
                              {[meeting.building, meeting.room].filter(Boolean).join(" ") || "—"}
                            </span>
                            <span>{meeting.classType ?? meeting.class_type ?? "—"}</span>
                          </div>
                        )
                      })}
                    </div>
                    {conflictingCourses.has(registration.courseCode) ? (
                      <span className={styles.courseConflict}>
                        <TriangleAlert aria-hidden="true" size={14} />
                        {text({
                          th: "มีเวลาซ้อนกับรายวิชาหรือกิจกรรมอื่น",
                          en: "Overlaps another course or activity",
                          zh: "与其他课程或活动时间重叠",
                        })}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
