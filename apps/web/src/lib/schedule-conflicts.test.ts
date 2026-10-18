import { describe, expect, it } from "vitest"
import { examSlotsClash, meetingsClash } from "./schedule-conflicts"

describe("timetable warnings", () => {
  it("compares equal-valued Date objects revived by Eden as the same exam day", () => {
    const first = {
      date: new Date("2026-11-20T00:00:00.000Z") as unknown as string,
      startMinute: 540,
      endMinute: 660,
    }
    const second = {
      date: new Date("2026-11-20T00:00:00.000Z") as unknown as string,
      startMinute: 570,
      endMinute: 660,
    }
    expect(examSlotsClash(first, second)).toBe(true)
    expect(examSlotsClash(first, { ...second, startMinute: 660, endMinute: 720 })).toBe(false)
    expect(examSlotsClash(first, { ...second, date: "2026-11-21" })).toBe(false)
    expect(examSlotsClash(first, null)).toBe(false)
  })
  it("keeps adjacent and arranged class meetings out of overlap warnings", () => {
    const first = {
      dayCode: "MO",
      startMinute: 540,
      endMinute: 600,
      arranged: false,
      room: null,
      building: null,
      teachers: null,
    }
    expect(meetingsClash(first, { ...first, startMinute: 570, endMinute: 630 })).toBe(true)
    expect(meetingsClash(first, { ...first, startMinute: 600, endMinute: 660 })).toBe(false)
    expect(meetingsClash(first, { ...first, arranged: true })).toBe(false)
  })
})
