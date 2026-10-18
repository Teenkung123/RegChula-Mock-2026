import { desc, eq } from "drizzle-orm"
import { closeDatabase, db } from "../db/client"
import { academicTerms, appSettings } from "../db/schema"

try {
  const [setting] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "current_term_id"))
    .limit(1)
  const currentId = setting ? Number(setting.value) : null
  const terms = await db
    .select()
    .from(academicTerms)
    .orderBy(desc(academicTerms.academicYear), desc(academicTerms.semester))

  for (const term of terms) {
    console.log(`${term.academicYear}/${term.semester}${term.id === currentId ? " * current" : ""}`)
  }
} finally {
  await closeDatabase()
}
