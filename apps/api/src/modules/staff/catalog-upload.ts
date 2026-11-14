import { createHash } from "node:crypto"
import { normalizeCatalog } from "../catalog/normalize"
import type { NormalizedCatalog } from "../catalog/types"

const maxUnsignedInt = 4_294_967_295
const maxTextBytes = 65_535

function checkCharacters(value: string | null, max: number, field: string) {
  if (value === null) return
  let length = 0
  for (const _character of value) {
    length += 1
    if (length > max) throw new Error(`${field} exceeds ${max} characters`)
  }
}

function checkText(value: string | null, field: string) {
  if (value !== null && Buffer.byteLength(value, "utf8") > maxTextBytes) {
    throw new Error(`${field} exceeds ${maxTextBytes} UTF-8 bytes`)
  }
}

function checkUnsignedInt(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maxUnsignedInt) {
    throw new Error(`${field} is out of range`)
  }
}

/** Match the catalog import's persisted column limits before presenting a preview. */
function validateCatalogColumns(catalog: NormalizedCatalog) {
  for (const offering of catalog.offerings) {
    const context = `${offering.academicYear}/${offering.semester} ${offering.courseCode}`
    if (offering.academicYear > 9999) throw new Error(`${context}: academic year is out of range`)
    checkCharacters(offering.termLabel, 32, `${context} term label`)
    checkCharacters(offering.courseCode, 24, "Course code")
    checkCharacters(offering.nameTh, 500, `${context} Thai name`)
    checkCharacters(offering.nameEn, 500, `${context} English name`)
    checkCharacters(offering.shortName, 255, `${context} short name`)
    checkCharacters(offering.faculty, 255, `${context} faculty`)
    checkCharacters(offering.department, 255, `${context} department`)
    checkCharacters(offering.creditHours, 255, `${context} credit hours`)
    checkCharacters(offering.genEdType, 100, `${context} general education type`)
    checkText(offering.descriptionTh, `${context} Thai description`)
    checkText(offering.descriptionEn, `${context} English description`)
    checkText(offering.prerequisiteText, `${context} prerequisites`)
    if (!Number.isFinite(offering.credits) || offering.credits < 0 || offering.credits > 999.9 ||
      Math.abs(offering.credits * 10 - Math.round(offering.credits * 10)) > 1e-8) {
      throw new Error(`${context}: credits must fit one decimal place and be at most 999.9`)
    }
    const sectionNumbers = new Set<string>()
    for (const section of offering.sections) {
      checkCharacters(section.sectionNo, 32, `${context} section number`)
      if (sectionNumbers.has(section.sectionNo)) throw new Error(`${context}: duplicate section ${section.sectionNo}`)
      sectionNumbers.add(section.sectionNo)
      checkUnsignedInt(section.capacity, `${context} section capacity`)
      checkUnsignedInt(section.baselineEnrolled, `${context} section enrollment`)
      checkText(section.note, `${context} section note`)
      checkCharacters(section.genEdType, 100, `${context} section general education type`)
      for (const meeting of section.meetings) {
        checkCharacters(meeting.classType, 80, `${context} class type`)
        checkCharacters(meeting.dayCode, 12, `${context} class day`)
        checkCharacters(meeting.periodLabel, 64, `${context} class period`)
        checkCharacters(meeting.building, 255, `${context} building`)
        checkCharacters(meeting.room, 255, `${context} room`)
      }
    }
  }
  for (const review of catalog.reviews) {
    if (review.academicYear < 1 || review.academicYear > 9999 || review.semester < 1 || review.semester > 3) {
      throw new Error("Review term is out of range")
    }
    checkCharacters(review.reviewId, 80, "Review ID")
    checkCharacters(review.courseCode, 24, "Review course code")
    checkCharacters(review.studyProgram, 16, "Review study program")
    checkCharacters(review.status, 32, "Review status")
    checkText(review.content, "Review content")
    checkUnsignedInt(review.likeCount, "Review like count")
    checkUnsignedInt(review.dislikeCount, "Review dislike count")
  }
}

/** This function is executed by the upload worker, away from the HTTP event loop. */
export function catalogUploadSummary(bytes: Uint8Array) {
  const checksum = createHash("sha256").update(bytes).digest("hex")
  const catalog = normalizeCatalog(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)))
  if (!catalog.offerings.length) throw new Error("Catalog has no courses")
  if (catalog.conflicts.length) throw new Error(catalog.conflicts.slice(0, 10).join("; "))
  if (catalog.offerings.some((item) => item.semester < 1 || item.semester > 3)) {
    throw new Error("Semester must be between 1 and 3")
  }
  const courseCodes = new Set(catalog.offerings.map((item) => item.courseCode))
  if (catalog.reviews.some((item) => !courseCodes.has(item.courseCode))) {
    throw new Error("Every review must belong to a course in the uploaded catalog")
  }
  validateCatalogColumns(catalog)
  const terms = [...new Map(catalog.offerings.map(({ academicYear, semester }) => [
    `${academicYear}/${semester}`, { academicYear, semester },
  ])).values()]
  const reviewsByTerm = new Map<string, { academicYear: number; semester: number; count: number }>()
  for (const review of catalog.reviews) {
    const key = `${review.academicYear}/${review.semester}`
    const term = reviewsByTerm.get(key) ?? { academicYear: review.academicYear, semester: review.semester, count: 0 }
    term.count += 1
    reviewsByTerm.set(key, term)
  }
  return {
    catalog,
    summary: { checksum, courseCount: catalog.offerings.length,
      sectionCount: catalog.offerings.reduce((sum, item) => sum + item.sections.length, 0),
      overCapacitySections: catalog.offerings.reduce((sum, item) => sum + item.sections.filter((section) => section.baselineEnrolled > section.capacity).length, 0),
      terms, reviewTerms: [...reviewsByTerm.values()], warnings: catalog.warnings.slice(0, 50) },
  }
}

export class CatalogUploadBusyError extends Error {
  constructor() { super("The catalog importer is busy. Try again shortly.") }
}
export class CatalogUploadInvalidError extends Error {}

type UploadResult = ReturnType<typeof catalogUploadSummary>
type WorkerReply = { ok: true; result: UploadResult } | { ok: false; message: string }
const workerTimeoutMs = 120_000
let activeUploads = 0

async function runWorker(bytes: Uint8Array): Promise<UploadResult> {
  // The API normally runs TypeScript from src. The dist build retains src in the
  // deployed image; this fallback resolves the same worker from dist/index.js.
  const sibling = new URL("./catalog-upload-worker.ts", import.meta.url)
  const source = await Bun.file(sibling).exists()
    ? sibling
    : new URL("../src/modules/staff/catalog-upload-worker.ts", import.meta.url)
  const worker = new Worker(source.href, { type: "module" })
  try {
    return await new Promise<UploadResult>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Catalog worker timed out")), workerTimeoutMs)
      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        clearTimeout(timer)
        if (event.data.ok) resolve(event.data.result)
        else reject(new CatalogUploadInvalidError(event.data.message))
      }
      worker.onerror = (event: ErrorEvent) => {
        clearTimeout(timer)
        reject(new Error(`Catalog worker failed: ${event.message}`))
      }
      const transferable = bytes.buffer instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes)
      try {
        worker.postMessage(transferable, [transferable.buffer as ArrayBuffer])
      } catch (error) {
        clearTimeout(timer)
        reject(error)
      }
    })
  } finally {
    worker.terminate()
  }
}

/** Reject extra uploads before reading their bodies to bound both memory and workers. */
export async function processCatalogUpload(read: () => Promise<Uint8Array>): Promise<UploadResult> {
  if (activeUploads >= 2) throw new CatalogUploadBusyError()
  activeUploads += 1
  try {
    return await runWorker(await read())
  } finally {
    activeUploads -= 1
  }
}

export function parseCatalogUpload(bytes: Uint8Array): Promise<UploadResult> {
  return processCatalogUpload(async () => bytes)
}
