import { closeDatabase } from "../db/client"
import { importCatalogDirectory } from "../modules/catalog/importer"

try {
  const force = process.argv.includes("--force")
  const summaries = await importCatalogDirectory(force)
  for (const summary of summaries) {
    if (summary.skipped) {
      console.log(`[catalog] ${summary.fileName}: unchanged, skipped`)
      continue
    }
    console.log(
      `[catalog] ${summary.fileName}: ${summary.courseCount} offerings, ${summary.sectionCount} sections, ${summary.meetingCount} meetings, ${summary.reviewCount} reviews, ${summary.warningCount} warnings`,
    )
  }
} finally {
  await closeDatabase()
}
