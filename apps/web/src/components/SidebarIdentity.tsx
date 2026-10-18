import type { MeDto } from "@regchula/api/public-types"
import { useEffect, useMemo, useState } from "react"
import { useI18n } from "../i18n"
import styles from "./SidebarIdentity.module.css"

export function SidebarIdentity({ studentId }: Pick<MeDto, "studentId">) {
  const { language, locale, text } = useI18n()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const sync = () => {
      setNow(new Date())
      timer = setTimeout(sync, 60_000 - (Date.now() % 60_000))
    }
    const resume = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer)
        sync()
      }
    }
    sync()
    document.addEventListener("visibilitychange", resume)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", resume)
    }
  }, [])
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone: "Asia/Bangkok",
        calendar: language === "th" ? "buddhist" : "gregory",
        numberingSystem: "latn",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    [language, locale],
  )
  const parts = formatter.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? ""
  const date =
    language === "th"
      ? `วันที่ ${part("day")} ${part("month")}${part("year")} ${part("hour")}:${part("minute")}`
      : formatter.format(now)
  const unavailable = text({ th: "ไม่มีข้อมูล", en: "Unavailable", zh: "暂无数据" })
  // MeDto exposes only studentId as identity data. Never derive a profile from it.
  const details = [
    [
      text({ th: "รหัสนิสิต", en: "Student ID", zh: "学号" }),
      studentId.trim() ? studentId : unavailable,
    ],
    [text({ th: "ชื่อ", en: "Name", zh: "姓名" }), unavailable],
    [text({ th: "ภาควิชา", en: "Department", zh: "系" }), unavailable],
    [text({ th: "คณะ", en: "Faculty", zh: "学院" }), unavailable],
    [text({ th: "แผนการศึกษา", en: "Study plan", zh: "学习计划" }), unavailable],
  ]
  return (
    <section
      className={styles.identity}
      aria-label={text({ th: "ข้อมูลนิสิต", en: "Student details", zh: "学生信息" })}
    >
      <time
        className={styles.clock}
        dateTime={now.toISOString()}
        title={text({ th: "เวลาประเทศไทย (กรุงเทพฯ)", en: "Bangkok time", zh: "曼谷时间" })}
      >
        {date}
      </time>
      <dl className={styles.details}>
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
