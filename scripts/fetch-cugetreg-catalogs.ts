import { readdir, rename } from "node:fs/promises"
import { resolve } from "node:path"
import type { RawCourse, RawDataset, RawReview } from "../apps/api/src/modules/catalog/types"

const graphqlEndpoint = "https://cugetreg.com/_api/graphql"
const catalogDirectory = resolve(import.meta.dir, "../data/catalogs")
const studyPrograms = ["S", "T", "I"] as const
const pageSize = 10_000
const requestDelayMs = 250

export interface CatalogTerm {
  academicYear: number
  semester: number
}

export const availableCatalogTerms: CatalogTerm[] = Array.from(
  { length: 6 },
  (_, index) => 2569 - index,
).flatMap((academicYear) => [3, 2, 1].map((semester) => ({ academicYear, semester })))

export const catalogTermKey = ({ academicYear, semester }: CatalogTerm): string =>
  `${academicYear}/${semester}`

export const catalogTermLabel = ({ academicYear, semester }: CatalogTerm): string =>
  `${academicYear}/${semester === 3 ? "ฤดูร้อน" : semester}`

const searchQuery = `query SearchCourse($filter: FilterInput!, $courseGroup: CourseGroupInput!) {
  search(filter: $filter, courseGroup: $courseGroup) {
    studyProgram
    semester
    academicYear
    courseNo
    abbrName
    courseNameTh
    courseNameEn
    faculty
    department
    credit
    creditHours
    courseCondition
    courseDescTh
    courseDescEn
    genEdType
    midterm { date period { start end } }
    final { date period { start end } }
    sections {
      genEdType
      sectionNo
      closed
      capacity { current max }
      note
      classes { type dayOfWeek period { start end } room building teachers }
    }
  }
}`
const searchQueryWithoutSectionGenEd = searchQuery.replace(
  "    sections {\n      genEdType\n",
  "    sections {\n",
)

interface ExistingCatalogData {
  reviews: Map<string, Map<string, RawReview>>
  termPrograms: Map<string, Set<string>>
}

interface GraphqlResult {
  data?: { search?: RawCourse[] }
  errors?: Array<{ message?: string }>
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolveWait) => setTimeout(resolveWait, milliseconds))

const courseKey = (studyProgram: string, courseNo: unknown): string =>
  `${studyProgram}|${String(courseNo ?? "").trim()}`

export function mergeCoursePage(target: Map<string, RawCourse>, page: RawCourse[]): number {
  let added = 0
  for (const course of page) {
    const key = String(course.courseNo ?? "").trim()
    if (!key) throw new Error("CUGetReg returned a course without courseNo")
    const existing = target.get(key)
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(course)) {
        throw new Error(`CUGetReg returned conflicting duplicate course ${key}`)
      }
      continue
    }
    target.set(key, course)
    added += 1
  }
  return added
}

async function inspectExistingCatalogs(): Promise<ExistingCatalogData> {
  const reviews = new Map<string, Map<string, RawReview>>()
  const termPrograms = new Map<string, Set<string>>()
  const files = (await readdir(catalogDirectory)).filter((name) => name.endsWith(".json")).sort()
  for (const file of files) {
    const raw = (await Bun.file(resolve(catalogDirectory, file)).json()) as {
      datasets?: RawDataset[]
    }
    for (const dataset of raw.datasets ?? []) {
      const studyProgram = String(dataset.studyProgram ?? "").trim()
      const academicYear = Number(dataset.academicYear)
      const semester = Number(dataset.semester)
      if (!studyProgram || !Number.isInteger(academicYear) || !Number.isInteger(semester)) continue
      const termKey = catalogTermKey({ academicYear, semester })
      const programs = termPrograms.get(termKey) ?? new Set<string>()
      programs.add(studyProgram)
      termPrograms.set(termKey, programs)

      for (const course of Array.isArray(dataset.courses) ? (dataset.courses as RawCourse[]) : []) {
        const key = courseKey(studyProgram, course.courseNo)
        if (key.endsWith("|")) continue
        const known = reviews.get(key) ?? new Map<string, RawReview>()
        for (const review of Array.isArray(course.reviews) ? (course.reviews as RawReview[]) : []) {
          const reviewId = String(review._id ?? "").trim()
          if (reviewId) known.set(reviewId, review)
        }
        if (known.size > 0) reviews.set(key, known)
      }
    }
  }
  return { reviews, termPrograms }
}

async function requestCoursePage(
  term: CatalogTerm,
  studyProgram: string,
  offset: number,
): Promise<RawCourse[]> {
  let activeQuery = searchQuery
  const operation = {
    operationName: "SearchCourse",
    variables: {
      filter: { limit: pageSize, offset },
      courseGroup: {
        studyProgram,
        academicYear: String(term.academicYear),
        semester: String(term.semester),
      },
    },
    query: activeQuery,
  }
  const body = [operation]

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          origin: "https://cugetreg.com",
          referer: `https://cugetreg.com/${studyProgram}/courses?term=${encodeURIComponent(catalogTermKey(term))}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const [result] = (await response.json()) as GraphqlResult[]
      if (result?.errors?.length) {
        const message = result.errors.map((error) => error.message ?? "GraphQL error").join("; ")
        if (
          activeQuery === searchQuery &&
          message.includes("Cannot return null for non-nullable field Section.genEdType")
        ) {
          activeQuery = searchQueryWithoutSectionGenEd
          operation.query = activeQuery
          console.warn(`[cugetreg] ${catalogTermKey(term)} ${studyProgram}: section GenEd fallback`)
          continue
        }
        throw new Error(message)
      }
      if (!Array.isArray(result?.data?.search))
        throw new Error("SearchCourse returned no course list")
      if (activeQuery === searchQueryWithoutSectionGenEd) {
        for (const course of result.data.search) {
          for (const section of Array.isArray(course.sections) ? course.sections : []) {
            section.genEdType ??= course.genEdType
          }
        }
      }
      await wait(requestDelayMs)
      return result.data.search
    } catch (error) {
      if (attempt === 4) throw error
      await wait(500 * 2 ** (attempt - 1))
    }
  }
  return []
}

async function fetchProgram(term: CatalogTerm, studyProgram: string): Promise<RawCourse[]> {
  const courses = new Map<string, RawCourse>()
  let offset = 0
  for (let page = 1; page <= 1_000; page += 1) {
    const values = await requestCoursePage(term, studyProgram, offset)
    if (values.length === 0) break
    const added = mergeCoursePage(courses, values)
    if (added === 0)
      throw new Error(`Pagination did not advance for ${catalogTermKey(term)} ${studyProgram}`)
    offset += values.length
    console.log(
      `[cugetreg] ${catalogTermKey(term)} ${studyProgram}: ${courses.size} courses received`,
    )
  }
  return [...courses.values()].sort((first, second) =>
    String(first.courseNo).localeCompare(String(second.courseNo), "en", { numeric: true }),
  )
}

function requestedTerms(arguments_: string[]): CatalogTerm[] {
  const values = arguments_.filter((value) => value.startsWith("--term="))
  if (values.length === 0) return availableCatalogTerms
  return values.map((value) => {
    const match = /^(\d{4})\/(1|2|3)$/.exec(value.slice("--term=".length))
    if (!match) throw new Error(`Invalid term ${value}; expected --term=2569/3`)
    return { academicYear: Number(match[1]), semester: Number(match[2]) }
  })
}

async function main() {
  const existing = await inspectExistingCatalogs()
  for (const term of requestedTerms(process.argv.slice(2))) {
    const key = catalogTermKey(term)
    const coveredPrograms = existing.termPrograms.get(key) ?? new Set<string>()
    if (studyPrograms.every((studyProgram) => coveredPrograms.has(studyProgram))) {
      console.log(`[cugetreg] ${key}: cached locally, skipped`)
      continue
    }
    if (coveredPrograms.size > 0) {
      throw new Error(
        `${key} has a partial local export; refusing to create an overlapping snapshot`,
      )
    }

    const datasets: Array<{
      studyProgram: string
      academicYear: string
      semester: string
      term: string
      termLabel: string
      courses: RawCourse[]
    }> = []
    for (const studyProgram of studyPrograms) {
      const courses = await fetchProgram(term, studyProgram)
      for (const course of courses) {
        const reusedReviews = existing.reviews.get(courseKey(studyProgram, course.courseNo))
        if (reusedReviews?.size) course.reviews = [...reusedReviews.values()]
      }
      datasets.push({
        studyProgram,
        academicYear: String(term.academicYear),
        semester: String(term.semester),
        term: key,
        termLabel: catalogTermLabel(term),
        courses,
      })
    }

    const output = resolve(
      catalogDirectory,
      `cugetreg_${term.academicYear}_${term.semester}_all.json`,
    )
    const temporary = `${output}.${process.pid}.tmp`
    await Bun.write(
      temporary,
      `${JSON.stringify({
        source: {
          site: "https://cugetreg.com",
          graphql: graphqlEndpoint,
          pulledAt: new Date().toISOString(),
          reusedLocalReviews: true,
        },
        datasets,
      })}\n`,
    )
    await rename(temporary, output)
    existing.termPrograms.set(key, new Set(studyPrograms))
    console.log(
      `[cugetreg] ${key}: wrote ${datasets.reduce((total, dataset) => total + dataset.courses.length, 0)} rows`,
    )
  }
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(`[cugetreg] ${error instanceof Error ? error.message : "Unknown failure"}`)
    process.exit(1)
  })
}
