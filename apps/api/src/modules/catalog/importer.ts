import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "../../db/client"
import {
  academicTerms,
  appSettings,
  catalogImports,
  courseOfferings,
  courseReviews,
  courses,
  sectionMeetings,
  sections,
} from "../../db/schema"
import { staffAuditEvents } from "../../db/schema/staff"
import { normalizeCatalog } from "./normalize"
import type {
  NormalizedCatalog,
  NormalizedMeeting,
  NormalizedOffering,
  NormalizedSection,
} from "./types"

const catalogDirectory = resolve(import.meta.dir, "../../../../../data/catalogs")
const batchSize = 400
const catalogImporterVersion = 5

const chunks = <T>(values: T[], size = batchSize): T[][] => {
  const output: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size))
  }
  return output
}

const checksumOf = async (path: string): Promise<string> => {
  const bytes = await Bun.file(path).arrayBuffer()
  return createHash("sha256").update(new Uint8Array(bytes)).digest("hex")
}

const termKey = (academicYear: number, semester: number): string => `${academicYear}|${semester}`
const defaultTermLabel = (academicYear: number, semester: number): string =>
  `${academicYear}/${semester === 3 ? "ฤดูร้อน" : semester}`
const offeringKey = (termId: number, courseCode: string): string => `${termId}|${courseCode}`
const sectionKey = (offeringId: number, sectionNo: string): string => `${offeringId}|${sectionNo}`

function meetingRow(sectionId: number, meeting: NormalizedMeeting) {
  return {
    sectionId,
    classType: meeting.classType,
    dayCode: meeting.dayCode,
    startMinute: meeting.startMinute,
    endMinute: meeting.endMinute,
    periodLabel: meeting.periodLabel,
    building: meeting.building,
    room: meeting.room,
    teachers: meeting.teachers,
    arranged: meeting.arranged,
  }
}

export function importedSectionRow(offeringId: number, section: NormalizedSection) {
  return {
    offeringId,
    sectionNo: section.sectionNo,
    closed: section.closed,
    capacity: section.capacity,
    baselineEnrolled: section.baselineEnrolled,
    note: section.note,
    genEdType: section.genEdType,
    active: true,
  }
}

function offeringRow(termId: number, offering: NormalizedOffering, checksum: string) {
  return {
    termId,
    courseCode: offering.courseCode,
    nameTh: offering.nameTh,
    nameEn: offering.nameEn,
    shortName: offering.shortName,
    descriptionTh: offering.descriptionTh,
    descriptionEn: offering.descriptionEn,
    faculty: offering.faculty,
    department: offering.department,
    credits: offering.credits,
    creditHours: offering.creditHours,
    prerequisiteText: offering.prerequisiteText,
    genEdType: offering.genEdType,
    midtermDate: offering.midterm?.date ?? null,
    midtermStartMinute: offering.midterm?.startMinute ?? null,
    midtermEndMinute: offering.midterm?.endMinute ?? null,
    finalDate: offering.final?.date ?? null,
    finalStartMinute: offering.final?.startMinute ?? null,
    finalEndMinute: offering.final?.endMinute ?? null,
    studyPrograms: offering.studyPrograms,
    active: true,
    sourceChecksum: checksum,
  }
}

async function importNormalized(
  fileName: string,
  checksum: string,
  catalog: NormalizedCatalog,
  staffId?: string,
  expectedRevision?: number,
): Promise<ImportSummary> {
  const importMessage = [
    `Imported catalog with ${catalog.warnings.length} non-fatal warnings`,
    ...catalog.warnings.slice(0, 10),
  ].join("\n")
  const termDefinitions = new Map<
    string,
    { academicYear: number; semester: number; label: string }
  >()
  const offeringTermKeys = new Set<string>()
  for (const offering of catalog.offerings) {
    const key = termKey(offering.academicYear, offering.semester)
    offeringTermKeys.add(key)
    termDefinitions.set(key, {
      academicYear: offering.academicYear,
      semester: offering.semester,
      label: offering.termLabel,
    })
  }
  for (const review of catalog.reviews) {
    const key = termKey(review.academicYear, review.semester)
    if (!termDefinitions.has(key)) {
      termDefinitions.set(key, {
        academicYear: review.academicYear,
        semester: review.semester,
        label: defaultTermLabel(review.academicYear, review.semester),
      })
    }
  }

  let sectionCount = 0
  let meetingCount = 0

  await db.transaction(async (tx) => {
    const [result] = await tx.execute(sql`SELECT revision FROM catalog_revision WHERE id = 1 FOR UPDATE`)
    const revisionRows = result as unknown as Array<{ revision: number }>
    if (expectedRevision !== undefined && Number(revisionRows[0]?.revision) !== expectedRevision) {
      throw new StaffCatalogPreviewStaleError("Catalog changed after the preview")
    }
    await tx.execute(sql`UPDATE catalog_revision SET revision = revision + 1 WHERE id = 1`)
    await tx.execute(sql`SELECT value FROM app_settings WHERE \`key\` = 'current_term_id' FOR UPDATE`)
    await tx
      .insert(academicTerms)
      .values([...termDefinitions.values()].map((term) => ({ ...term, active: true })))
      .onDuplicateKeyUpdate({
        set: {
          label: sql`values(${academicTerms.label})`,
          active: true,
        },
      })

    const termRows = await tx.select().from(academicTerms)
    const termIds = new Map(
      termRows.map((term) => [termKey(term.academicYear, term.semester), term.id]),
    )
    const importedOfferingTermIds = [...offeringTermKeys].map((key) => {
      const id = termIds.get(key)
      if (!id) throw new Error(`Term ${key} was not persisted`)
      return id
    })

    const courseCodes = [
      ...new Set([
        ...catalog.offerings.map((offering) => offering.courseCode),
        ...catalog.reviews.map((review) => review.courseCode),
      ]),
    ]
    for (const batch of chunks(courseCodes)) {
      await tx
        .insert(courses)
        .values(batch.map((courseCode) => ({ courseCode })))
        .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } })
    }

    const previousOfferings = await tx
      .select({ id: courseOfferings.id })
      .from(courseOfferings)
      .where(inArray(courseOfferings.termId, importedOfferingTermIds))
    for (const batch of chunks(previousOfferings.map((row) => row.id))) {
      if (batch.length > 0) {
        await tx.update(sections).set({ active: false }).where(inArray(sections.offeringId, batch))
      }
    }
    await tx
      .update(courseOfferings)
      .set({ active: false })
      .where(inArray(courseOfferings.termId, importedOfferingTermIds))

    for (const batch of chunks(catalog.offerings)) {
      const values = batch.map((offering) => {
        const id = termIds.get(termKey(offering.academicYear, offering.semester))
        if (!id) throw new Error(`Term missing for ${offering.courseCode}`)
        return offeringRow(id, offering, checksum)
      })
      await tx
        .insert(courseOfferings)
        .values(values)
        .onDuplicateKeyUpdate({
          set: {
            nameTh: sql`values(${courseOfferings.nameTh})`,
            nameEn: sql`values(${courseOfferings.nameEn})`,
            shortName: sql`values(${courseOfferings.shortName})`,
            descriptionTh: sql`values(${courseOfferings.descriptionTh})`,
            descriptionEn: sql`values(${courseOfferings.descriptionEn})`,
            faculty: sql`values(${courseOfferings.faculty})`,
            department: sql`values(${courseOfferings.department})`,
            credits: sql`values(${courseOfferings.credits})`,
            creditHours: sql`values(${courseOfferings.creditHours})`,
            prerequisiteText: sql`values(${courseOfferings.prerequisiteText})`,
            genEdType: sql`values(${courseOfferings.genEdType})`,
            midtermDate: sql`values(${courseOfferings.midtermDate})`,
            midtermStartMinute: sql`values(${courseOfferings.midtermStartMinute})`,
            midtermEndMinute: sql`values(${courseOfferings.midtermEndMinute})`,
            finalDate: sql`values(${courseOfferings.finalDate})`,
            finalStartMinute: sql`values(${courseOfferings.finalStartMinute})`,
            finalEndMinute: sql`values(${courseOfferings.finalEndMinute})`,
            studyPrograms: sql`values(${courseOfferings.studyPrograms})`,
            active: true,
            sourceChecksum: checksum,
          },
        })
    }

    const offeringRows = await tx
      .select({
        id: courseOfferings.id,
        termId: courseOfferings.termId,
        courseCode: courseOfferings.courseCode,
      })
      .from(courseOfferings)
      .where(inArray(courseOfferings.termId, importedOfferingTermIds))
    const offeringIds = new Map(
      offeringRows.map((row) => [offeringKey(row.termId, row.courseCode), row.id]),
    )

    const normalizedSections: Array<{
      offeringId: number
      section: NormalizedSection
    }> = []
    for (const offering of catalog.offerings) {
      const termId = termIds.get(termKey(offering.academicYear, offering.semester))
      const id = termId ? offeringIds.get(offeringKey(termId, offering.courseCode)) : undefined
      if (!id) throw new Error(`Offering id missing for ${offering.courseCode}`)
      for (const section of offering.sections) normalizedSections.push({ offeringId: id, section })
    }
    sectionCount = normalizedSections.length

    for (const batch of chunks(normalizedSections)) {
      await tx
        .insert(sections)
        .values(batch.map(({ offeringId, section }) => importedSectionRow(offeringId, section)))
        .onDuplicateKeyUpdate({
          set: {
            closed: sql`values(${sections.closed})`,
            capacity: sql`values(${sections.capacity})`,
            baselineEnrolled: sql`values(${sections.baselineEnrolled})`,
            note: sql`values(${sections.note})`,
            genEdType: sql`values(${sections.genEdType})`,
            active: true,
          },
        })
    }

    const sectionRows = await tx
      .select({
        id: sections.id,
        offeringId: sections.offeringId,
        sectionNo: sections.sectionNo,
      })
      .from(sections)
      .where(inArray(sections.offeringId, [...offeringIds.values()]))
    const sectionIds = new Map(
      sectionRows.map((row) => [sectionKey(row.offeringId, row.sectionNo), row.id]),
    )

    const touchedSectionIds = normalizedSections.map(({ offeringId, section }) => {
      const id = sectionIds.get(sectionKey(offeringId, section.sectionNo))
      if (!id) throw new Error(`Section id missing for ${offeringId}/${section.sectionNo}`)
      return id
    })
    for (const batch of chunks(touchedSectionIds)) {
      await tx.delete(sectionMeetings).where(inArray(sectionMeetings.sectionId, batch))
    }

    const meetingRows = normalizedSections.flatMap(({ offeringId, section }) => {
      const id = sectionIds.get(sectionKey(offeringId, section.sectionNo))
      if (!id) throw new Error(`Section id missing for meeting import`)
      return section.meetings.map((meeting) => meetingRow(id, meeting))
    })
    meetingCount = meetingRows.length
    for (const batch of chunks(meetingRows)) {
      if (batch.length > 0) await tx.insert(sectionMeetings).values(batch)
    }

    for (const batch of chunks(catalog.reviews)) {
      const values = batch.map((review) => {
        const termId = termIds.get(termKey(review.academicYear, review.semester))
        if (!termId) throw new Error(`Review term missing for ${review.reviewId}`)
        return {
          reviewId: review.reviewId,
          courseCode: review.courseCode,
          termId,
          studyProgram: review.studyProgram,
          rating: review.rating,
          content: review.content,
          likeCount: review.likeCount,
          dislikeCount: review.dislikeCount,
          status: review.status,
          sourceChecksum: checksum,
        }
      })
      if (values.length > 0) {
        await tx
          .insert(courseReviews)
          .values(values)
          .onDuplicateKeyUpdate({
            set: {
              courseCode: sql`values(${courseReviews.courseCode})`,
              termId: sql`values(${courseReviews.termId})`,
              studyProgram: sql`values(${courseReviews.studyProgram})`,
              rating: sql`values(${courseReviews.rating})`,
              content: sql`values(${courseReviews.content})`,
              likeCount: sql`values(${courseReviews.likeCount})`,
              dislikeCount: sql`values(${courseReviews.dislikeCount})`,
              status: sql`values(${courseReviews.status})`,
              sourceChecksum: checksum,
            },
          })
      }
    }

    const currentTerm = await tx
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "current_term_id"))
      .limit(1)
    if (currentTerm.length === 0) {
      const newest = [...termRows]
        .filter((term) => importedOfferingTermIds.includes(term.id))
        .sort((a, b) => b.academicYear - a.academicYear || b.semester - a.semester)[0]
      if (newest) {
        await tx.insert(appSettings).values({
          key: "current_term_id",
          value: String(newest.id),
        })
      }
    }

    await tx
      .insert(catalogImports)
      .values({
        fileName,
        checksum,
        importerVersion: catalogImporterVersion,
        status: "succeeded",
        courseCount: catalog.offerings.length,
        sectionCount,
        reviewCount: catalog.reviews.length,
        conflictCount: 0,
        message: `${importMessage}\nImported ${meetingCount} class meetings`,
      })
      .onDuplicateKeyUpdate({
        set: {
          fileName,
          importerVersion: catalogImporterVersion,
          status: "succeeded",
          courseCount: catalog.offerings.length,
          sectionCount,
          reviewCount: catalog.reviews.length,
          conflictCount: 0,
          message: `${importMessage}\nImported ${meetingCount} class meetings`,
          importedAt: new Date(),
        },
      })

    if (staffId) {
      await tx.insert(staffAuditEvents).values({
        staffId,
        action: "import",
        target: `catalog:${checksum}`,
        details: { courseCount: catalog.offerings.length, sectionCount, warningCount: catalog.warnings.length },
      })
    }
  })

  return {
    fileName,
    checksum,
    skipped: false,
    courseCount: catalog.offerings.length,
    sectionCount,
    meetingCount,
    reviewCount: catalog.reviews.length,
    warningCount: catalog.warnings.length,
  }
}

export interface ImportSummary {
  fileName: string
  checksum: string
  skipped: boolean
  courseCount: number
  sectionCount: number
  meetingCount: number
  reviewCount: number
  warningCount: number
}

export class StaffCatalogPreviewStaleError extends Error {}

/** Import an already validated upload without writing a temporary catalog file. */
export async function importCatalogUpload(
  checksum: string,
  catalog: NormalizedCatalog,
  staffId: string,
  expectedRevision: number,
): Promise<ImportSummary> {
  if (catalog.conflicts.length || catalog.offerings.length === 0) {
    throw new Error("Catalog must contain offerings and no conflicts")
  }
  return importNormalized("staff-upload.json", checksum, catalog, staffId, expectedRevision)
}

export async function importCatalogFile(path: string, force = false): Promise<ImportSummary> {
  const fileName = basename(path)
  const checksum = await checksumOf(path)
  const existing = await db
    .select({ id: catalogImports.id })
    .from(catalogImports)
    .where(
      and(
        eq(catalogImports.checksum, checksum),
        eq(catalogImports.importerVersion, catalogImporterVersion),
        eq(catalogImports.status, "succeeded"),
      ),
    )
    .limit(1)
  if (!force && existing.length > 0) {
    return {
      fileName,
      checksum,
      skipped: true,
      courseCount: 0,
      sectionCount: 0,
      meetingCount: 0,
      reviewCount: 0,
      warningCount: 0,
    }
  }

  const raw = await Bun.file(path).json()
  const catalog = normalizeCatalog(raw)
  if (catalog.conflicts.length > 0) {
    await db
      .insert(catalogImports)
      .values({
        fileName,
        checksum,
        importerVersion: catalogImporterVersion,
        status: "failed",
        conflictCount: catalog.conflicts.length,
        message: catalog.conflicts.slice(0, 25).join("\n"),
      })
      .onDuplicateKeyUpdate({
        set: {
          fileName,
          importerVersion: catalogImporterVersion,
          status: "failed",
          conflictCount: catalog.conflicts.length,
          message: catalog.conflicts.slice(0, 25).join("\n"),
          importedAt: new Date(),
        },
      })
    throw new Error(
      `Catalog ${fileName} contains ${catalog.conflicts.length} conflicts:\n${catalog.conflicts
        .slice(0, 10)
        .join("\n")}`,
    )
  }

  return importNormalized(fileName, checksum, catalog)
}

export async function importCatalogDirectory(force = false): Promise<ImportSummary[]> {
  const entries = await readdir(catalogDirectory, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => resolve(catalogDirectory, entry.name))
    .sort()
  if (files.length === 0) throw new Error(`No JSON catalogs found in ${catalogDirectory}`)

  const summaries: ImportSummary[] = []
  for (const path of files) summaries.push(await importCatalogFile(path, force))
  return summaries
}

export async function latestCatalogImport() {
  return db.select().from(catalogImports).orderBy(desc(catalogImports.importedAt)).limit(1)
}
