import { ComboBox, Input, ListBox } from "@heroui/react"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { useI18n } from "../i18n"
import { getCourses } from "../lib/api"
import { courseSearchText } from "../lib/course-label"
import { Button } from "./ui"
import styles from "./QuickCourseSearch.module.css"

export function QuickCourseSearch({ onNavigate }: { onNavigate: () => void }) {
  const { t, text, courseName, courseSecondaryName } = useI18n()
  const navigate = useNavigate()
  const [input, setInput] = useState("")
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [query, setQuery] = useState("")
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [input])
  const courses = useQuery({
    queryKey: ["quick-course-search", query],
    queryFn: ({ signal }) => getCourses({ q: query, pageSize: 6, mode: "autocomplete" }, signal),
    staleTime: 30_000,
    retry: 1,
  })
  const waiting = courses.isFetching || query !== input.trim()
  const options = query === input.trim() ? (courses.data?.data ?? []) : []
  const openSearch = (value: string, advanced = false) => {
    const params = new URLSearchParams()
    if (value.trim()) params.set("q", value.trim())
    if (advanced) params.set("advanced", "1")
    onNavigate()
    navigate("/search" + (params.size ? "?" + params : ""))
  }
  const actions = (
    <div className={styles.actions}>
      <Button variant="quiet" type="button" onClick={() => openSearch(input, true)}>
        <SlidersHorizontal aria-hidden="true" size={16} />
        {t("shell.advancedSearch")}
      </Button>
      <Button variant="primary" type="button" onClick={() => openSearch(input)}>
        {t("common.search")}
      </Button>
    </div>
  )
  return (
    <div className={styles.content}>
      <ComboBox
        aria-label={t("shell.searchPrompt")}
        allowsEmptyCollection
        allowsCustomValue
        defaultFilter={() => true}
        inputValue={input}
        onInputChange={setInput}
        selectedKey={null}
        onOpenChange={setSuggestionsOpen}
        menuTrigger="input"
        onSelectionChange={(key) => {
          if (key !== null) openSearch(String(key))
        }}
      >
        <ComboBox.InputGroup className={styles.control ?? ""} data-inline-control="quick-search">
          <Search aria-hidden="true" size={17} />
          <Input
            autoFocus
            aria-label={t("shell.searchPrompt")}
            placeholder={t("shell.searchHint")}
            className={styles.input ?? ""}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.currentTarget.getAttribute("aria-activedescendant")
              ) {
                event.preventDefault()
                openSearch(input)
              }
            }}
          />
          <ComboBox.Trigger
            aria-label={text({
              th: "แสดงรายวิชาแนะนำ",
              en: "Show course suggestions",
              zh: "显示课程建议",
            })}
            className={styles.trigger ?? ""}
          >
            <ChevronDown aria-hidden="true" size={16} />
          </ComboBox.Trigger>
        </ComboBox.InputGroup>
        <ComboBox.Popover className={styles.suggestions ?? ""} placement="bottom start">
          <ListBox
            aria-label={text({ th: "รายวิชาแนะนำ", en: "Suggested courses", zh: "建议课程" })}
            renderEmptyState={() =>
              text(
                courses.isError
                  ? {
                      th: "ค้นหาไม่ได้ ลองอีกครั้ง",
                      en: "Search unavailable. Try again.",
                      zh: "搜索不可用，请重试。",
                    }
                  : waiting
                    ? { th: "กำลังค้นหา", en: "Searching", zh: "正在搜索" }
                    : { th: "ไม่พบรายวิชาที่ตรงกัน", en: "No matching courses", zh: "没有匹配的课程" },
              )
            }
          >
            {options.map((course) => (
              <ListBox.Item
                id={course.courseCode}
                key={course.courseCode}
                textValue={courseSearchText(course)}
                className={styles.option ?? ""}
              >
                <span className={styles.code}>{course.courseCode}</span>
                <span className={styles.names}>
                  <strong>{courseName(course)}</strong>
                  <small>{courseSecondaryName(course)}</small>
                </span>
              </ListBox.Item>
            ))}
          </ListBox>
          {actions}
        </ComboBox.Popover>
      </ComboBox>
      {!suggestionsOpen && actions}
      {courses.isError ? (
        <p role="status" className={styles.error}>
          {text({
            th: "ค้นหารายวิชาไม่ได้ ลองพิมพ์ใหม่อีกครั้ง",
            en: "Course search is unavailable. Try again.",
            zh: "课程搜索不可用，请重试。",
          })}
        </p>
      ) : null}
    </div>
  )
}
