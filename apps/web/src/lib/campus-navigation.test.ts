import { describe, expect, it } from "vitest"
import type { RegistrationDto } from "@regchula/api/public-types"
import {
  classTransitions,
  makeCampusGraph,
  resolveBuilding,
  roomFloor,
  walkingRoute,
  type CampusData,
  type CampusBuilding,
} from "./campus-navigation"

const buildings: CampusBuilding[] = [
  {
    code: "TAB",
    aliases: ["TAB"],
    name: "Tab",
    x: 0,
    y: 0,
    accessNodeId: "a",
    accessLabel: "Approximate",
    accessConfidence: "approximate",
    source: "source",
    floorCountOfficial: 4,
    verifiedRooms: [{ room: "220", floor: "2" }],
  },
  {
    code: "MHMK",
    aliases: ["MHMK"],
    name: "Mahamakut",
    x: 2,
    y: 0,
    accessNodeId: "c",
    accessLabel: "Approximate",
    accessConfidence: "approximate",
    source: "source",
    floorCountOfficial: 19,
    roomParsing: { strategy: "verified_mapping_then_building_fallback" },
    verifiedRooms: [{ room: "M01", floor: "M" }],
  },
]
const data: CampusData = {
  nodes: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 1, y: 0 },
    { id: "c", x: 2, y: 0 },
    { id: "d", x: 3, y: 0 },
  ],
  edges: [
    { a: "a", b: "b", lengthM: 72, highway: "footway" },
    { a: "b", b: "c", lengthM: 73, highway: "steps", oneway: "yes" },
  ],
  buildings,
  metadata: {},
}
const registration = (id: number, start: number, end: number, extras = {}): RegistrationDto => ({
  registrationId: id,
  courseCode: String(id),
  nameEn: "Class",
  nameTh: "",
  credits: 3,
  status: "active",
  offeringId: id,
  sectionId: id,
  sectionNo: "1",
  meetings: [
    {
      dayCode: "MO",
      startMinute: start,
      endMinute: end,
      arranged: false,
      building: "TAB",
      room: "220",
      teachers: null,
      ...extras,
    },
  ],
})
describe("campus walking graph", () => {
  it("uses network length and round-up time, preserving stairs", () => {
    const route = walkingRoute(makeCampusGraph(data), "a", "c")!
    expect(route.distanceM).toBe(145)
    expect(route.minutes).toBe(3)
    expect(route.points.map((point) => point.id)).toEqual(["a", "b", "c"])
    expect(route.hasSteps).toBe(true)
  })
  it("respects pedestrian one-way and disconnected components without straight-line fallback", () => {
    const graph = makeCampusGraph(data)
    expect(walkingRoute(graph, "c", "a")).toBeNull()
    expect(walkingRoute(graph, "a", "d")).toBeNull()
    expect(walkingRoute(graph, "a", "missing")).toBeNull()
  })
  it("handles same access point and reverse one-way", () => {
    expect(walkingRoute(makeCampusGraph(data), "a", "a")?.distanceM).toBe(0)
    const graph = makeCampusGraph({
      ...data,
      edges: [{ a: "a", b: "b", lengthM: 2, highway: "footway", oneway: "-1" }],
    })
    expect(walkingRoute(graph, "a", "b")).toBeNull()
    expect(walkingRoute(graph, "b", "a")?.distanceM).toBe(2)
  })
  it("ignores invalid graph edges", () => {
    const graph = makeCampusGraph({
      ...data,
      edges: [
        { a: "a", b: "missing", lengthM: 2, highway: "footway" },
        { a: "a", b: "c", lengthM: -1, highway: "footway" },
      ],
    })
    expect(walkingRoute(graph, "a", "c")).toBeNull()
  })
})
describe("building and floor resolution", () => {
  it("resolves exact building aliases and concatenated rooms, never unknown codes", () => {
    expect(resolveBuilding(buildings, "tab", "220")?.code).toBe("TAB")
    expect(resolveBuilding(buildings, "", "TAB220")?.code).toBe("TAB")
    expect(resolveBuilding(buildings, "UNKNOWN", "TAB220")).toBeNull()
    expect(resolveBuilding(buildings, "", "TABBY")).toBeNull()
  })
  it("prefers official exceptional floors and bounded user convention", () => {
    expect(roomFloor(buildings[1]!, "MHMK M01")).toEqual({ floor: "M", inferred: false })
    expect(roomFloor(buildings[0]!, "TAB220")).toEqual({ floor: "2", inferred: false })
    expect(roomFloor(buildings[0]!, "399")).toEqual({ floor: "3", inferred: true })
    expect(roomFloor(buildings[0]!, "901")).toBeNull()
    expect(roomFloor(buildings[1]!, "301")).toBeNull()
    expect(roomFloor({ ...buildings[0]!, floorCountOfficial: 20 }, "1201")).toEqual({
      floor: "12",
      inferred: true,
    })
  })
})
describe("timetable transitions", () => {
  it("orders active meetings per day without joining days", () => {
    const rows = classTransitions([
      registration(2, 660, 720),
      registration(1, 540, 600),
      registration(3, 500, 550, { dayCode: "TU" }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.from.courseCode).toBe("1")
    expect(rows[0]?.gapMinutes).toBe(60)
  })
  it("preserves overlapping transitions and excludes arranged, invalid and dropped classes", () => {
    const rows = classTransitions([
      registration(1, 540, 660),
      registration(2, 600, 720),
      registration(3, 720, 730, { arranged: true }),
      registration(4, 800, 700),
      { ...registration(5, 740, 760), status: "dropped" },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.gapMinutes).toBe(-60)
  })
})
