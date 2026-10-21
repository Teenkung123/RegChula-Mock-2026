import type { RegistrationDto } from "@regchula/api/public-types"
import { describe, expect, it } from "vitest"
import navigationData from "../../public/campus/navigation-data.json"
import {
  type CampusBuilding,
  type CampusData,
  classTransitions,
  makeCampusGraph,
  resolveBuilding,
  roomFloor,
  walkingRoute,
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
  it("routes MHMK to PINIT through the documented tunnel and reviewed approaches", () => {
    const campus = navigationData as CampusData
    const from = resolveBuilding(campus.buildings, "MHMK")!
    const to = resolveBuilding(campus.buildings, "PINIT")!
    const graph = makeCampusGraph(campus)
    const route = walkingRoute(graph, from.accessNodeId, to.accessNodeId)!
    expect(route.distanceM).toBeCloseTo(441.049, 3)
    expect(route.distanceM).toBeLessThan(946.561 / 2)
    expect(route).toMatchObject({
      hasTunnel: true,
      hasSteps: true,
      usesPedestrianArea: true,
      accessNoteRequired: true,
      minutes: 7,
    })
    expect(route.points.some((point) => point.elevationM === -3)).toBe(true)
    expect(walkingRoute(graph, to.accessNodeId, from.accessNodeId)?.distanceM).toBeCloseTo(
      route.distanceM,
      3,
    )
    const tab = resolveBuilding(campus.buildings, "TAB")!
    expect(walkingRoute(graph, from.accessNodeId, tab.accessNodeId)?.distanceM).toBeCloseTo(
      192.227,
      3,
    )
  })
  it("never joins crossings by coordinates, including isolated source-node grades", () => {
    const graph = makeCampusGraph({
      ...data,
      nodes: [
        { id: "a", x: -1, y: 0 },
        { id: "surface", x: 0, y: 0, elevationM: 0 },
        { id: "surface@-1", x: 0, y: 0, elevationM: -3 },
        { id: "c", x: 1, y: 0 },
      ],
      edges: [
        { a: "a", b: "surface", lengthM: 1, highway: "footway" },
        { a: "surface@-1", b: "c", lengthM: 1, highway: "footway", tunnel: "yes" },
      ],
    })
    expect(walkingRoute(graph, "a", "c")).toBeNull()
    expect(walkingRoute(graph, "surface", "surface@-1")).toBeNull()
  })
  it("preserves access and structure metadata without treating building passages as tunnels", () => {
    const graph = makeCampusGraph({
      ...data,
      edges: [
        { a: "a", b: "b", lengthM: 1, highway: "footway", tunnel: "building_passage" },
        { a: "b", b: "c", lengthM: 1, highway: "footway", bridge: "yes", accessNoteRequired: true },
      ],
    })
    expect(walkingRoute(graph, "a", "b")).toMatchObject({
      hasTunnel: false,
      accessNoteRequired: false,
    })
    expect(walkingRoute(graph, "a", "c")).toMatchObject({
      hasBridge: true,
      accessNoteRequired: true,
    })
  })
  it("rejects non-finite coordinates and elevations before routing", () => {
    const graph = makeCampusGraph({
      ...data,
      nodes: [
        data.nodes[0]!,
        { id: "b", x: NaN, y: 0 },
        { id: "c", x: 2, y: 0, elevationM: Infinity },
      ],
    })
    expect(walkingRoute(graph, "a", "b")).toBeNull()
    expect(walkingRoute(graph, "a", "c")).toBeNull()
  })
  it("renders two-node bridges above ground without adding graph shortcuts or distance", () => {
    const graph = makeCampusGraph({
      ...data,
      edges: [{ a: "a", b: "c", lengthM: 100, highway: "footway", bridge: "yes", layer: "1" }],
    })
    const route = walkingRoute(graph, "a", "c")!
    expect(route.distanceM).toBe(100)
    expect(route.hasBridge).toBe(true)
    expect(route.points.map((point) => point.elevationM ?? 0)).toEqual([0, 5, 5, 0])
    expect(graph.nodes.size).toBe(4)
    expect(graph.adjacency.get("a")).toHaveLength(1)
  })

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
  it("resolves PHOTO501 to its evidenced campus footprint and an existing route from MHMK M02", () => {
    const campus = navigationData as CampusData
    const from = resolveBuilding(campus.buildings, "MHMK", "M02")
    const to = resolveBuilding(campus.buildings, "PHOTO501")
    expect(from).not.toBeNull()
    expect(to).not.toBeNull()
    if (!from || !to) throw new Error("Expected both evidenced classroom buildings to resolve")
    expect(to.code).toBe("PHOTO")
    expect(to).toMatchObject({
      footprintId: "way/158060547",
      accessNodeId: "10064566029",
      accessConfidence: "nearest_mapped_path_not_verified_entrance",
    })
    expect(resolveBuilding(campus.buildings, "PHOTO 501")).toBe(to)
    expect(resolveBuilding(campus.buildings, "", "PHOTO501")).toBe(to)
    expect(resolveBuilding(campus.buildings, "PHOTO", "501")).toBe(to)
    expect(resolveBuilding(campus.buildings, to.nameTh ?? "")).toBe(to)
    const route = walkingRoute(makeCampusGraph(campus), from.accessNodeId, to.accessNodeId)
    expect(route?.distanceM).toBeGreaterThan(0)
    expect(route?.points[0]?.id).toBe(from.accessNodeId)
    expect(route?.points.at(-1)?.id).toBe(to.accessNodeId)
    // The outdoor location evidence does not establish a classroom floor convention.
    expect(roomFloor(to, "501")).toBeNull()
  })
  it("coalesces evidenced alternate codes onto one footprint and keeps unknown codes unresolved", () => {
    const campus = navigationData as CampusData
    expect(resolveBuilding(campus.buildings, "SCI25")?.code).toBe("MHMK")
    expect(resolveBuilding(campus.buildings, "BSB2")?.code).toBe("BSB")
    expect(resolveBuilding(campus.buildings, "PRAJ7 201")?.code).toBe("PRAJ2")
    expect(resolveBuilding(campus.buildings, "VISID")?.code).toBe("VSID3")
    expect(resolveBuilding(campus.buildings, "UNKNOWN", "PHOTO501")).toBeNull()
    expect(new Set(campus.buildings.map((building) => building.code)).size).toBe(
      campus.buildings.length,
    )
    const nodes = new Set(campus.nodes.map((node) => node.id))
    expect(campus.buildings.every((building) => nodes.has(building.accessNodeId))).toBe(true)
  })
  it("resolves exact building aliases and concatenated rooms, never unknown codes", () => {
    expect(resolveBuilding(buildings, "tab", "220")?.code).toBe("TAB")
    expect(resolveBuilding(buildings, "", "TAB220")?.code).toBe("TAB")
    expect(resolveBuilding(buildings, "UNKNOWN", "TAB220")).toBeNull()
    expect(resolveBuilding(buildings, "", "TABBY")).toBeNull()
  })
  it("accepts combined labels and exact names without accepting trailing text", () => {
    expect(resolveBuilding(buildings, "TAB 220")?.code).toBe("TAB")
    expect(resolveBuilding(buildings, "MHMKM01")?.code).toBe("MHMK")
    expect(resolveBuilding(buildings, "Mahamakut")?.code).toBe("MHMK")
    expect(resolveBuilding(buildings, "TAB220UNKNOWN", "TAB220")).toBeNull()
    expect(resolveBuilding(buildings, "UNKNOWN220", "TAB220")).toBeNull()
    expect(resolveBuilding(buildings, "", "TAB220UNKNOWN")).toBeNull()
  })
  it("rejects ambiguous aliases, combined prefixes and names", () => {
    const first = buildings[0]
    if (!first) throw new Error("Expected the TAB building fixture")
    const ambiguous = [
      ...buildings,
      { ...first, code: "OTHER", aliases: ["TAB"], name: "Mahamakut" },
    ]
    expect(resolveBuilding(ambiguous, "TAB")).toBeNull()
    expect(resolveBuilding(ambiguous, "TAB220")).toBeNull()
    expect(resolveBuilding(ambiguous, "", "TAB220")).toBeNull()
    expect(resolveBuilding(ambiguous, "Mahamakut")).toBeNull()
    expect(
      resolveBuilding([...buildings, { ...first, code: "TAB2", aliases: [] }], "TAB220"),
    ).toBeNull()
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
    expect(rows[0]?.departureMinute).toBe(590)
    expect(rows[0]?.walkingMinutes).toBe(70)
  })
  it("allows ten estimated walking minutes for adjacent classes without changing scheduled times", () => {
    const rows = classTransitions([registration(1, 540, 600), registration(2, 600, 660)])
    expect(rows[0]).toMatchObject({ gapMinutes: 0, departureMinute: 590, walkingMinutes: 10 })
    expect(rows[0]?.from.end).toBe(600)
    expect(rows[0]?.to.start).toBe(600)
  })
  it("caps early departure at the start of a short class", () => {
    const rows = classTransitions([registration(1, 540, 545), registration(2, 545, 600)])
    expect(rows[0]).toMatchObject({ gapMinutes: 0, departureMinute: 540, walkingMinutes: 5 })
  })
  it("retains scheduled overlaps even when an early departure provides walking time", () => {
    const rows = classTransitions([registration(1, 540, 605), registration(2, 600, 660)])
    expect(rows[0]).toMatchObject({ gapMinutes: -5, departureMinute: 595, walkingMinutes: 5 })
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
    expect(rows[0]?.walkingMinutes).toBe(-50)
  })
})
