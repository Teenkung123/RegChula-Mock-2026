import type { MeetingDto, RegistrationDto } from "@regchula/api/public-types"

export type CampusNode = { id: string; x: number; y: number }
export type CampusEdge = {
  a: string
  b: string
  lengthM: number
  highway: string
  oneway?: string
  crossing?: boolean
  sharedRoad?: boolean
}
export type CampusBuilding = {
  code: string
  footprintId?: string
  aliases: string[]
  name: string
  nameTh?: string
  x: number
  y: number
  accessNodeId: string
  accessLabel: string
  accessConfidence: string
  codeConfidence?: string
  source: string
  verifiedRooms?: Array<{ room: string; floor: string }>
  floorCountOfficial?: number
  floorCount?: number
  roomParsing?: { strategy: string; reason?: string }
}
export type CampusData = {
  nodes: CampusNode[]
  edges: CampusEdge[]
  buildings: CampusBuilding[]
  metadata: Record<string, unknown>
}
export type ClassStop = {
  id: string
  courseCode: string
  name: string
  day: string
  start: number
  end: number
  building: string
  room: string
}
export type ClassTransition = {
  id: string
  from: ClassStop
  to: ClassStop
  /** Scheduled gap, retained unchanged so early departure cannot hide an overlap. */
  gapMinutes: number
  departureMinute: number
  walkingMinutes: number
}
export const EARLY_CLASS_RELEASE_MINUTES = 10
export const campusDays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]

/** Consecutive meetings within the same day, including overlapping classes as warnings. */
export function classTransitions(registrations: RegistrationDto[]): ClassTransition[] {
  const stops: ClassStop[] = []
  for (const registration of registrations) {
    if (registration.status !== "active") continue
    registration.meetings.forEach((meeting: MeetingDto, index) => {
      const day = meeting.dayCode ?? meeting.day_code ?? ""
      const start = meeting.startMinute ?? meeting.start_minute
      const end = meeting.endMinute ?? meeting.end_minute
      if (
        meeting.arranged ||
        !campusDays.includes(day) ||
        start == null ||
        end == null ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end > 1440 ||
        end <= start
      )
        return
      stops.push({
        id: `${registration.registrationId}-${index}`,
        courseCode: registration.courseCode,
        name: registration.shortName || registration.nameEn || registration.nameTh,
        day,
        start,
        end,
        building: meeting.building?.trim() ?? "",
        room: meeting.room?.trim() ?? "",
      })
    })
  }
  const result: ClassTransition[] = []
  for (const day of campusDays) {
    const list = stops
      .filter((stop) => stop.day === day)
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
    for (let index = 1; index < list.length; index++) {
      const from = list[index - 1],
        to = list[index]
      if (!from || !to) continue
      const departureMinute = Math.max(from.start, from.end - EARLY_CLASS_RELEASE_MINUTES)
      result.push({
        id: `${from.id}:${to.id}`,
        from,
        to,
        gapMinutes: to.start - from.end,
        departureMinute,
        walkingMinutes: to.start - departureMinute,
      })
    }
  }
  return result
}

const normalized = (text: string) => text.toUpperCase().replace(/[\s._-]/g, "")
export function resolveBuilding(
  buildings: CampusBuilding[],
  building: string,
  room = "",
): CampusBuilding | null {
  // Some schedules combine a building and room in either field. An explicit unknown
  // building still takes precedence over the separate room; do not guess its location.
  const value = normalized(building) || normalized(room)
  if (!value) return null
  const labels = (candidate: CampusBuilding) =>
    [candidate.code, ...candidate.aliases, candidate.name, candidate.nameTh ?? ""]
      .map(normalized)
      .filter(Boolean)
  const exact = buildings.filter((candidate) => labels(candidate).includes(value))
  if (exact.length) return exact.length === 1 ? (exact[0] ?? null) : null
  const matches = buildings.filter((candidate) =>
    labels(candidate).some((prefix) => {
      const suffix = value.slice(prefix.length)
      return value.startsWith(prefix) && /^(?:M?\d{1,4})(?:\/\d{1,3})?$/.test(suffix)
    }),
  )
  return matches.length === 1 ? (matches[0] ?? null) : null
}

export function roomFloor(
  building: CampusBuilding,
  rawRoom: string,
): { floor: string; inferred: boolean } | null {
  let room = normalized(rawRoom)
  const prefix = [building.code, ...building.aliases]
    .map(normalized)
    .sort((a, b) => b.length - a.length)
    .find((alias) => room.startsWith(alias))
  if (prefix) room = room.slice(prefix.length)
  const verified = building.verifiedRooms?.find((entry) => normalized(entry.room) === room)
  if (verified) return { floor: verified.floor, inferred: false }
  if (
    building.roomParsing?.strategy === "verified_mapping_then_building_fallback" ||
    !/^\d{3,4}$/.test(room)
  )
    return null
  const floors = building.floorCountOfficial ?? building.floorCount
  if (!floors || !Number.isInteger(floors)) return null
  const floor = Number(room.slice(0, floors > 9 ? 2 : 1))
  return floor >= 1 && floor <= floors ? { floor: String(floor), inferred: true } : null
}

export type CampusRoute = {
  points: CampusNode[]
  distanceM: number
  minutes: number
  hasSteps: boolean
  hasSharedRoad: boolean
  crossingCount: number
}
export type CampusGraph = {
  nodes: Map<string, CampusNode>
  adjacency: Map<string, Array<{ to: string; edge: CampusEdge }>>
}
export function makeCampusGraph(data: CampusData): CampusGraph {
  const nodes = new Map(data.nodes.map((node) => [node.id, node]))
  const adjacency: CampusGraph["adjacency"] = new Map()
  const add = (from: string, to: string, edge: CampusEdge) => {
    const list = adjacency.get(from) ?? []
    list.push({ to, edge })
    adjacency.set(from, list)
  }
  for (const edge of data.edges) {
    if (
      !nodes.has(edge.a) ||
      !nodes.has(edge.b) ||
      !Number.isFinite(edge.lengthM) ||
      edge.lengthM <= 0
    )
      continue
    if (edge.oneway !== "-1") add(edge.a, edge.b, edge)
    if (edge.oneway !== "yes" && edge.oneway !== "1") add(edge.b, edge.a, edge)
  }
  return { nodes, adjacency }
}

/** Dijkstra on the filtered pedestrian topology. No straight-line fallback or inferred connectors. */
export function walkingRoute(graph: CampusGraph, from: string, to: string): CampusRoute | null {
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return null
  const distance = new Map<string, number>([[from, 0]])
  const previous = new Map<string, { node: string; edge: CampusEdge }>()
  const heap: Array<{ id: string; cost: number }> = []
  const push = (item: { id: string; cost: number }) => {
    heap.push(item)
    let index = heap.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      const parentItem = heap[parent]
      if (!parentItem || parentItem.cost <= item.cost) break
      heap[index] = parentItem
      index = parent
    }
    heap[index] = item
  }
  const pop = () => {
    const first = heap[0],
      last = heap.pop()
    if (!first || !last) return null
    if (heap.length) {
      let index = 0
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1
        const left = heap[child],
          right = heap[child + 1]
        if (left && right && right.cost < left.cost) child++
        const childItem = heap[child]
        if (!childItem || childItem.cost >= last.cost) break
        heap[index] = childItem
        index = child
      }
      heap[index] = last
    }
    return first
  }
  push({ id: from, cost: 0 })
  while (heap.length) {
    const current = pop()
    if (!current) break
    if (current.cost !== distance.get(current.id)) continue
    if (current.id === to) break
    for (const next of graph.adjacency.get(current.id) ?? []) {
      const cost = current.cost + next.edge.lengthM
      if (cost < (distance.get(next.to) ?? Infinity)) {
        distance.set(next.to, cost)
        previous.set(next.to, { node: current.id, edge: next.edge })
        push({ id: next.to, cost })
      }
    }
  }
  const distanceM = distance.get(to)
  if (distanceM === undefined) return null
  const endpoint = graph.nodes.get(to)
  if (!endpoint) return null
  const points = [endpoint],
    edges: CampusEdge[] = []
  for (let cursor = to; cursor !== from; ) {
    const step = previous.get(cursor)
    if (!step) return null
    const point = graph.nodes.get(step.node)
    if (!point) return null
    edges.push(step.edge)
    cursor = step.node
    points.push(point)
  }
  return {
    points: points.reverse(),
    distanceM,
    minutes: Math.ceil(distanceM / 72),
    hasSteps: edges.some((edge) => edge.highway === "steps"),
    hasSharedRoad: edges.some((edge) => edge.sharedRoad),
    crossingCount: edges.filter((edge) => edge.crossing).length,
  }
}

export const formatClassTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
