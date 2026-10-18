import { describe, expect, it } from "vitest"
import { occupiedSeatCount, sectionSeatLabel } from "./section-seats"

describe("section seat labels", () => {
  it("shows occupied seats over capacity instead of remaining seats", () => {
    const section = {
      sectionNo: "1",
      capacity: 70,
      baselineEnrolled: 67,
      localActive: 1,
    }

    expect(occupiedSeatCount(section)).toBe(68)
    expect(sectionSeatLabel(section)).toBe("ตอน 1 · 68/70")
  })
})
