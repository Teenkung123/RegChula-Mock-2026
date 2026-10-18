import { useQuery } from "@tanstack/react-query"
import { useI18n } from "../i18n"
import { getCourses, type TermQuery } from "../lib/api"
import { compactCourseName, fullCourseName, type CourseName } from "../lib/course-label"
import styles from "./CourseReference.module.css"

export interface CourseReferenceContext {
  courses?: readonly CourseName[] | undefined
  term?: TermQuery | null | undefined
}

function Label({ course }: { course: CourseName }) {
  const { language } = useI18n()
  const name = compactCourseName(course, language)
  const fullName = fullCourseName(course, language) || name
  return (
    <span
      className={styles.reference}
      title={fullName ? `${course.courseCode} · ${fullName}` : undefined}
    >
      <span className={styles.code}>{course.courseCode}</span>
      {name && name !== course.courseCode ? (
        <>
          <span aria-hidden="true"> · </span>
          <span className={styles.name}>{name}</span>
        </>
      ) : null}
    </span>
  )
}

function CatalogueReference({ courseCode, term }: { courseCode: string; term: TermQuery }) {
  const lookup = useQuery({
    queryKey: ["course-reference", term.academicYear, term.semester, courseCode],
    queryFn: async ({ signal }) => {
      const result = await getCourses(
        { ...term, q: courseCode, mode: "autocomplete", page: 1, pageSize: 8 },
        signal,
      )
      return result.data.find((course) => course.courseCode === courseCode) ?? null
    },
    staleTime: 5 * 60_000,
    retry: false,
  })
  return <Label course={lookup.data ?? { courseCode }} />
}

export function CourseReference({
  courseCode,
  courses,
  term,
}: CourseReferenceContext & { courseCode: string }) {
  const known = courses?.find((course) => course.courseCode === courseCode)
  if (known) return <Label course={known} />
  if (term?.academicYear !== undefined && term.semester !== undefined && /^\d{7}$/.test(courseCode))
    return <CatalogueReference courseCode={courseCode} term={term} />
  return <Label course={{ courseCode }} />
}
