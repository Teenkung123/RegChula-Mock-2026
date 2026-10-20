import type { RegistrationDto } from "@regchula/api/public-types"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NavigationPage } from "./NavigationPage"

const { scheduleMock } = vi.hoisted(() => ({ scheduleMock: vi.fn() }))
vi.mock("../lib/api", () => ({ getSchedule: scheduleMock }))
vi.mock("../i18n", () => ({
  useI18n: () => ({ language: "en", text: (value: { en: string }) => value.en }),
}))
vi.mock("../components/CampusMap", () => ({
  CampusMap: ({ route }: { route: unknown[] }) => (
    <div data-testid="mock-map">{route.length} route points</div>
  ),
}))
const campus = {
  nodes: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 72, y: 0 },
  ],
  edges: [{ a: "a", b: "b", lengthM: 192, highway: "steps" }],
  buildings: [
    {
      code: "MHMK",
      aliases: [],
      name: "Mahamakut",
      x: 0,
      y: 0,
      accessNodeId: "a",
      source: "source",
      accessLabel: "Approximate",
      accessConfidence: "approximate",
      codeConfidence: "official_faculty_source",
      verifiedRooms: [{ room: "M01", floor: "M" }],
    },
    {
      code: "TAB",
      aliases: [],
      name: "Tab Nilaniti",
      x: 72,
      y: 0,
      accessNodeId: "b",
      source: "source",
      accessLabel: "Approximate",
      accessConfidence: "approximate",
      codeConfidence: "osm_ref",
      verifiedRooms: [{ room: "220", floor: "2" }],
    },
  ],
  metadata: {},
}
const row = (
  id: number,
  building: string,
  room: string,
  start: number,
  end: number,
): RegistrationDto => ({
  registrationId: id,
  courseCode: String(id),
  nameEn: "Class",
  nameTh: "",
  status: "active",
  credits: 3,
  sectionId: id,
  offeringId: id,
  sectionNo: "1",
  meetings: [
    {
      dayCode: "MO",
      startMinute: start,
      endMinute: end,
      arranged: false,
      building,
      room,
      teachers: null,
    },
  ],
})
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NavigationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  scheduleMock.mockResolvedValue({
    term: null,
    registrations: [row(1, "MHMK", "M01", 540, 600), row(2, "TAB", "220", 601, 660)],
  })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => campus }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
describe("navigation page", () => {
  it("adds an early-finish walking allowance without changing scheduled times", async () => {
    mount()
    expect(await screen.findByText("~3 min")).toBeVisible()
    expect(screen.getByText("192 m")).toBeVisible()
    expect(screen.getByText("Floor M")).toBeVisible()
    expect(screen.getByText("Floor 2")).toBeVisible()
    expect(screen.getByText("~09:50")).toBeVisible()
    expect(screen.getByText("Scheduled end 10:00")).toBeVisible()
    expect(screen.getByText("10:01")).toBeVisible()
    expect(screen.getByText("About 11 min for walking")).toBeVisible()
    expect(screen.getByText("Assumes class ends 10 min early.")).toBeVisible()
    expect(screen.queryByText("Allow more time to reach the next class.")).toBeNull()
    expect(screen.queryByText(/location matched to public map records/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "About this route" }))
    expect(screen.getByText(/location matched to public map records/)).toBeVisible()
    expect(screen.getByRole("button", { name: "About this route" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    fireEvent.click(screen.getByRole("button", { name: "About this route" }))
    expect(screen.queryByText(/location matched to public map records/)).toBeNull()
    expect(screen.queryByText("Includes steps")).toBeNull()
    expect(screen.queryByText("Shared low-speed roads")).toBeNull()
  })
  it("marks example mode and returns to actual schedule without persisting synthetic data", async () => {
    mount()
    await screen.findByText("~3 min")
    fireEvent.click(screen.getByRole("button", { name: "Try MHMK M01 → TAB220" }))
    expect(screen.getByText("Example route · not your timetable")).toBeVisible()
    expect(screen.queryByText("About 11 min for walking")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Back to my classes" }))
    expect(screen.queryByText("Example route · not your timetable")).toBeNull()
    expect(screen.getByText("About 11 min for walking")).toBeVisible()
  })
  it("allows ten walking minutes for back-to-back classes", async () => {
    scheduleMock.mockResolvedValue({
      registrations: [row(1, "MHMK", "M01", 540, 600), row(2, "TAB", "220", 600, 660)],
    })
    mount()
    expect(await screen.findByText("About 10 min for walking")).toBeVisible()
    expect(screen.queryByText("Allow more time to reach the next class.")).toBeNull()
  })
  it("warns when the walk exceeds the allowance including an early finish", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...campus, edges: [{ ...campus.edges[0], lengthM: 900 }] }),
      }),
    )
    mount()
    expect(await screen.findByText("~13 min")).toBeVisible()
    expect(screen.getByText("About 11 min for walking")).toBeVisible()
    expect(screen.getByText("Allow more time to reach the next class.")).toBeVisible()
  })
  it("preserves overlap when unknown building prevents a route", async () => {
    scheduleMock.mockResolvedValue({
      registrations: [row(1, "UNKNOWN", "101", 540, 620), row(2, "TAB", "220", 600, 660)],
    })
    mount()
    expect(await screen.findByText("Classes overlap by 20 min")).toBeVisible()
    expect(await screen.findByText(/We have not mapped this building/)).toBeVisible()
    expect(screen.queryByText("~3 min")).toBeNull()
  })
  it("shows empty state and allows a clearly labeled example", async () => {
    scheduleMock.mockResolvedValue({ registrations: [] })
    mount()
    expect(await screen.findByText(/No consecutive classes/)).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Try MHMK M01 → TAB220" })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole("button", { name: "Try MHMK M01 → TAB220" }))
    expect(await screen.findByText("~3 min")).toBeVisible()
  })
  it("handles disconnected topology without estimated straight-line routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...campus, edges: [] }) }),
    )
    mount()
    expect(await screen.findByText(/A walking route is not available/)).toBeVisible()
    expect(screen.queryByText("192 m")).toBeNull()
  })
  it("shows separate retry states for schedule and map data failures", async () => {
    scheduleMock.mockRejectedValue(new Error("offline"))
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))
    mount()
    expect(await screen.findByText("Your schedule could not be loaded.")).toBeVisible()
    expect(await screen.findByText("Campus routes could not be loaded.")).toBeVisible()
    expect(screen.getByRole("button", { name: "Retry schedule" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Retry map data" })).toBeEnabled()
  })
})
