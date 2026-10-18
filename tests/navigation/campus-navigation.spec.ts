import { expect, test, type Page } from "@playwright/test"
import { DEFAULT_APPEARANCE_SETTINGS } from "../../packages/appearance/src"

const term = { id: 1, academicYear: 2569, semester: 1, label: "2569/1", current: true }
function registration(id: number, building: string, room: string, start: number, end: number) {
  return {
    registrationId: id,
    courseCode: `23001${id}0`,
    nameTh: `รายวิชา ${id}`,
    nameEn: `Class ${id}`,
    credits: 3,
    status: "active",
    offeringId: id,
    sectionId: id,
    sectionNo: "1",
    meetings: [
      {
        arranged: false,
        dayCode: "MO",
        startMinute: start,
        endMinute: end,
        building,
        room,
        teachers: [],
      },
    ],
  }
}
async function mockSession(
  page: Page,
  rows = [registration(1, "MHMK", "M01", 540, 600), registration(2, "TAB", "220", 605, 660)],
) {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: { data: { studentId: "navigation-test", rememberMe: true } } }),
  )
  await page.route("**/api/v1/preferences", (route) =>
    route.fulfill({ json: { data: { ...DEFAULT_APPEARANCE_SETTINGS, language: "en" } } }),
  )
  await page.route("**/api/v1/terms", (route) => route.fulfill({ json: { data: [term] } }))
  await page.route("**/api/v1/schedule", (route) =>
    route.fulfill({ json: { data: { term, registrations: rows } } }),
  )
}
test("shows timetable route, interactive map, example toggle and responsive layout", async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await mockSession(page)
  await page.goto("/navigation")
  await expect(page.getByTestId("campus-navigation")).toContainText("~3 min")
  await expect(page.getByTestId("campus-navigation")).toContainText("192 m")
  await expect(page.getByTestId("campus-navigation")).toContainText("Floor M")
  await expect(page.getByTestId("campus-navigation")).toContainText("Floor 2")
  await expect(page.getByTestId("campus-navigation")).toContainText("5 min between classes")
  const explore = page.getByRole("button", { name: "Move map", exact: true })
  await expect(explore).toBeEnabled({ timeout: 45000 })
  await explore.click()
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(explore).toBeFocused()
  await page.getByRole("button", { name: "Zoom in", exact: true }).click()
  await page.getByRole("button", { name: "Show route" }).click()
  await page.getByRole("button", { name: "Try MHMK M01 → TAB220" }).click()
  await expect(page.getByText("Example route · not your timetable")).toBeVisible()
  await page.getByRole("button", { name: "Back to my classes" }).click()
  await expect(page.getByText("Example route · not your timetable")).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `tmp/navigation-${info.project.name}.png`, fullPage: true })
  expect(errors).toEqual([])
})
test("keeps known overlap visible for unresolved building and handles empty schedule", async ({
  page,
}) => {
  await mockSession(page, [
    registration(1, "UNKNOWN", "101", 540, 620),
    registration(2, "TAB", "220", 600, 660),
  ])
  await page.goto("/navigation")
  await expect(page.getByTestId("campus-navigation")).toContainText("Classes overlap by 20 min")
  await expect(page.getByTestId("campus-navigation")).toContainText(
    "We have not mapped this building",
  )
  await expect(page.getByTestId("campus-navigation")).not.toContainText("~3 min")
  await mockSession(page, [])
  await page.reload()
  await expect(page.getByTestId("campus-navigation")).toContainText("No consecutive classes")
})
test("model failure preserves route summary and allows retry", async ({ page }) => {
  await mockSession(page)
  await page.route("**/campus/*.glb", (route) => route.abort())
  await page.goto("/navigation")
  await expect(
    page.getByText("The map could not be loaded. You can still view your route details."),
  ).toBeVisible()
  await expect(page.getByTestId("campus-navigation")).toContainText("192 m")
  await page.unroute("**/campus/*.glb")
  await page.getByRole("button", { name: "Retry map", exact: true }).click()
  await expect(page.getByRole("button", { name: "Move map", exact: true })).toBeEnabled({
    timeout: 45000,
  })
})
