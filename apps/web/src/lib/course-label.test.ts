import { describe, expect, it } from "vitest"
import { courseSearchText } from "./course-label"

describe("course search text", () => {
  it("includes the code, abbreviation, Thai name, and English name", () => {
    expect(
      courseSearchText({
        courseCode: "2301101",
        shortName: "CALCULUS I",
        nameTh: "แคลคูลัส 1",
        nameEn: "CALCULUS ONE",
      }),
    ).toBe("2301101 CALCULUS I แคลคูลัส 1 CALCULUS ONE")
  })

  it("omits blank and duplicate names", () => {
    expect(
      courseSearchText({
        courseCode: "2301101",
        shortName: "CALCULUS I",
        nameTh: "",
        nameEn: "CALCULUS I",
      }),
    ).toBe("2301101 CALCULUS I")
  })
})
