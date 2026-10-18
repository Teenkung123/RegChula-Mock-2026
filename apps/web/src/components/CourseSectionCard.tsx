import { Chip, ProgressBar } from "@heroui/react"
import type { SectionDto } from "@regchula/api/public-types"
import { CalendarDays, MapPin, Users } from "lucide-react"
import { useI18n } from "../i18n"
import styles from "./CourseSectionCard.module.css"

export function CourseSectionCard({ section }: { section: SectionDto }) {
  const { language, text } = useI18n()
  const available = section.active && !section.closed && section.remainingSeats > 0
  const occupied = section.baselineEnrolled + section.localActive
  const days: Record<string, string> = {
    MO: text({ th: "จันทร์", en: "Monday", zh: "星期一" }),
    TU: text({ th: "อังคาร", en: "Tuesday", zh: "星期二" }),
    WE: text({ th: "พุธ", en: "Wednesday", zh: "星期三" }),
    TH: text({ th: "พฤหัสบดี", en: "Thursday", zh: "星期四" }),
    FR: text({ th: "ศุกร์", en: "Friday", zh: "星期五" }),
    SA: text({ th: "เสาร์", en: "Saturday", zh: "星期六" }),
    SU: text({ th: "อาทิตย์", en: "Sunday", zh: "星期日" }),
  }
  const sectionLabel = text({
    th: `ตอน ${section.sectionNo}`,
    en: `Section ${section.sectionNo}`,
    zh: `第 ${section.sectionNo} 班`,
  })
  return (
    <article className={styles.card} data-testid="course-section-card" aria-label={sectionLabel}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <h4>{sectionLabel}</h4>
          {section.note ? <p>{section.note}</p> : null}
        </div>
        <div className={styles.availability}>
          <Chip color={available ? "success" : "danger"} size="sm" variant="soft">
            {available
              ? text({
                  th: `เหลือ ${section.remainingSeats} ที่นั่ง`,
                  en: `${section.remainingSeats} seats left`,
                  zh: `剩余 ${section.remainingSeats} 个名额`,
                })
              : section.closed || !section.active
                ? text({ th: "ปิดตอนเรียน", en: "Section closed", zh: "班次已关闭" })
                : text({ th: "เต็ม", en: "Full", zh: "已满" })}
          </Chip>
          <span>
            {text({
              th: `ลงทะเบียน ${occupied} / ${section.capacity} ที่นั่ง`,
              en: `Enrolled ${occupied} / ${section.capacity} seats`,
              zh: `已选 ${occupied} / ${section.capacity} 个名额`,
            })}
          </span>
          <ProgressBar
            aria-label={text({
              th: `ที่นั่งที่ใช้ใน${sectionLabel}`,
              en: `Occupied seats in ${sectionLabel}`,
              zh: `${sectionLabel} 已占名额`,
            })}
            className={styles.meter ?? ""}
            maxValue={Math.max(section.capacity, 1)}
            value={Math.min(occupied, section.capacity)}
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        </div>
      </header>
      <div className={styles.meetings}>
        {section.meetings.length === 0 ? (
          <p className={styles.empty}>
            {text({
              th: "ยังไม่ระบุเวลาเรียน",
              en: "Meeting times not specified",
              zh: "未注明上课时间",
            })}
          </p>
        ) : null}
        {section.meetings.map((meeting, index) => {
          const day = meeting.dayCode ?? meeting.day_code
          const period =
            meeting.periodLabel ??
            meeting.period_label ??
            text({ th: "ไม่ระบุเวลา", en: "Time not specified", zh: "未注明时间" })
          const location = [meeting.building, meeting.room].filter(Boolean).join(" · ")
          const instructors = Array.isArray(meeting.teachers)
            ? meeting.teachers.join(", ")
            : meeting.teachers
          return (
            <div
              className={styles.meeting}
              key={meeting.id ?? index}
              data-testid="course-section-meeting"
            >
              <div className={styles.when}>
                <CalendarDays size={16} aria-hidden="true" />
                <div>
                  <strong>
                    {day
                      ? (days[day] ?? day)
                      : text({ th: "นัดหมาย", en: "Arranged", zh: "另行安排" })}{" "}
                    <span>{period}</span>
                  </strong>
                  <span className={styles.type}>
                    {meeting.classType ?? meeting.class_type ?? "—"}
                  </span>
                </div>
              </div>
              <div className={styles.detail}>
                <MapPin size={15} aria-hidden="true" />
                <span>
                  <small>{text({ th: "สถานที่", en: "Location", zh: "地点" })}</small>
                  {location || "—"}
                </span>
              </div>
              <div className={styles.detail}>
                <Users size={15} aria-hidden="true" />
                <span>
                  <small>{text({ th: "ผู้สอน", en: "Instructors", zh: "教师" })}</small>
                  <span lang={language === "th" ? "th" : undefined}>{instructors || "—"}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </article>
  )
}
