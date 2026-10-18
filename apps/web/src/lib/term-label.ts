import type { TermDto } from "@regchula/api/public-types"
import type { AppLanguage } from "../i18n"

const summerLabel: Record<AppLanguage, string> = {
  th: "ฤดูร้อน",
  en: "summer",
  zh: "暑期",
}

export function termLabel(term: TermDto, language: AppLanguage): string {
  if (term.semester === 3) return `${term.academicYear}/${summerLabel[language]}`
  return term.label.trim() || `${term.academicYear}/${term.semester}`
}
