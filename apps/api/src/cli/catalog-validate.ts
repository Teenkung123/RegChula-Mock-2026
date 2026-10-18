import { readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { normalizeCatalog } from "../modules/catalog/normalize"

const directory = resolve(import.meta.dir, "../../../../data/catalogs")
const files = (await readdir(directory))
  .filter((name) => name.toLowerCase().endsWith(".json"))
  .sort()

if (files.length === 0) throw new Error(`No JSON catalogs found in ${directory}`)

for (const name of files) {
  const normalized = normalizeCatalog(await Bun.file(resolve(directory, name)).json())
  const sectionCount = normalized.offerings.reduce(
    (total, offering) => total + offering.sections.length,
    0,
  )
  const meetingCount = normalized.offerings.reduce(
    (total, offering) =>
      total +
      offering.sections.reduce(
        (sectionTotal, section) => sectionTotal + section.meetings.length,
        0,
      ),
    0,
  )
  console.log(
    `[catalog] ${name}: ${normalized.offerings.length} offerings, ${sectionCount} sections, ${meetingCount} meetings, ${normalized.reviews.length} reviews`,
  )
  if (normalized.conflicts.length > 0) {
    console.error(normalized.conflicts.slice(0, 25).join("\n"))
    process.exitCode = 1
  }
  if (normalized.warnings.length > 0) {
    console.warn(`[catalog] ${name}: ${normalized.warnings.length} non-fatal warnings`)
    console.warn(normalized.warnings.slice(0, 25).join("\n"))
  }
}
