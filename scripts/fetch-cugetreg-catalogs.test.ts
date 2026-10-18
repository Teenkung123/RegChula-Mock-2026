import { describe, expect, it } from "bun:test"
import {
  availableCatalogTerms,
  catalogTermKey,
  catalogTermLabel,
  mergeCoursePage,
} from "./fetch-cugetreg-catalogs"

describe("CUGetReg catalog fetch", () => {
  it("covers every selector term from 2564 through 2569", () => {
    expect(availableCatalogTerms).toHaveLength(18)
    expect(
      catalogTermKey(availableCatalogTerms[0] as { academicYear: number; semester: number }),
    ).toBe("2569/3")
    expect(
      catalogTermKey(availableCatalogTerms.at(-1) as { academicYear: number; semester: number }),
    ).toBe("2564/1")
    expect(catalogTermLabel({ academicYear: 2569, semester: 3 })).toBe("2569/ฤดูร้อน")
  })

  it("deduplicates identical courses and rejects conflicting duplicates", () => {
    const courses = new Map()
    expect(mergeCoursePage(courses, [{ courseNo: "2301101" }])).toBe(1)
    expect(mergeCoursePage(courses, [{ courseNo: "2301101" }])).toBe(0)
    expect(() => mergeCoursePage(courses, [{ courseNo: "2301101", abbrName: "CALC I" }])).toThrow(
      "conflicting duplicate course 2301101",
    )
  })
})
