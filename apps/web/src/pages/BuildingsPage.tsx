import { Building2, Search } from "lucide-react"
import { useMemo, useState } from "react"
import buildings from "../data/buildings.json"
import { useI18n } from "../i18n"
import { Field } from "../components/ui"
import pageStyles from "./pages.module.css"
import styles from "./Buildings.module.css"

type Building = {
  id: string
  code: string
  nameTh: string
  nameEn: string
}

const directory = buildings as Building[]

export function BuildingsPage() {
  const { language, t } = useI18n()
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return directory
    return directory.filter((building) =>
      [building.code, building.nameTh, building.nameEn]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    )
  }, [query])

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBody}>
          <p className={pageStyles.context}>{t("buildings.context")}</p>
          <h1>{t("buildings.title")}</h1>
          <p>{t("buildings.subtitle")}</p>
        </div>
      </header>

      <section className={styles.workspace} data-testid="building-directory">
        <div className={styles.toolbar}>
          <div className={styles.searchHeading}>
            <Building2 aria-hidden="true" size={20} />
            <div>
              <strong>{t("buildings.title")}</strong>
              <span aria-live="polite" data-testid="building-count">
                {t("buildings.count", { count: filtered.length })}
              </span>
            </div>
          </div>
          <div className={styles.searchField}>
            <Field
              leadingIcon={<Search size={18} />}
              id="building-query"
              label={t("buildings.search")}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("buildings.search")}
              value={query}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className={styles.empty}>{t("buildings.empty")}</p>
        ) : (
          <ul className={styles.list}>
            {filtered.map((building) => {
              const primary =
                language === "th"
                  ? building.nameTh || building.nameEn
                  : building.nameEn || building.nameTh
              const secondary = language === "th" ? building.nameEn : building.nameTh
              return (
                <li className={styles.item} key={building.id}>
                  <span className={styles.code}>{building.code}</span>
                  <span className={styles.names}>
                    <strong>{primary}</strong>
                    {secondary && secondary !== primary ? <small>{secondary}</small> : null}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <p className={styles.source}>{t("buildings.source")}</p>
      </section>
    </div>
  )
}
