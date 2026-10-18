import { describe, expect, it } from "bun:test"
import {
  courseSearchTerms,
  normalizeCourseSearch,
  searchCacheKey,
  validateExamSearch,
  TtlLruSingleFlightCache,
  termSelectionCacheKey,
} from "./cache"

describe("TtlLruSingleFlightCache", () => {
  it("coalesces concurrent loads and reuses the cached value", async () => {
    const cache = new TtlLruSingleFlightCache<number>({ maxEntries: 2, ttlMs: 1_000 })
    let loads = 0
    let resolveLoad: ((value: number) => void) | undefined
    const loader = () => {
      loads += 1
      return new Promise<number>((resolve) => {
        resolveLoad = resolve
      })
    }

    const first = cache.getOrLoad("same", loader)
    const second = cache.getOrLoad("same", loader)
    await Promise.resolve()
    resolveLoad?.(42)

    expect(await Promise.all([first, second])).toEqual([42, 42])
    expect(await cache.getOrLoad("same", loader)).toBe(42)
    expect(loads).toBe(1)
  })

  it("expires entries and evicts the least recently used value", async () => {
    let now = 0
    const cache = new TtlLruSingleFlightCache<string>({
      maxEntries: 2,
      now: () => now,
      ttlMs: 100,
    })

    await cache.getOrLoad("a", async () => "a1")
    await cache.getOrLoad("b", async () => "b1")
    await cache.getOrLoad("a", async () => "unused")
    await cache.getOrLoad("c", async () => "c1")

    expect(await cache.getOrLoad("b", async () => "b2")).toBe("b2")
    now = 101
    expect(await cache.getOrLoad("c", async () => "c2")).toBe("c2")
  })

  it("does not cache rejected loads", async () => {
    const cache = new TtlLruSingleFlightCache<number>({ maxEntries: 1, ttlMs: 1_000 })
    let loads = 0
    const loader = async () => {
      loads += 1
      if (loads === 1) throw new Error("temporary failure")
      return 7
    }

    await expect(cache.getOrLoad("retry", loader)).rejects.toThrow("temporary failure")
    expect(await cache.getOrLoad("retry", loader)).toBe(7)
    expect(loads).toBe(2)
  })

  it("does not retain more in-flight keys than its configured bound", async () => {
    const cache = new TtlLruSingleFlightCache<number>({ maxEntries: 1, ttlMs: 1_000 })
    let releaseFirst: (() => void) | undefined
    const first = cache.getOrLoad(
      "first",
      () =>
        new Promise<number>((resolve) => {
          releaseFirst = () => resolve(1)
        }),
    )
    await Promise.resolve()

    let overflowLoads = 0
    const loadOverflow = async () => {
      overflowLoads += 1
      return 2
    }
    expect(await cache.getOrLoad("overflow", loadOverflow)).toBe(2)
    expect(await cache.getOrLoad("overflow", loadOverflow)).toBe(2)
    expect(overflowLoads).toBe(2)

    releaseFirst?.()
    expect(await first).toBe(1)
  })
})

describe("catalog cache keys", () => {
  it("normalizes exam filters without sharing class-only or different exam cache entries", () => {
    const base = { page: 1, pageSize: 20 }
    const first = normalizeCourseSearch({
      ...base,
      examDays: "WE, MO,WE",
      examStartTime: "9:00",
      examEndTime: "12:00",
    })
    const same = normalizeCourseSearch({
      ...base,
      examDays: "MO,WE",
      examStartTime: "09:00",
      examEndTime: "12:00",
    })
    expect(first.examDays).toEqual(["MO", "WE"])
    expect(first.examStartMinute).toBe(540)
    expect(first.examEndMinute).toBe(720)
    expect(searchCacheKey(3, first)).toBe(searchCacheKey(3, same))
    for (const other of [
      normalizeCourseSearch(base),
      normalizeCourseSearch({ ...base, days: "MO,WE", startTime: "09:00", endTime: "12:00" }),
      { ...first, examDays: ["TU"] },
      { ...first, examStartMinute: 600 },
      { ...first, examEndMinute: 780 },
    ])
      expect(searchCacheKey(3, first)).not.toBe(searchCacheKey(3, other))
  })

  it("rejects invalid exam days, invalid times and non-positive windows instead of removing constraints", () => {
    for (const input of [
      { examDays: "MO,INVALID" },
      { examDays: "" },
      { examStartTime: "24:00" },
      { examStartTime: "09:60" },
      { examEndTime: "tomorrow" },
      { examEndTime: "" },
      { examStartTime: "12:00", examEndTime: "09:00" },
      { examStartTime: "09:00", examEndTime: "09:00" },
    ]) {
      expect(validateExamSearch(input)).not.toBeNull()
      expect(() => normalizeCourseSearch({ ...input, page: 1, pageSize: 20 })).toThrow(RangeError)
    }
    expect(validateExamSearch({ examDays: "SU", examStartTime: "00:00" })).toBeNull()
    expect(validateExamSearch({ examEndTime: "23:59" })).toBeNull()
    expect(validateExamSearch({})).toBeNull()
  })

  it("normalizes equivalent filter sets and time values", () => {
    const first = normalizeCourseSearch({
      q: "  data  ",
      faculties: "ENG, SCI,ENG",
      departments: "Computer,Math",
      genEdTypes: "SO,INVALID,SC",
      days: "WE,MO,WE",
      startTime: "9:00",
      endTime: "12:00",
      page: 1,
      pageSize: 20,
    })
    const second = normalizeCourseSearch({
      q: "data",
      faculties: "SCI,ENG",
      departments: "Math,Computer",
      genEdTypes: "SC,SO",
      days: "MO,WE",
      startTime: "09:00",
      endTime: "12:00",
      page: 1,
      pageSize: 20,
    })

    expect(searchCacheKey(3, first)).toBe(searchCacheKey(3, second))
    expect(searchCacheKey(4, first)).not.toBe(searchCacheKey(3, second))
    expect(searchCacheKey(3, { ...first, mode: "autocomplete" })).not.toBe(
      searchCacheKey(3, second),
    )
  })

  it("keeps current and explicit term selections separate", () => {
    expect(termSelectionCacheKey({})).toBe("current")
    expect(termSelectionCacheKey({ academicYear: 2569, semester: 1 })).toBe("2569:1")
  })

  it("normalizes multilingual and formatted course-search terms", () => {
    expect(courseSearchTerms("  2301-101  Calculus_II  แคลคูลัส  ")).toEqual([
      "2301",
      "101",
      "calculus",
      "ii",
      "แคลคูลัส",
    ])
    expect(normalizeCourseSearch({ q: "２３０１０１", page: 1, pageSize: 8 }).query).toBe("230101")
  })
})
