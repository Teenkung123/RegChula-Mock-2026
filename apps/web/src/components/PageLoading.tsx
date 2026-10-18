import { Skeleton, Spinner } from "@heroui/react"
import { useI18n } from "../i18n"
import styles from "./PageLoading.module.css"

export function PageLoading({ fullPage = false, label }: { fullPage?: boolean; label?: string }) {
  const { text } = useI18n()
  return (
    <div
      className={`${styles.loading} ${fullPage ? styles.fullPage : ""}`}
      aria-busy="true"
      data-testid="page-loading"
    >
      <div className={styles.content}>
        <div className={styles.heading} role="status" aria-live="polite">
          <Spinner size="lg" aria-hidden="true" />
          <div>
            {fullPage ? <strong>RegChula</strong> : null}
            <p>
              {label ??
                text({
                  th: "กำลังเตรียมหน้าของคุณ",
                  en: "Getting your page ready",
                  zh: "正在准备您的页面",
                })}
            </p>
          </div>
        </div>
        <div className={styles.preview} aria-hidden="true">
          <Skeleton className={styles.title ?? ""} />
          <Skeleton className={styles.line ?? ""} />
          <div className={styles.cards}>
            <Skeleton className={styles.card ?? ""} />
            <Skeleton className={styles.card ?? ""} />
            <Skeleton className={styles.card ?? ""} />
          </div>
        </div>
      </div>
    </div>
  )
}
