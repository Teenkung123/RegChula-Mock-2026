import type { AppLanguage } from "../i18n"

export interface CourseName {
  courseCode: string
  shortName?: string | null
  nameTh?: string
  nameEn?: string
}

export function compactCourseName(course: CourseName, language: AppLanguage): string {
  return course.shortName?.trim() || fullCourseName(course, language)
}

export function fullCourseName(course: CourseName, language: AppLanguage): string {
  const names = language === "th" ? [course.nameTh, course.nameEn] : [course.nameEn, course.nameTh]
  return names.find((name) => name?.trim())?.trim() ?? ""
}

export function courseLabel(course: CourseName, language: AppLanguage): string {
  const name = compactCourseName(course, language)
  return name && name !== course.courseCode ? `${course.courseCode} · ${name}` : course.courseCode
}

export function courseSearchText(course: CourseName): string {
  return [course.courseCode, course.shortName, course.nameTh, course.nameEn]
    .map((value) => value?.trim())
    .filter(
      (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
    )
    .join(" ")
}
