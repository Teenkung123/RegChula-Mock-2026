import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import { db } from "../../db/client"
import {
  academicTerms,
  appSettings,
  courseOfferings,
  courseReviews,
  sectionMeetings,
  sections,
} from "../../db/schema"
import { compareSectionNo } from "../../shared/section-sort"
import {
  courseSearchTerms,
  type NormalizedCourseSearch,
  normalizeCourseSearch,
  searchCacheKey,
  TtlLruSingleFlightCache,
  termSelectionCacheKey,
} from "./cache"

export interface TermSelection {
  academicYear?: number
  semester?: number
}

export interface CourseSearch extends TermSelection {
  q?: string
  faculty?: string
  faculties?: string
  department?: string
  departments?: string
  genEdTypes?: string
  courseGroup?: "general" | "other"
  day?: string
  days?: string
  startTime?: string
  endTime?: string
  examDays?: string
  examStartTime?: string
  examEndTime?: string
  credits?: number
  minCredits?: number
  maxCredits?: number
  mode?: "autocomplete"
  page: number
  pageSize: number
}

const currentTermCacheTtlMs = 2_000
const optionsCacheTtlMs = 15_000
const searchCacheTtlMs = 5_000

async function loadCurrentTerm() {
  const [setting] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "current_term_id"))
    .limit(1)
  if (!setting) return null
  const [term] = await db
    .select()
    .from(academicTerms)
    .where(eq(academicTerms.id, Number(setting.value)))
    .limit(1)
  return term ?? null
}

const termCache = new TtlLruSingleFlightCache<Awaited<ReturnType<typeof loadCurrentTerm>>>({
  maxEntries: 8,
  ttlMs: currentTermCacheTtlMs,
})

export function currentTerm() {
  return termCache.getOrLoad("current", loadCurrentTerm)
}

export async function resolveTerm(selection: TermSelection) {
  if (selection.academicYear === undefined && selection.semester === undefined) return currentTerm()
  if (selection.academicYear === undefined || selection.semester === undefined) return null
  const academicYear = selection.academicYear
  const semester = selection.semester
  return termCache.getOrLoad(termSelectionCacheKey(selection), async () => {
    const [term] = await db
      .select()
      .from(academicTerms)
      .where(
        and(eq(academicTerms.academicYear, academicYear), eq(academicTerms.semester, semester)),
      )
      .limit(1)
    return term ?? null
  })
}

export async function listTerms() {
  const selected = await currentTerm()
  const terms = await db
    .select()
    .from(academicTerms)
    .where(
      and(
        eq(academicTerms.active, true),
        sql`exists (
          select 1 from ${courseOfferings}
          where ${courseOfferings.termId} = ${academicTerms.id}
            and ${courseOfferings.active} = true
        )`,
      ),
    )
    .orderBy(desc(academicTerms.academicYear), desc(academicTerms.semester))
  return terms.map((term) => ({ ...term, current: term.id === selected?.id }))
}

type CatalogTerm = NonNullable<Awaited<ReturnType<typeof loadCurrentTerm>>>

async function loadCatalogOptions(term: CatalogTerm) {
  const [faculties, departments, facultyDepartmentPairs, creditRows] = await Promise.all([
    db
      .selectDistinct({ value: courseOfferings.faculty })
      .from(courseOfferings)
      .where(and(eq(courseOfferings.termId, term.id), eq(courseOfferings.active, true)))
      .orderBy(asc(courseOfferings.faculty)),
    db
      .selectDistinct({ value: courseOfferings.department })
      .from(courseOfferings)
      .where(and(eq(courseOfferings.termId, term.id), eq(courseOfferings.active, true)))
      .orderBy(asc(courseOfferings.department)),
    db
      .selectDistinct({ faculty: courseOfferings.faculty, department: courseOfferings.department })
      .from(courseOfferings)
      .where(and(eq(courseOfferings.termId, term.id), eq(courseOfferings.active, true)))
      .orderBy(asc(courseOfferings.faculty), asc(courseOfferings.department)),
    db
      .selectDistinct({ value: courseOfferings.credits })
      .from(courseOfferings)
      .where(and(eq(courseOfferings.termId, term.id), eq(courseOfferings.active, true)))
      .orderBy(asc(courseOfferings.credits)),
  ])
  const genEdRows = await db
    .selectDistinct({ value: courseOfferings.genEdType })
    .from(courseOfferings)
    .where(and(eq(courseOfferings.termId, term.id), eq(courseOfferings.active, true)))
    .orderBy(asc(courseOfferings.genEdType))
  const unitByFaculty = new Map<string, string>()
  const facultyIdsByDepartment = new Map<string, Set<string>>()
  for (const pair of facultyDepartmentPairs) {
    if (!unitByFaculty.has(pair.faculty)) unitByFaculty.set(pair.faculty, pair.department)
    const facultyIds = facultyIdsByDepartment.get(pair.department) ?? new Set<string>()
    facultyIds.add(pair.faculty)
    facultyIdsByDepartment.set(pair.department, facultyIds)
  }
  return {
    term,
    faculties: faculties.map((row) => ({
      id: row.value,
      name: unitByFaculty.get(row.value) ?? `หน่วยงานรหัส ${row.value}`,
    })),
    departments: departments.map((row) => ({
      id: row.value,
      name: row.value,
      facultyIds: [...(facultyIdsByDepartment.get(row.value) ?? [])],
    })),
    credits: creditRows.map((row) => row.value),
    genEdTypes: genEdRows
      .map((row) => row.value)
      .filter((value): value is string => Boolean(value)),
  }
}

const optionsCache = new TtlLruSingleFlightCache<Awaited<ReturnType<typeof loadCatalogOptions>>>({
  maxEntries: 8,
  ttlMs: optionsCacheTtlMs,
})

export async function catalogOptions(selection: TermSelection) {
  const term = await resolveTerm(selection)
  if (!term) return null
  return optionsCache.getOrLoad(String(term.id), () => loadCatalogOptions(term))
}

export function examSearchCondition(normalized: NormalizedCourseSearch): SQL | undefined {
  if (
    normalized.examDays.length ||
    normalized.examStartMinute !== null ||
    normalized.examEndMinute !== null
  ) {
    const weekdayCodes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
    const weekdays = normalized.examDays.map((day) => weekdayCodes.indexOf(day))
    const examConditions = [
      [
        courseOfferings.midtermDate,
        courseOfferings.midtermStartMinute,
        courseOfferings.midtermEndMinute,
      ],
      [courseOfferings.finalDate, courseOfferings.finalStartMinute, courseOfferings.finalEndMinute],
    ].map(([date, start, end]) => {
      // All criteria must match one complete, announced exam slot.
      const slot: SQL[] = [
        sql`${date} is not null`,
        sql`${start} is not null`,
        sql`${end} is not null`,
        sql`${end} > ${start}`,
      ]
      if (weekdays.length) slot.push(inArray(sql`weekday(${date})`, weekdays))
      if (normalized.examStartMinute !== null)
        slot.push(sql`${start} >= ${normalized.examStartMinute}`)
      if (normalized.examEndMinute !== null) slot.push(sql`${end} <= ${normalized.examEndMinute}`)
      return and(...slot)
    })
    return or(...examConditions)
  }

  return undefined
}

async function loadSearchCourses(
  input: CourseSearch,
  term: CatalogTerm,
  normalized: NormalizedCourseSearch,
) {
  const conditions: SQL[] = [eq(courseOfferings.termId, term.id), eq(courseOfferings.active, true)]
  const query = normalized.query
  const searchTerms = query ? courseSearchTerms(query) : []
  if (query) {
    if (searchTerms.length === 0) conditions.push(sql`false`)
    for (const term of searchTerms) {
      const pattern = `%${term}%`
      const termCondition = or(
        like(courseOfferings.courseCode, pattern),
        like(courseOfferings.nameTh, pattern),
        like(courseOfferings.nameEn, pattern),
        like(courseOfferings.shortName, pattern),
        like(courseOfferings.descriptionTh, pattern),
        like(courseOfferings.descriptionEn, pattern),
      )
      if (termCondition) conditions.push(termCondition)
    }
  }
  const facultyIds = normalized.facultyIds
  const departmentIds = normalized.departmentIds
  const [facultyId] = facultyIds
  const [departmentId] = departmentIds
  if (facultyIds.length === 1 && facultyId) conditions.push(eq(courseOfferings.faculty, facultyId))
  if (facultyIds.length > 1) conditions.push(inArray(courseOfferings.faculty, facultyIds))
  if (departmentIds.length === 1 && departmentId) {
    conditions.push(eq(courseOfferings.department, departmentId))
  }
  if (departmentIds.length > 1) conditions.push(inArray(courseOfferings.department, departmentIds))
  const selectedGenEdTypes = normalized.genEdTypes
  if (selectedGenEdTypes.length === 1) {
    const [genEdType] = selectedGenEdTypes
    if (genEdType) conditions.push(eq(courseOfferings.genEdType, genEdType))
  }
  if (selectedGenEdTypes.length > 1) {
    conditions.push(inArray(courseOfferings.genEdType, selectedGenEdTypes))
  }
  if (normalized.courseGroup === "general") {
    conditions.push(inArray(courseOfferings.genEdType, ["SC", "SO", "HU", "IN"]))
  }
  if (normalized.courseGroup === "other") {
    const otherCourses = or(eq(courseOfferings.genEdType, "NO"), isNull(courseOfferings.genEdType))
    if (otherCourses) conditions.push(otherCourses)
  }
  if (normalized.credits !== null) conditions.push(eq(courseOfferings.credits, normalized.credits))
  if (normalized.minCredits !== null)
    conditions.push(gte(courseOfferings.credits, normalized.minCredits))
  if (normalized.maxCredits !== null)
    conditions.push(lte(courseOfferings.credits, normalized.maxCredits))

  const startMinute = normalized.startMinute
  const endMinute = normalized.endMinute
  const days = normalized.days
  if (days.length > 0 || startMinute !== null || endMinute !== null) {
    const meetingConditions: SQL[] = [
      sql`${sections.offeringId} = ${courseOfferings.id}`,
      eq(sections.active, true),
      eq(sectionMeetings.arranged, false),
    ]
    const [day] = days
    if (days.length === 1 && day) meetingConditions.push(eq(sectionMeetings.dayCode, day))
    if (days.length > 1) meetingConditions.push(inArray(sectionMeetings.dayCode, days))
    if (startMinute !== null) {
      meetingConditions.push(sql`${sectionMeetings.startMinute} >= ${startMinute}`)
    }
    if (endMinute !== null) {
      meetingConditions.push(sql`${sectionMeetings.endMinute} <= ${endMinute}`)
    }
    conditions.push(sql`exists (
      select 1 from ${sections}
      inner join ${sectionMeetings} on ${sectionMeetings.sectionId} = ${sections.id}
      where ${and(...meetingConditions)}
    )`)
  }

  const examCondition = examSearchCondition(normalized)
  if (examCondition) conditions.push(examCondition)

  const where = and(...conditions)
  const compact = normalized.mode === "autocomplete"
  const normalizedPhrase = searchTerms.join(" ")
  const compactQuery = searchTerms.join("")
  const relevanceOrder =
    query && searchTerms.length > 0
      ? sql<number>`case
          when ${courseOfferings.courseCode} = ${compactQuery} then 0
          when ${courseOfferings.courseCode} like ${`${compactQuery}%`} then 1
          when ${courseOfferings.shortName} = ${normalizedPhrase}
            or ${courseOfferings.nameTh} = ${normalizedPhrase}
            or ${courseOfferings.nameEn} = ${normalizedPhrase} then 2
          when ${courseOfferings.shortName} like ${`${normalizedPhrase}%`}
            or ${courseOfferings.nameTh} like ${`${normalizedPhrase}%`}
            or ${courseOfferings.nameEn} like ${`${normalizedPhrase}%`} then 3
          else 4
        end`
      : null
  const [{ total = 0 } = { total: 0 }] = compact
    ? [{ total: 0 }]
    : await db.select({ total: count() }).from(courseOfferings).where(where)
  const offeringRows = await db
    .select({
      id: courseOfferings.id,
      courseCode: courseOfferings.courseCode,
      shortName: courseOfferings.shortName,
      nameTh: courseOfferings.nameTh,
      nameEn: courseOfferings.nameEn,
      faculty: courseOfferings.faculty,
      department: courseOfferings.department,
      credits: courseOfferings.credits,
      prerequisiteText: courseOfferings.prerequisiteText,
      genEdType: courseOfferings.genEdType,
    })
    .from(courseOfferings)
    .where(where)
    .orderBy(
      ...(relevanceOrder
        ? [relevanceOrder, asc(courseOfferings.courseCode)]
        : [asc(courseOfferings.courseCode)]),
    )
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize)

  const sectionCounts =
    compact || offeringRows.length === 0
      ? []
      : await db
          .select({ offeringId: sections.offeringId, sectionCount: count() })
          .from(sections)
          .where(
            and(
              inArray(
                sections.offeringId,
                offeringRows.map((offering) => offering.id),
              ),
              eq(sections.active, true),
            ),
          )
          .groupBy(sections.offeringId)
  const sectionCountByOffering = new Map(
    sectionCounts.map((row) => [row.offeringId, row.sectionCount]),
  )
  const reviewRows =
    compact || offeringRows.length === 0
      ? []
      : await db
          .select({
            courseCode: courseReviews.courseCode,
            reviewCount: count(),
            reviewAverage: sql<number | null>`avg(${courseReviews.rating})`,
          })
          .from(courseReviews)
          .where(
            inArray(
              courseReviews.courseCode,
              offeringRows.map((offering) => offering.courseCode),
            ),
          )
          .groupBy(courseReviews.courseCode)
  const reviewByCourse = new Map(
    reviewRows.map((row) => [
      row.courseCode,
      { count: Number(row.reviewCount), average: row.reviewAverage },
    ]),
  )
  const rows = offeringRows.map(({ id, ...offering }) => {
    const review = reviewByCourse.get(offering.courseCode)
    return {
      ...offering,
      sectionCount: sectionCountByOffering.get(id) ?? 0,
      reviewCount: review?.count ?? 0,
      reviewAverage: review?.average ?? null,
    }
  })

  return {
    term,
    items: rows,
    page: input.page,
    pageSize: input.pageSize,
    total: compact ? offeringRows.length : total,
    totalPages: compact ? 1 : Math.max(1, Math.ceil(total / input.pageSize)),
  }
}

const searchCache = new TtlLruSingleFlightCache<Awaited<ReturnType<typeof loadSearchCourses>>>({
  maxEntries: 128,
  ttlMs: searchCacheTtlMs,
})

export async function searchCourses(input: CourseSearch) {
  const term = await resolveTerm(input)
  if (!term) return null
  const normalized = normalizeCourseSearch(input)
  return searchCache.getOrLoad(searchCacheKey(term.id, normalized), () =>
    loadSearchCourses(input, term, normalized),
  )
}

export async function courseDetail(courseCode: string, selection: TermSelection) {
  const term = await resolveTerm(selection)
  if (!term) return null
  const [offering] = await db
    .select()
    .from(courseOfferings)
    .where(
      and(
        eq(courseOfferings.termId, term.id),
        eq(courseOfferings.courseCode, courseCode),
        eq(courseOfferings.active, true),
      ),
    )
    .limit(1)
  if (!offering) return null

  const sectionRows = await db
    .select()
    .from(sections)
    .where(and(eq(sections.offeringId, offering.id), eq(sections.active, true)))
  sectionRows.sort((first, second) => compareSectionNo(first.sectionNo, second.sectionNo))
  const meetingRows =
    sectionRows.length === 0
      ? []
      : await db
          .select()
          .from(sectionMeetings)
          .where(
            inArray(
              sectionMeetings.sectionId,
              sectionRows.map((section) => section.id),
            ),
          )
          .orderBy(asc(sectionMeetings.dayCode), asc(sectionMeetings.startMinute))
  const [reviewSummary] = await db
    .select({
      count: count(),
      average: sql<number | null>`avg(${courseReviews.rating})`,
    })
    .from(courseReviews)
    .where(eq(courseReviews.courseCode, courseCode))

  return {
    term,
    offering,
    sections: sectionRows.map((section) => ({
      ...section,
      remainingSeats: Math.max(
        0,
        section.capacity - section.baselineEnrolled - section.localActive,
      ),
      meetings: meetingRows.filter((meeting) => meeting.sectionId === section.id),
    })),
    reviewSummary: {
      count: reviewSummary?.count ?? 0,
      average: reviewSummary?.average ?? null,
    },
  }
}

export async function reviewsForCourse(
  courseCode: string,
  selection: TermSelection,
  page: number,
  pageSize: number,
) {
  const conditions: SQL[] = [eq(courseReviews.courseCode, courseCode)]
  if (selection.academicYear !== undefined || selection.semester !== undefined) {
    const term = await resolveTerm(selection)
    if (!term) return null
    conditions.push(eq(courseReviews.termId, term.id))
  }
  const where = and(...conditions)
  const [{ total = 0 } = { total: 0 }] = await db
    .select({ total: count() })
    .from(courseReviews)
    .where(where)
  const items = await db
    .select({
      reviewId: courseReviews.reviewId,
      rating: courseReviews.rating,
      content: courseReviews.content,
      likeCount: courseReviews.likeCount,
      dislikeCount: courseReviews.dislikeCount,
      academicYear: academicTerms.academicYear,
      semester: academicTerms.semester,
      termLabel: academicTerms.label,
    })
    .from(courseReviews)
    .innerJoin(academicTerms, eq(academicTerms.id, courseReviews.termId))
    .where(where)
    .orderBy(desc(academicTerms.academicYear), desc(academicTerms.semester))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}
