import type { RegistrationDto } from "@regchula/api/public-types"
import { ArrowDownRight, CalendarDays, Clock3, MapPin } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { useI18n } from "../i18n"
import { nextClass } from "../lib/next-class"
import styles from "./NextClassCard.module.css"
import pageStyles from "../pages/pages.module.css"

export function NextClassCard({
  registrations,
  loading,
  failed,
}: {
  registrations: RegistrationDto[]
  loading: boolean
  failed: boolean
}) {
  const { text, locale, courseName } = useI18n()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      setNow(new Date())
      timer = setTimeout(tick, 60000 - (Date.now() % 60000))
    }
    const resume = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer)
        tick()
      }
    }
    tick()
    document.addEventListener("visibilitychange", resume)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", resume)
    }
  }, [])
  const next = nextClass(registrations, now)
  const following = next?.following
  const followingMinutes = following
    ? Math.max(1, Math.ceil((following.startsAt - now.getTime()) / 60000))
    : 0
  const followingUnit =
    followingMinutes >= 1440 ? "day" : followingMinutes >= 60 ? "hour" : "minute"
  const followingDistance = Math.ceil(
    followingMinutes / (followingUnit === "day" ? 1440 : followingUnit === "hour" ? 60 : 1),
  )
  const approachingEnd = Boolean(next?.inProgress && next.endsAt - now.getTime() <= 20 * 60000)
  const title = next?.inProgress
    ? text({ th: "กำลังเรียน", en: "Class in progress", zh: "正在上课" })
    : text({ th: "วิชาถัดไป", en: "Next class", zh: "下一节课" })
  const minutes = next
    ? Math.max(
        0,
        Math.ceil(((next.inProgress ? next.endsAt : next.startsAt) - now.getTime()) / 60000),
      )
    : 0
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainder = minutes % 60
  const duration = [
    days ? text({ th: `${days} วัน`, en: `${days}d`, zh: `${days}天` }) : "",
    hours ? text({ th: `${hours} ชม.`, en: `${hours}h`, zh: `${hours}小时` }) : "",
    !days && (!hours || remainder)
      ? text({ th: `${remainder} นาที`, en: `${remainder}m`, zh: `${remainder}分钟` })
      : "",
  ]
    .filter(Boolean)
    .join(" ")
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "numeric",
    month: "short",
  })
  return (
    <section
      className={pageStyles.panel}
      aria-labelledby="next-class-heading"
      data-testid="next-class-card"
    >
      <header className={styles.header}>
        <div>
          <h2 id="next-class-heading">{title}</h2>
          <p>
            {text({
              th: "ตารางประจำสัปดาห์ · เวลาไทย",
              en: "Weekly schedule · Bangkok time",
              zh: "每周课程表 · 曼谷时间",
            })}
          </p>
        </div>
        <Clock3 size={20} aria-hidden="true" />
      </header>
      {loading ? (
        <p role="status">
          {text({ th: "กำลังดูตารางของคุณ", en: "Loading your schedule", zh: "正在加载课程表" })}
        </p>
      ) : failed ? (
        <p>
          {text({
            th: "ยังแสดงวิชาถัดไปไม่ได้ โปรดลองโหลดข้อมูลอีกครั้ง",
            en: "The next class is unavailable. Try reloading your registrations.",
            zh: "无法显示下一节课，请重新加载选课信息。",
          })}
        </p>
      ) : next ? (
        <>
          <div className={styles.countdown} data-testid="next-class-countdown">
            <span>
              {next.inProgress
                ? text({ th: "จบในอีก", en: "Ends in", zh: "距离结束" })
                : text({ th: "เริ่มในอีก", en: "Starts in", zh: "距离开始" })}
            </span>
            <strong>{duration}</strong>
          </div>
          <div className={styles.course} data-testid="next-class-course">
            <span>
              {next.registration.courseCode} ·{" "}
              {text({
                th: `ตอน ${next.registration.sectionNo}`,
                en: `Section ${next.registration.sectionNo}`,
                zh: `第 ${next.registration.sectionNo} 班`,
              })}
            </span>
            <h3>{courseName(next.registration)}</h3>
          </div>
          <div className={styles.details}>
            <div>
              <CalendarDays size={17} aria-hidden="true" />
              <span>
                {date.format(next.startsAt)} · {time.format(next.startsAt)}–
                {time.format(next.endsAt)}
              </span>
            </div>
            <div>
              <MapPin size={17} aria-hidden="true" />
              <span>
                {[next.meeting.building, next.meeting.room].filter(Boolean).join(" · ") ||
                  text({ th: "ยังไม่ระบุสถานที่", en: "Location not specified", zh: "地点未注明" })}
              </span>
            </div>
          </div>
          {following && next.inProgress ? (
            <div className={styles.journey}>
              <progress
                className={styles.progress}
                aria-label={text({
                  th: "เวลาที่ผ่านไปของวิชาปัจจุบัน",
                  en: "Current class elapsed time",
                  zh: "当前课程已过时间",
                })}
                max={100}
                value={Math.min(
                  100,
                  Math.max(
                    0,
                    ((now.getTime() - next.startsAt) / (next.endsAt - next.startsAt)) * 100,
                  ),
                )}
              />
              <section
                className={styles.upNext}
                data-prominent={approachingEnd}
                data-testid="up-next-preview"
                aria-labelledby="up-next-heading"
              >
                <div className={styles.destination}>
                  <ArrowDownRight size={18} aria-hidden="true" />
                  <h3 id="up-next-heading">
                    {text({ th: "วิชาต่อไป", en: "Up next", zh: "接下来" })}
                  </h3>
                  <span>
                    {new Intl.RelativeTimeFormat(locale, {
                      numeric: "always",
                      style: "short",
                    }).format(followingDistance, followingUnit)}
                  </span>
                </div>
                <div className={styles.course}>
                  <span>
                    {following.registration.courseCode} ·{" "}
                    {text({
                      th: `ตอน ${following.registration.sectionNo}`,
                      en: `Section ${following.registration.sectionNo}`,
                      zh: `第 ${following.registration.sectionNo} 班`,
                    })}
                  </span>
                  <strong className={styles.upNextName}>
                    {courseName(following.registration)}
                  </strong>
                </div>
                <div className={styles.details}>
                  <div>
                    <CalendarDays size={16} aria-hidden="true" />
                    <span>
                      {date.format(following.startsAt)} · {time.format(following.startsAt)}–
                      {time.format(following.endsAt)}
                    </span>
                  </div>
                  <div>
                    <MapPin size={16} aria-hidden="true" />
                    <span>
                      {[following.meeting.building, following.meeting.room]
                        .filter(Boolean)
                        .join(" · ") ||
                        text({
                          th: "ยังไม่ระบุสถานที่",
                          en: "Location not specified",
                          zh: "地点未注明",
                        })}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
          {next.overlappingCourses > 0 ? (
            <p className={styles.overlap}>
              {text({
                th: `มีอีก ${next.overlappingCourses} รายวิชาในช่วงเวลาเดียวกัน ตรวจสอบตารางเรียน`,
                en: `${next.overlappingCourses} other course(s) overlap this class. Check your timetable.`,
                zh: `另有 ${next.overlappingCourses} 门课程时间重叠，请查看课程表。`,
              })}
            </p>
          ) : null}
        </>
      ) : (
        <div className={styles.empty}>
          <CalendarDays size={28} aria-hidden="true" />
          <h3>
            {registrations.length
              ? text({
                  th: "ยังไม่มีเวลาเรียนที่ระบุไว้",
                  en: "No scheduled class times",
                  zh: "尚未注明上课时间",
                })
              : text({
                  th: "ตารางใหม่เริ่มได้ที่นี่",
                  en: "Your schedule starts here",
                  zh: "从这里开始创建课程表",
                })}
          </h3>
          <p>
            {registrations.length
              ? text({
                  th: "รายวิชาของคุณยังไม่ระบุวันหรือเวลาเรียน ดูรายละเอียดเพิ่มเติมในตารางเรียน",
                  en: "Your courses do not yet have scheduled meeting times. Check the timetable for details.",
                  zh: "课程尚未注明日期或时间，请查看课程表。",
                })
              : text({
                  th: "เลือกรายวิชาแล้วกลับมาดูวิชาถัดไปของคุณได้ที่นี่",
                  en: "Register for courses, then see what is coming up here.",
                  zh: "选课后，即可在这里查看下一节课。",
                })}
          </p>
        </div>
      )}
      <div className={styles.actions}>
        <Link
          className={pageStyles.sectionLink}
          to={registrations.length ? "/schedule" : "/register"}
        >
          <CalendarDays size={17} aria-hidden="true" />
          {registrations.length
            ? text({ th: "ดูตารางทั้งหมด", en: "Full timetable", zh: "完整课程表" })
            : text({ th: "เริ่มลงทะเบียน", en: "Start registration", zh: "开始选课" })}
        </Link>
      </div>
    </section>
  )
}
