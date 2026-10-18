import { desc, eq, sql } from "drizzle-orm"
import { closeDatabase, db } from "../db/client"
import {
  academicTerms,
  appSettings,
  catalogImports,
  courseOfferings,
  courseReviews,
  sections,
} from "../db/schema"

try {
  const [setting] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "current_term_id"))
    .limit(1)
  const currentId = setting ? Number(setting.value) : null
  const terms = await db
    .select({
      id: academicTerms.id,
      academicYear: academicTerms.academicYear,
      semester: academicTerms.semester,
      label: academicTerms.label,
      offerings: sql<number>`count(distinct ${courseOfferings.id})`,
      sections: sql<number>`count(distinct ${sections.id})`,
    })
    .from(academicTerms)
    .leftJoin(courseOfferings, eq(courseOfferings.termId, academicTerms.id))
    .leftJoin(sections, eq(sections.offeringId, courseOfferings.id))
    .groupBy(academicTerms.id)
    .orderBy(desc(academicTerms.academicYear), desc(academicTerms.semester))
  const [reviewCount] = await db.select({ count: sql<number>`count(*)` }).from(courseReviews)
  const [latest] = await db
    .select()
    .from(catalogImports)
    .orderBy(desc(catalogImports.importedAt))
    .limit(1)

  for (const term of terms) {
    console.log(
      `[catalog] ${term.academicYear}/${term.semester}${term.id === currentId ? " (current)" : ""}: ${term.offerings} offerings, ${term.sections} sections`,
    )
  }
  console.log(`[catalog] approved reviews: ${reviewCount?.count ?? 0}`)
  if (latest) {
    console.log(
      `[catalog] latest import: ${latest.fileName} [${latest.status}] ${latest.importedAt.toISOString()}`,
    )
  }
} finally {
  await closeDatabase()
}
