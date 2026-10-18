import { ChevronDown, Landmark, Search } from "lucide-react"
import { useMemo, useState } from "react"
import faculties from "../data/faculties.json"
import { useI18n } from "../i18n"
import { Field } from "../components/ui"
import pageStyles from "./pages.module.css"
import styles from "./Faculties.module.css"

type DirectoryNode = {
  id: string
  code: string
  nameTh: string
  nameEn: string
  level: "faculty" | "department" | "field"
  children: DirectoryNode[]
}

const directory: DirectoryNode[] = faculties.map((faculty) => ({
  ...faculty,
  level: "faculty",
  children: faculty.departments.map((department) => ({
    ...department,
    level: "department",
    children: department.fields.map((field) => ({ ...field, level: "field", children: [] })),
  })),
}))

function filterDirectory(nodes: DirectoryNode[], needle: string): DirectoryNode[] {
  if (!needle) return nodes
  return nodes.flatMap((node) => {
    if ([node.code, node.nameTh, node.nameEn].join(" ").toLocaleLowerCase().includes(needle))
      return [node]
    const children = filterDirectory(node.children, needle)
    return children.length ? [{ ...node, children }] : []
  })
}

function DirectoryBranch({ node, searching }: { node: DirectoryNode; searching: boolean }) {
  const { language, t } = useI18n()
  const primary = language === "th" ? node.nameTh || node.nameEn : node.nameEn || node.nameTh
  const secondary = language === "th" ? node.nameEn : node.nameTh
  const expandable = node.children.length > 0
  const row = (
    <>
      <span className={styles.code}>{node.code}</span>
      <span className={styles.names}>
        <strong>{primary}</strong>
        {secondary && secondary !== primary ? <small>{secondary}</small> : null}
      </span>
      {expandable ? (
        <>
          <span className={styles.childCount}>
            {t(node.level === "faculty" ? "faculties.departments" : "faculties.fields", {
              count: node.children.length,
            })}
          </span>
          <ChevronDown aria-hidden="true" size={16} />
        </>
      ) : null}
    </>
  )
  return (
    <li className={styles.branch} data-level={node.level} data-code={node.code}>
      {expandable ? (
        <details open={searching ? true : undefined}>
          <summary className={styles.nodeRow}>{row}</summary>
          <ul className={styles.children}>
            {node.children.map((child) => (
              <DirectoryBranch key={child.id} node={child} searching={searching} />
            ))}
          </ul>
        </details>
      ) : (
        <div className={styles.nodeRow}>{row}</div>
      )}
    </li>
  )
}

export function FacultiesPage() {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const needle = query.trim().toLocaleLowerCase()
  const filtered = useMemo(() => filterDirectory(directory, needle), [needle])
  const departments = filtered.flatMap((faculty) => faculty.children)
  const fieldCount = departments.reduce(
    (count, department) => count + department.children.length,
    0,
  )

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBody}>
          <p className={pageStyles.context}>{t("faculties.context")}</p>
          <h1>{t("faculties.title")}</h1>
          <p>{t("faculties.subtitle")}</p>
        </div>
      </header>
      <section className={styles.workspace} data-testid="faculty-directory">
        <div className={styles.toolbar}>
          <div className={styles.searchHeading}>
            <Landmark aria-hidden="true" size={20} />
            <div>
              <strong>{t("faculties.title")}</strong>
              <span aria-live="polite" data-testid="faculty-count">
                {t("faculties.count", {
                  faculties: filtered.length,
                  departments: departments.length,
                  fields: fieldCount,
                })}
              </span>
            </div>
          </div>
          <Field
            id="faculty-query"
            leadingIcon={<Search size={18} />}
            label={t("faculties.search")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("faculties.search")}
            value={query}
          />
        </div>
        {filtered.length ? (
          <ul className={styles.list}>
            {filtered.map((faculty) => (
              <DirectoryBranch key={faculty.id} node={faculty} searching={Boolean(needle)} />
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>{t("faculties.empty")}</p>
        )}
        <p className={styles.source}>{t("faculties.source")}</p>
      </section>
    </div>
  )
}
