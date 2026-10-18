import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { Link } from "react-router"
import { NextClassCard } from "../components/NextClassCard"
import { Status } from "../components/ui"
import { useI18n } from "../i18n"
import { getAnnouncements, getRegistrations } from "../lib/api"
import styles from "./pages.module.css"

export function DashboardPage() {
  const { t, text } = useI18n()
  const registrations = useQuery({
    queryKey: ["registrations"],
    queryFn: getRegistrations,
  })
  const announcements = useQuery({
    queryKey: ["announcements"],
    queryFn: getAnnouncements,
  })
  const active =
    registrations.data?.registrations.filter((registration) => registration.status === "active") ??
    []
  const credits = active.reduce((total, registration) => total + registration.credits, 0)
  const term = registrations.data?.term
  const termLabel = term
    ? `${String(term.academicYear)}/${String(term.semester)}`
    : t("common.currentTerm")
  const remainingCredits = Math.max(21 - credits, 0)
  const creditsLabel = (value: number) =>
    text({
      th: `${value} หน่วยกิต`,
      en: `${value} credits`,
      zh: `${value} 学分`,
    })

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerBody}>
          <p className={styles.context}>
            {text({
              th: `ภาคการศึกษา ${termLabel}`,
              en: `Term ${termLabel}`,
              zh: `学期 ${termLabel}`,
            })}
          </p>
          <h1>{text({ th: "ภาพรวมของคุณ", en: "Your overview", zh: "个人概览" })}</h1>
          <p>
            {text({
              th: "วิชาถัดไป สรุปหน่วยกิต และข่าวสารในภาคการศึกษานี้",
              en: "Your next class, credit summary, and news for this term.",
              zh: "查看下一节课、本学期学分摘要和公告。",
            })}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.primaryAction} to="/register">
            <Search aria-hidden="true" size={17} />
            {text({ th: "ลงทะเบียนรายวิชา", en: "Register courses", zh: "选课" })}
          </Link>
        </div>
      </header>

      {registrations.isError ? (
        <Status tone="error">
          {text({
            th: "โหลดข้อมูลการลงทะเบียนไม่ได้ ลองรีเฟรชหน้าอีกครั้ง",
            en: "Could not load registrations. Refresh the page and try again.",
            zh: "无法加载选课信息。请刷新页面后重试。",
          })}
        </Status>
      ) : null}

      <div className={styles.dashboardGrid}>
        <NextClassCard
          registrations={active}
          loading={registrations.isPending}
          failed={registrations.isError}
        />
        <section
          className={styles.stats}
          aria-label={text({ th: "สรุปการลงทะเบียน", en: "Registration summary", zh: "选课摘要" })}
        >
          <div className={styles.stat}>
            <span>{text({ th: "รายวิชาที่ลงทะเบียน", en: "Registered courses", zh: "已选课程" })}</span>
            <strong>{active.length}</strong>
            <small>
              {text({ th: "รายการที่มีสถานะใช้งาน", en: "Active registrations", zh: "有效选课记录" })}
            </small>
          </div>
          <div className={styles.stat}>
            <span>{text({ th: "หน่วยกิตในภาคนี้", en: "Credits this term", zh: "本学期学分" })}</span>
            <strong>
              {credits}
              <small>/ 21</small>
            </strong>
            <small>
              {text({
                th: `เหลือ ${creditsLabel(remainingCredits)} ก่อนถึงเกณฑ์`,
                en: `${creditsLabel(remainingCredits)} remain before the limit`,
                zh: `距离上限还剩 ${creditsLabel(remainingCredits)}`,
              })}
            </small>
          </div>
          <div className={styles.stat}>
            <span>{text({ th: "ภาคการศึกษาปัจจุบัน", en: "Current term", zh: "当前学期" })}</span>
            <strong>{term ? termLabel : "—"}</strong>
            <small>
              {term
                ? text({
                    th: "ภาคปัจจุบันสำหรับตารางเรียน",
                    en: "Current term used for your timetable.",
                    zh: "课程表使用的当前学期。",
                  })
                : text({
                    th: "กำลังโหลดข้อมูลภาคการศึกษา",
                    en: "Loading term information",
                    zh: "正在加载学期信息",
                  })}
            </small>
          </div>
        </section>

        <aside
          className={[styles.panel, styles.secondaryPanel].join(" ")}
          aria-labelledby="announcements-heading"
        >
          <header className={styles.panelHeader}>
            <div>
              <h2 id="announcements-heading">
                {text({ th: "ประกาศ", en: "Announcements", zh: "公告" })}
              </h2>
              <p>
                {text({
                  th: "ข้อมูลสำหรับการใช้งานระบบตัวอย่าง",
                  en: "Information for using this demo system",
                  zh: "演示系统使用信息",
                })}
              </p>
            </div>
          </header>
          {announcements.isError ? (
            <Status tone="warning">
              {text({
                th: "โหลดประกาศไม่ได้ ลองรีเฟรชหน้าอีกครั้ง",
                en: "Could not load announcements. Refresh the page and try again.",
                zh: "无法加载公告。请刷新页面后重试。",
              })}
            </Status>
          ) : null}
          {announcements.isPending ? (
            <p className={styles.muted}>
              {text({ th: "กำลังโหลดประกาศ", en: "Loading announcements", zh: "正在加载公告" })}
            </p>
          ) : null}
          {!announcements.isPending && !announcements.isError ? (
            <div className={styles.announcementList}>
              {(announcements.data ?? []).length === 0 ? (
                <p className={styles.muted}>
                  {text({
                    th: "ไม่มีประกาศในขณะนี้",
                    en: "No announcements right now",
                    zh: "目前没有公告",
                  })}
                </p>
              ) : (
                announcements.data?.map((announcement) => (
                  <article className={styles.announcement} key={announcement.id}>
                    <h3>{announcement.title}</h3>
                    <p>{announcement.body}</p>
                  </article>
                ))
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
