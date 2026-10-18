interface CacheEntry<Value> {
  expiresAt: number
  value: Value
}

interface TtlLruCacheOptions {
  maxEntries: number
  now?: () => number
  ttlMs: number
}

export class TtlLruSingleFlightCache<Value> {
  private readonly entries = new Map<string, CacheEntry<Value>>()
  private readonly inFlight = new Map<string, Promise<Value>>()
  private readonly maxEntries: number
  private readonly now: () => number
  private readonly ttlMs: number

  constructor({ maxEntries, now = Date.now, ttlMs }: TtlLruCacheOptions) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error("maxEntries must be a positive integer")
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("ttlMs must be positive")
    }
    this.maxEntries = maxEntries
    this.now = now
    this.ttlMs = ttlMs
  }

  async getOrLoad(key: string, loader: () => Promise<Value>): Promise<Value> {
    const cached = this.entries.get(key)
    if (cached && cached.expiresAt > this.now()) {
      this.entries.delete(key)
      this.entries.set(key, cached)
      return cached.value
    }
    if (cached) this.entries.delete(key)

    const activeLoad = this.inFlight.get(key)
    if (activeLoad) return activeLoad
    if (this.inFlight.size >= this.maxEntries) return loader()

    const pending = Promise.resolve().then(loader)
    this.inFlight.set(key, pending)
    try {
      const value = await pending
      this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value })
      while (this.entries.size > this.maxEntries) {
        const oldestKey = this.entries.keys().next().value
        if (oldestKey === undefined) break
        this.entries.delete(oldestKey)
      }
      return value
    } finally {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key)
    }
  }
}

interface SearchNormalizationInput {
  courseGroup?: "general" | "other"
  credits?: number
  day?: string
  days?: string
  department?: string
  departments?: string
  endTime?: string
  examDays?: string
  examStartTime?: string
  examEndTime?: string
  faculties?: string
  faculty?: string
  genEdTypes?: string
  maxCredits?: number
  minCredits?: number
  mode?: "autocomplete"
  page: number
  pageSize: number
  q?: string
  startTime?: string
}

export interface NormalizedCourseSearch {
  courseGroup: "general" | "other" | null
  credits: number | null
  days: string[]
  departmentIds: string[]
  endMinute: number | null
  examDays: string[]
  examStartMinute: number | null
  examEndMinute: number | null
  facultyIds: string[]
  genEdTypes: string[]
  maxCredits: number | null
  minCredits: number | null
  mode: "autocomplete" | null
  page: number
  pageSize: number
  query: string | null
  startMinute: number | null
}

const courseDayCodes = new Set(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])
const genEdCodes = new Set(["SC", "SO", "HU", "IN", "NO"])
const maximumSearchTerms = 12
const searchTermPattern = /[\p{L}\p{M}\p{N}]+/gu

export function courseSearchTerms(value: string): string[] {
  const terms = value.normalize("NFKC").toLowerCase().match(searchTermPattern) ?? []
  return [...new Set(terms)].slice(0, maximumSearchTerms)
}

function csvValues(value?: string, maximum = 40): string[] {
  if (!value) return []
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
    .slice(0, maximum)
    .sort()
}

function toMinute(value?: string): number | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

export function validateExamSearch(input: {
  examDays?: string
  examStartTime?: string
  examEndTime?: string
}): string | null {
  if (input.examDays?.split(",").some((day) => !courseDayCodes.has(day.trim()))) {
    return "Exam weekdays must be MO, TU, WE, TH, FR, SA, or SU."
  }
  const start = toMinute(input.examStartTime)
  const end = toMinute(input.examEndTime)
  if (
    (input.examStartTime !== undefined && start === null) ||
    (input.examEndTime !== undefined && end === null)
  ) {
    return "Exam times must be valid 24-hour times (HH:mm)."
  }
  if (start !== null && end !== null && start >= end) {
    return "The exam end time must be later than the start time."
  }
  return null
}

export function normalizeCourseSearch(input: SearchNormalizationInput): NormalizedCourseSearch {
  const examError = validateExamSearch(input)
  if (examError) throw new RangeError(examError)
  const query = input.q?.normalize("NFKC").trim().replace(/\s+/gu, " ")
  return {
    query: query || null,
    facultyIds: csvValues(input.faculties || input.faculty),
    departmentIds: csvValues(input.departments || input.department),
    genEdTypes: csvValues(input.genEdTypes, 5).filter((value) => genEdCodes.has(value)),
    courseGroup: input.courseGroup ?? null,
    days: csvValues(input.days || input.day, 7).filter((value) => courseDayCodes.has(value)),
    startMinute: toMinute(input.startTime),
    endMinute: toMinute(input.endTime),
    examDays: csvValues(input.examDays, 7),
    examStartMinute: toMinute(input.examStartTime),
    examEndMinute: toMinute(input.examEndTime),
    credits: input.credits ?? null,
    minCredits: input.minCredits ?? null,
    maxCredits: input.maxCredits ?? null,
    mode: input.mode ?? null,
    page: input.page,
    pageSize: input.pageSize,
  }
}

export function searchCacheKey(termId: number, search: NormalizedCourseSearch): string {
  return JSON.stringify([
    termId,
    search.query,
    search.facultyIds,
    search.departmentIds,
    search.genEdTypes,
    search.courseGroup,
    search.days,
    search.startMinute,
    search.endMinute,
    search.examDays,
    search.examStartMinute,
    search.examEndMinute,
    search.credits,
    search.minCredits,
    search.maxCredits,
    search.mode,
    search.page,
    search.pageSize,
  ])
}

export function termSelectionCacheKey(selection: {
  academicYear?: number
  semester?: number
}): string {
  return selection.academicYear === undefined && selection.semester === undefined
    ? "current"
    : `${selection.academicYear ?? "missing"}:${selection.semester ?? "missing"}`
}
