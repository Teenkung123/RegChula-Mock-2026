import { describe, expect, it } from "vitest"
import type { MeetingDto, RegistrationDto } from "@regchula/api/public-types"
import { nextClass } from "./next-class"

const meeting = (dayCode = "MO", startMinute = 540, endMinute = 600): MeetingDto => ({
  dayCode,
  startMinute,
  endMinute,
  arranged: false,
  periodLabel: "",
  building: "",
  room: "",
  teachers: [],
})
const registration = (
  code: string,
  meetings: MeetingDto[],
  status: RegistrationDto["status"] = "active",
): RegistrationDto => ({
  registrationId: Number(code),
  courseCode: code,
  nameTh: "วิชา",
  nameEn: "Course",
  sectionId: Number(code),
  offeringId: Number(code),
  sectionNo: "1",
  credits: 3,
  status,
  meetings,
})

describe("next class in Bangkok", () => {
  const first = registration("1", [meeting()])
  const second = registration("2", [meeting("MO", 600, 660)])
  it("previews the earliest future class while preserving the current one", () => {
    const overlap = registration("3", [meeting("MO", 550, 610)])
    const result = nextClass([second, overlap, first], new Date("2026-09-14T02:05:00Z"))
    expect(result?.registration.courseCode).toBe("1")
    expect(result?.following?.registration.courseCode).toBe("3")
    expect(result?.following?.inProgress).toBe(false)
    expect(
      nextClass([first, second, overlap], new Date("2026-09-14T02:20:00Z"))?.following?.registration
        .courseCode,
    ).toBe("2")
    expect(nextClass([first], new Date("2026-09-14T02:20:00Z"))?.following).toBeNull()
    expect(nextClass([first, second], new Date("2026-09-14T01:00:00Z"))?.following).toBeNull()
  })
  it("moves from upcoming to in progress to the adjacent class at exact minute boundaries", () => {
    const before = nextClass([second, first], new Date("2026-09-14T01:59:30Z"))
    expect(before?.registration.courseCode).toBe("1")
    expect(before?.inProgress).toBe(false)
    expect(before?.startsAt).toBe(Date.parse("2026-09-14T02:00:00Z"))
    expect(nextClass([first, second], new Date("2026-09-14T02:00:00Z"))?.inProgress).toBe(true)
    const boundary = nextClass([first, second], new Date("2026-09-14T03:00:00Z"))
    expect(boundary?.registration.courseCode).toBe("2")
    expect(boundary?.inProgress).toBe(true)
  })
  it("rolls over Sunday and uses Bangkok's date rather than the UTC/device date", () => {
    const midnight = registration("3", [meeting("MO", 0, 60)])
    const next = nextClass([midnight], new Date("2026-09-13T16:30:00Z"))
    expect(next?.startsAt).toBe(Date.parse("2026-09-13T17:00:00Z"))
    expect(nextClass([midnight], new Date("2026-09-13T17:30:00Z"))?.inProgress).toBe(true)
    expect(nextClass([first], new Date("2026-09-14T03:00:00Z"))?.startsAt).toBe(
      Date.parse("2026-09-21T02:00:00Z"),
    )
  })
  it("ignores inactive, arranged, incomplete, and invalid meetings", () => {
    expect(
      nextClass(
        [
          registration("1", [meeting()], "dropped"),
          registration("2", [{ ...meeting(), arranged: true }]),
          registration("3", [{ ...meeting(), startMinute: null }]),
          registration("4", [
            meeting("XX"),
            meeting("MO", 600, 540),
            meeting("MO", -1, 60),
            meeting("MO", 540, 1500),
          ]),
        ],
        new Date("2026-09-14T01:00:00Z"),
      ),
    ).toBeNull()
    expect(nextClass([], new Date())).toBeNull()
    expect(nextClass([first], new Date(Number.NaN))).toBeNull()
  })
  it("prioritizes current classes and reports overlapping courses without duplicate meetings", () => {
    const overlap = registration("3", [meeting("MO", 570, 630), meeting("MO", 570, 630)])
    const result = nextClass([second, overlap, first], new Date("2026-09-14T02:45:00Z"))
    expect(result?.registration.courseCode).toBe("1")
    expect(result?.overlappingCourses).toBe(1)
    expect(result?.endsAt).toBe(Date.parse("2026-09-14T03:00:00Z"))
  })
  it("preserves supported snake-case meeting times and chooses the nearest meeting of a course", () => {
    const alternate = {
      arranged: false,
      day_code: "MO",
      start_minute: 600,
      end_minute: 660,
    } as MeetingDto
    const result = nextClass(
      [registration("1", [meeting("WE"), alternate])],
      new Date("2026-09-14T02:00:00Z"),
    )
    expect(result?.startsAt).toBe(Date.parse("2026-09-14T03:00:00Z"))
  })
})
