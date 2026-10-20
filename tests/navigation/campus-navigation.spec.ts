import { expect, type Page, test } from "@playwright/test"
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
  theme: "light" | "dark" = "light",
  language: "en" | "th" = "en",
) {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: { data: { studentId: "navigation-test", rememberMe: true } } }),
  )
  await page.route("**/api/v1/preferences", (route) =>
    route.fulfill({ json: { data: { ...DEFAULT_APPEARANCE_SETTINGS, language, theme } } }),
  )
  await page.route("**/api/v1/terms", (route) => route.fulfill({ json: { data: [term] } }))
  await page.route("**/api/v1/schedule", (route) =>
    route.fulfill({ json: { data: { term, registrations: rows } } }),
  )
}

async function expectRouteInView(page: Page) {
  const map = page.getByRole("application", { name: "Campus walking map" })
  await expect
    .poll(() =>
      map.evaluate((viewport) => {
        const viewportBounds = viewport.getBoundingClientRect()
        const frame = viewport.closest("figure")?.getBoundingClientRect() ?? viewportBounds
        const bounds = {
          left: Math.max(viewportBounds.left, frame.left),
          right: Math.min(viewportBounds.right, frame.right),
          top: Math.max(viewportBounds.top, frame.top),
          bottom: Math.min(viewportBounds.bottom, frame.bottom),
        }
        return [...viewport.querySelectorAll<HTMLElement>("[data-endpoint]")].map((marker) => {
          const label = marker.getBoundingClientRect()
          return (
            !marker.hidden &&
            label.left >= bounds.left &&
            label.right <= bounds.right &&
            label.top >= bounds.top &&
            label.bottom <= bounds.bottom
          )
        })
      }),
    )
    .toEqual([true, true])
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
  await expect(page.getByTestId("campus-navigation")).toContainText("About 15 min for walking")
  await expect(page.getByRole("button", { name: "Move map", exact: true })).toHaveCount(0)
  const map = page.getByRole("application", { name: "Campus walking map" })
  await expect(map).toHaveAttribute("aria-busy", "false", { timeout: 45000 })
  await expect(map).toHaveAttribute("tabindex", "0")
  await expectRouteInView(page)
  await map.focus()
  await page.keyboard.press("ArrowRight")
  const canvas = map.locator("canvas")
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error("Map canvas has no layout bounds")
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2 + 30)
  await page.mouse.up()
  const occlusion = page.getByRole("switch", { name: "Buildings hide the route" })
  await expect(occlusion).not.toBeChecked()
  await page.getByText("Buildings hide the route", { exact: true }).click()
  await expect(occlusion).toBeChecked()
  await occlusion.focus()
  await page.keyboard.press("Space")
  await expect(occlusion).not.toBeChecked()
  await page.getByRole("button", { name: "Zoom in", exact: true }).click()
  await page.getByRole("button", { name: "Show route" }).click()
  await expectRouteInView(page)
  await page.getByRole("button", { name: "Try MHMK M01 → TAB220" }).click()
  await expect(page.getByText("Example route · not your timetable")).toBeVisible()
  await page.getByRole("button", { name: "Back to my classes" }).click()
  await expect(page.getByText("Example route · not your timetable")).toHaveCount(0)
  await expectRouteInView(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
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
  await expect(page.getByRole("application", { name: "Campus walking map" })).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 45000 },
  )
})

test("resolves PHOTO 501 from the supplied classroom example", async ({ page }, info) => {
  await mockSession(
    page,
    [registration(1, "MHMK", "M02", 540, 660), registration(2, "PHOTO", "501", 780, 840)],
    "light",
    "th",
  )
  await page.goto("/navigation")
  const navigation = page.getByTestId("campus-navigation")
  await expect(navigation).toContainText("PHOTO 501")
  await expect(navigation).toContainText("มีเวลาเดินประมาณ 130 นาที")
  await expect(navigation).toContainText("242 ม.")
  await expect(navigation).not.toContainText("ยังไม่มีตำแหน่งอาคารนี้")
  await expect(navigation).not.toContainText("มีบันไดในเส้นทาง")
  await expect(navigation).not.toContainText("บางช่วงใช้ถนนร่วมกับรถ")
  await expect(page.getByRole("application", { name: "แผนที่เส้นทางเดิน" })).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 45000 },
  )
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
  await page.screenshot({ path: `tmp/navigation-${info.project.name}-photo.png`, fullPage: true })
})

test("renders directional routes and building occlusion in dark mode", async ({ page }, info) => {
  await mockSession(page, undefined, "dark")
  await page.goto("/navigation")
  const map = page.getByRole("application", { name: "Campus walking map" })
  await expect(map).toHaveAttribute("aria-busy", "false", { timeout: 45000 })
  await expectRouteInView(page)
  await page.getByText("Buildings hide the route", { exact: true }).click()
  await expect(page.getByRole("switch", { name: "Buildings hide the route" })).toBeChecked()
  await expectRouteInView(page)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
  await page.screenshot({ path: `tmp/navigation-${info.project.name}-dark.png`, fullPage: true })
})

test("shows readable building names without covering markers or controls", async ({ page }) => {
  await mockSession(page)
  await page.goto("/navigation")
  const map = page.getByRole("application", { name: "Campus walking map" })
  await expect(map).toHaveAttribute("aria-busy", "false", { timeout: 45000 })
  const names = map.getByRole("list", { name: "Building names" })
  await expect.poll(() => names.getByRole("listitem").count()).toBeGreaterThan(0)
  const placement = () =>
    map.evaluate((viewport) => {
      const frame = viewport.getBoundingClientRect()
      const labels = [...viewport.querySelectorAll<HTMLElement>("[data-building-id]")]
        .filter((label) => !label.hidden)
        .map((label) => label.getBoundingClientRect())
      const blocks = [
        ...viewport.querySelectorAll<HTMLElement>("[data-endpoint]"),
        ...(viewport.parentElement?.querySelectorAll<HTMLElement>("[data-map-control]") ?? []),
      ]
        .filter((element) => !element.hidden)
        .map((element) => element.getBoundingClientRect())
      const overlaps = (a: DOMRect, b: DOMRect) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
      return {
        inside: labels.every(
          (label) =>
            label.left >= frame.left &&
            label.right <= frame.right &&
            label.top >= frame.top &&
            label.bottom <= frame.bottom,
        ),
        clear: labels.every((label) => blocks.every((block) => !overlaps(label, block))),
      }
    })
  await expect.poll(placement).toEqual({ inside: true, clear: true })
  await page.getByRole("button", { name: "Zoom out", exact: true }).click()
  await expect.poll(() => names.getByRole("listitem").count()).toBeGreaterThan(0)
})

test("keeps map marker colors stable when the interface theme changes", async ({ page }) => {
  await mockSession(page)
  await page.goto("/navigation")
  const map = page.getByRole("application", { name: "Campus walking map" })
  await expect(map).toHaveAttribute("aria-busy", "false", { timeout: 45000 })
  const palette = () =>
    map.evaluate((viewport) =>
      [...viewport.querySelectorAll<HTMLElement>("[data-endpoint]")].map((marker) => ({
        fill: getComputedStyle(marker.firstElementChild as Element).backgroundColor,
        text: getComputedStyle(marker).color,
        backing: getComputedStyle(viewport).getPropertyValue("--color-map-marker-outline").trim(),
      })),
    )
  const before = await palette()
  expect(before.map((entry) => entry.fill)).toEqual(["rgb(21, 128, 61)", "rgb(37, 99, 235)"])
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"))
  await expect.poll(palette).toEqual(before)
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"))
  await expect.poll(palette).toEqual(before)
})

test("a real mobile map swipe pans without opening the sidebar", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Requires a touch viewport")
  await mockSession(page)
  await page.goto("/navigation")
  const map = page.getByRole("application", { name: "Campus walking map" })
  await expect(map).toHaveAttribute("aria-busy", "false", { timeout: 45000 })
  const canvas = map.locator("canvas")
  await canvas.scrollIntoViewIfNeeded()
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error("Map canvas has no visible bounds")
  const before = await map
    .locator('[data-endpoint="origin"]')
    .evaluate((marker) => (marker as HTMLElement).style.left)
  const touch = await page.context().newCDPSession(page)
  const swipe = async (x: number, y: number, distance: number) => {
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + distance / 2, y }],
    })
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + distance, y }],
    })
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  }
  await swipe(bounds.x + 8, bounds.y + bounds.height / 2, 120)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect
    .poll(() =>
      map
        .locator('[data-endpoint="origin"]')
        .evaluate((marker) => (marker as HTMLElement).style.left),
    )
    .not.toBe(before)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
  await swipe(4, 145, 180)
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await touch.detach()
})
