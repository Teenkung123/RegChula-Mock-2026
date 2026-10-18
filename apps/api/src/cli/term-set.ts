import { and, eq, sql } from "drizzle-orm"
import { closeDatabase, db } from "../db/client"
import { academicTerms, appSettings } from "../db/schema"

const [yearArg, semesterArg] = process.argv.slice(2)
const academicYear = Number(yearArg)
const semester = Number(semesterArg)

if (!Number.isInteger(academicYear) || !Number.isInteger(semester)) {
  console.error("Usage: bun run term:set <academicYear> <semester>")
  process.exit(1)
}

try {
  const [term] = await db
    .select()
    .from(academicTerms)
    .where(and(eq(academicTerms.academicYear, academicYear), eq(academicTerms.semester, semester)))
    .limit(1)
  if (!term) throw new Error(`Term ${academicYear}/${semester} has not been imported`)

  await db
    .insert(appSettings)
    .values({ key: "current_term_id", value: String(term.id) })
    .onDuplicateKeyUpdate({ set: { value: sql`values(${appSettings.value})` } })
  console.log(`[term] Current term set to ${academicYear}/${semester}`)
} finally {
  await closeDatabase()
}
