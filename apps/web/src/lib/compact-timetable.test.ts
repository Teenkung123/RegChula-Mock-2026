import { describe, expect, it } from "vitest"
import { compactTimetableAxis } from "./compact-timetable"

describe("compact timetable axis", () => {
  it("narrows only hours unused across all meetings and keeps end boundaries exclusive", () => {
    const axis = compactTimetableAxis(
      [8, 9, 10, 11],
      [
        { startMinute: 540, endMinute: 600 },
        { startMinute: 675, endMinute: 690 },
      ],
    )
    expect(axis.weights).toEqual([2.5, 6, 2.5, 6])
    expect(axis.offset(480)).toBe(0)
    expect(axis.offset(720)).toBe(100)
    expect(axis.offset(600)).toBeCloseTo((8.5 / 17) * 100)
  })
  it("aligns partial-hour and multi-hour blocks to the weighted grid", () => {
    const axis = compactTimetableAxis([8, 9, 10, 11], [{ startMinute: 570, endMinute: 675 }])
    expect(axis.weights).toEqual([2.5, 6, 6, 6])
    expect(axis.offset(570)).toBeCloseTo((5.5 / 20.5) * 100)
    expect(axis.offset(675)).toBeCloseTo((16 / 20.5) * 100)
    expect(axis.offset(100)).toBe(0)
    expect(axis.offset(1500)).toBe(100)
  })
  it("keeps every empty hour in the axis", () => {
    const axis = compactTimetableAxis([8, 9, 10], [])
    expect(axis.weights).toEqual([2.5, 2.5, 2.5])
    expect(axis.offset(540)).toBeCloseTo(100 / 3)
    expect(compactTimetableAxis([], []).offset(0)).toBe(0)
  })
})
