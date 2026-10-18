import {
  defaultScheduleColor,
  SCHEDULE_COLOR_IDS,
  SCHEDULE_COLOR_PALETTE,
} from "@regchula/appearance"
import { describe, expect, it } from "vitest"
import { courseColorStyle } from "./course-colors"

describe("course schedule colors", () => {
  it("assigns stable valid defaults while reserving red for conflicts", () => {
    expect(defaultScheduleColor("2301107")).toBe(defaultScheduleColor("2301107"))
    expect(SCHEDULE_COLOR_IDS).toContain(defaultScheduleColor("2301107"))
    expect(new Set(Object.values(SCHEDULE_COLOR_PALETTE)).size).toBe(SCHEDULE_COLOR_IDS.length)
    expect(
      Object.values(SCHEDULE_COLOR_PALETTE).every((color) => /^#[\da-f]{6}$/i.test(color)),
    ).toBe(true)
  })

  it("pairs every course color with readable ink for solid schedule labels", () => {
    for (const id of SCHEDULE_COLOR_IDS) {
      const style = courseColorStyle(id)
      expect(style["--course-color"]).toBe(SCHEDULE_COLOR_PALETTE[id])
      expect(["#151116", "#ffffff"]).toContain(style["--course-ink"])
    }
  })
})
