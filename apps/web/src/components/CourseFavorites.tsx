import { Spinner, ToggleButton } from "@heroui/react"
import { Heart } from "lucide-react"
import type { useFavorites } from "../lib/personal-planning"
import { useI18n } from "../i18n"
import { Button, Status } from "./ui"
import styles from "./PersonalPlanning.module.css"

type Favorites = ReturnType<typeof useFavorites>

export function FavoriteButton({
  courseCode,
  favorites,
}: {
  courseCode: string
  favorites: Favorites
}) {
  const { text } = useI18n()
  const selected = favorites.codes.has(courseCode)
  const label = selected
    ? text({ th: "เลิกถูกใจ", en: "Remove favorite", zh: "取消收藏" })
    : text({ th: "ถูกใจ", en: "Favorite", zh: "收藏" })
  const pending =
    favorites.mutation.isPending && favorites.mutation.variables?.courseCode === courseCode
  return (
    <span title={`${label} ${courseCode}`} className={styles.favoriteControl}>
      <ToggleButton
        aria-label={`${label} ${courseCode}`}
        isSelected={selected}
        isDisabled={!favorites.isSuccess || favorites.mutation.isPending}
        aria-busy={pending}
        onChange={(favorite) => favorites.mutation.mutate({ courseCode, favorite })}
        isIconOnly
        variant="ghost"
        className={styles.favoriteToggle ?? ""}
      >
        {pending ? (
          <Spinner size="sm" aria-hidden="true" />
        ) : (
          <Heart size={20} aria-hidden="true" fill={selected ? "currentColor" : "none"} />
        )}
      </ToggleButton>
    </span>
  )
}

export function CourseFavorites({
  favorites,
  onOpen,
}: {
  favorites: Favorites
  onOpen: (code: string, trigger: HTMLButtonElement) => void
}) {
  const { text, language } = useI18n()
  return (
    <section
      className={styles.panel}
      aria-label={text({ th: "รายวิชาที่ถูกใจ", en: "Favorite courses", zh: "收藏课程" })}
    >
      <div>
        <h2>
          {text({ th: "รายวิชาที่ถูกใจ", en: "Favorite courses", zh: "收藏课程" })}{" "}
          {favorites.data ? `(${favorites.data.length})` : ""}
        </h2>
        <p>
          {text({
            th: "เก็บไว้ทุกภาคการศึกษา • สถานะตามภาคที่เลือก",
            en: "Saved across terms • Availability for the selected term",
            zh: "跨学期保存 • 显示所选学期的开课状态",
          })}
        </p>
      </div>
      {favorites.isError || favorites.mutation.isError ? (
        <Status tone="error">
          {text({
            th: "โหลดหรือบันทึกรายวิชาที่ถูกใจไม่ได้ ลองอีกครั้ง",
            en: "Could not load or save favorites. Try again.",
            zh: "无法加载或保存收藏，请重试。",
          })}
          <Button
            onClick={() => {
              favorites.mutation.reset()
              void favorites.refetch()
            }}
          >
            {text({ th: "ลองอีกครั้ง", en: "Retry", zh: "重试" })}
          </Button>
        </Status>
      ) : null}
      {favorites.isPending ? (
        <p role="status">
          {text({ th: "กำลังโหลดรายการที่ถูกใจ", en: "Loading favorites", zh: "正在加载收藏" })}
        </p>
      ) : null}
      {favorites.data?.length === 0 ? (
        <p>
          {text({
            th: "กดหัวใจที่รายวิชาเพื่อเก็บไว้ที่นี่",
            en: "Use the heart beside a course to save it here.",
            zh: "点击课程旁的爱心即可收藏。",
          })}
        </p>
      ) : null}
      <div className={styles.favoriteList}>
        {favorites.data?.map((course) => (
          <div key={course.courseCode} className={styles.row}>
            <div>
              <strong>
                {course.courseCode} {language === "th" ? course.nameTh : course.nameEn}
              </strong>
              <span data-offered={course.offered}>
                {course.offered
                  ? text({ th: "เปิดสอนภาคนี้", en: "Offered this term", zh: "本学期开课" })
                  : text({ th: "ไม่เปิดสอนภาคนี้", en: "Not offered this term", zh: "本学期未开课" })}
              </span>
            </div>
            <div className={styles.actions}>
              {course.offered ? (
                <Button
                  onClick={(event) =>
                    onOpen(course.courseCode, event.currentTarget as HTMLButtonElement)
                  }
                  variant="outline"
                >
                  {text({ th: "ดูรายละเอียด", en: "View details", zh: "查看详情" })}
                </Button>
              ) : null}
              <FavoriteButton courseCode={course.courseCode} favorites={favorites} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
