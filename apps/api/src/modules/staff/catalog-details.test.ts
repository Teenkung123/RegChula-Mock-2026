import { describe, expect, it } from "bun:test"
import type { PoolConnection } from "mysql2/promise"
import {
  applySectionDetails,
  type CurrentExamDetails,
  validateOfferingDetails,
  validateSectionMeetingIds,
  validateSectionDetails,
} from "./catalog-details"

const exams: CurrentExamDetails = {
  midterm_date: "2026-02-21",
  midterm_start_minute: 540,
  midterm_end_minute: 600,
  final_date: null,
  final_start_minute: null,
  final_end_minute: null,
}

describe("staff course details", () => {
  it("validates partial exam changes against the existing date and times", () => {
    expect(validateOfferingDetails({ midtermEndMinute: 630 }, exams)).toBeNull()
    expect(validateOfferingDetails({ midtermEndMinute: 539 }, exams)).not.toBeNull()
    expect(validateOfferingDetails({ finalDate: "2026-02-28" }, exams)).not.toBeNull()
    expect(validateOfferingDetails({ finalDate: "2026-02-30", finalStartMinute: 540, finalEndMinute: 600 }, exams)).not.toBeNull()
    expect(validateOfferingDetails({ midtermDate: null, midtermStartMinute: null, midtermEndMinute: null }, exams)).toBeNull()
  })

  it("accepts arranged meetings and rejects incomplete or reversed schedules", () => {
    const arranged = { classType: "LECT", dayCode: "MO" as const, startMinute: null, endMinute: null, building: null, room: null, teachers: ["Advisor"] }
    expect(validateSectionDetails({ meetings: [arranged] })).toBeNull()
    expect(validateSectionDetails({ meetings: [{ ...arranged, startMinute: 540 }] })).not.toBeNull()
    expect(validateSectionDetails({ meetings: [{ ...arranged, startMinute: 600, endMinute: 540 }] })).not.toBeNull()
    expect(validateSectionDetails({ meetings: [{ ...arranged, dayCode: null, startMinute: 540, endMinute: 600 }] })).not.toBeNull()
  })

  it("preserves unchanged meeting IDs and updates only changed, removed, and new rows", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const existing = [
      { id: 1, class_type: "LECT", day_code: "MO", start_minute: 540, end_minute: 600, building: "A", room: "101", teachers: ["A"] },
      { id: 2, class_type: "LAB", day_code: "TU", start_minute: 600, end_minute: 660, building: null, room: null, teachers: [] },
      { id: 3, class_type: "LAB", day_code: "WE", start_minute: 600, end_minute: 660, building: null, room: null, teachers: [] },
    ]
    const connection = { execute: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values })
      return sql.includes("SELECT id") ? [existing, []] : [[], []]
    } } as unknown as PoolConnection
    await applySectionDetails(connection, 42, { meetings: [
      { id: 1, classType: "LECT", dayCode: "MO", startMinute: 540, endMinute: 600, building: "A", room: "101", teachers: ["A"] },
      { id: 2, classType: "LAB", dayCode: "TU", startMinute: 600, endMinute: 660, building: null, room: "201", teachers: [] },
      { classType: "LECT", dayCode: "FR", startMinute: 540, endMinute: 600, building: "B", room: "102", teachers: [" A ", "A"] },
    ] })
    expect(calls).toHaveLength(4)
    expect(calls[1]?.sql).toContain("DELETE FROM section_meetings")
    expect(calls[1]?.values).toEqual([42, 3])
    expect(calls[2]?.sql).toContain("UPDATE section_meetings")
    expect(calls[2]?.values.slice(-2)).toEqual([42, 2])
    expect(calls[3]?.sql).toContain("INSERT INTO section_meetings")
    expect(calls[3]?.values).toEqual(["LECT", "FR", 540, 600, "09:00–10:00", "B", "102", '["A"]', false, 42])
  })

  it("rejects duplicate and foreign meeting IDs before making any updates", async () => {
    const calls: string[] = []
    const connection = { execute: async (sql: string) => { calls.push(sql); return [[{ id: 1 }], []] } } as unknown as PoolConnection
    const meeting = { id: 1, classType: "LECT", dayCode: "MO" as const, startMinute: null, endMinute: null, building: null, room: null, teachers: [] }
    expect(await validateSectionMeetingIds(connection, 42, { meetings: [meeting, meeting] })).not.toBeNull()
    expect(await validateSectionMeetingIds(connection, 42, { meetings: [{ ...meeting, id: 2 }] })).not.toBeNull()
    await expect(applySectionDetails(connection, 42, { note: "Changed", meetings: [{ ...meeting, id: 2 }] })).rejects.toThrow()
    expect(calls.every((sql) => sql.includes("SELECT"))).toBe(true)
  })
})
