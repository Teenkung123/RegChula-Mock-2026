import { Clock3, CalendarDays } from "lucide-react"
import { NavLink } from "react-router"
import { useI18n } from "../i18n"
import styles from "./PlanViewTabs.module.css"

export function PlanViewTabs({ active }: { active: "schedule" | "exams" }) {
  const { text } = useI18n()
  const items = [
    {
      id: "schedule",
      to: "/schedule",
      icon: <CalendarDays aria-hidden="true" size={16} />,
      label: text({ th: "ตารางเรียน", en: "Class schedule", zh: "课程表" }),
    },
    {
      id: "exams",
      to: "/exams",
      icon: <Clock3 aria-hidden="true" size={16} />,
      label: text({ th: "ตารางสอบ", en: "Exam schedule", zh: "考试安排" }),
    },
  ] as const
  return (
    <nav
      className={styles.tabs}
      aria-label={text({ th: "มุมมองแผนการเรียน", en: "Planning views", zh: "学习计划视图" })}
    >
      {items.map((item) => (
        <NavLink
          {...(active === item.id ? { "aria-current": "page" as const } : {})}
          className={active === item.id ? (styles.active ?? "") : ""}
          key={item.id}
          to={item.to}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
