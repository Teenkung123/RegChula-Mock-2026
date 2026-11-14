import { randomStudentId, test } from "./identity"
import { readFile } from "node:fs/promises"
import { expect, type Page } from "@playwright/test"

const term = { id: 1, academicYear: 2569, semester: 1, current: true, label: "2569/1" }
const courses = [
  {
    courseCode: "2301101",
    nameTh: "แคลคูลัส 1",
    nameEn: "CALCULUS I",
    shortName: "CALCULUS I",
    credits: 4,
  },
  {
    courseCode: "2304121",
    nameTh: "ฟิสิกส์สำหรับวิทยาศาสตร์กายภาพ",
    nameEn: "PHYSICS FOR PHYSICAL SCIENCE",
    credits: 3,
  },
].map((course, i) => ({
  ...course,
  registrationId: i + 1,
  offeringId: i + 1,
  sectionId: i + 1,
  sectionNo: String(i + 1),
  status: "active",
  meetings: [
    {
      dayCode: "MO",
      startMinute: 660,
      endMinute: 720,
      arranged: false,
      periodLabel: "11:00–12:00",
      building: "SCI",
      room: "101",
      teachers: ["STAFF"],
    },
  ],
}))

async function login(page: Page) {
  await page.goto("/login")
  await expect(page.getByTestId("challenge-code")).toHaveText(/^\d{4}$/)
  await page.getByLabel("รหัสนิสิต").fill(await randomStudentId())
  await page.getByLabel("รหัสผ่าน").fill("12345678")
  await page
    .getByLabel("กรอกรหัสยืนยัน")
    .fill((await page.getByTestId("challenge-code").textContent())?.trim() ?? "")
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click()
  await expect(page).toHaveURL(/dashboard/)
  await expect(page.locator("main h1")).toBeVisible()
}

async function touch(page: Page, type: string, x: number, y: number, selector?: string) {
  await page.evaluate(
    ({ type, x, y, selector }) => {
      const state = window as Window & { swipeTarget?: Element }
      if (type === "touchstart")
        state.swipeTarget =
          (selector ? document.querySelector(selector) : document.elementFromPoint(x, y)) ??
          undefined
      const target = state.swipeTarget
      if (!target) throw new Error("Missing touch target")
      const finger = new Touch({ identifier: 1, target, clientX: x, clientY: y })
      target.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === "touchend" || type === "touchcancel" ? [] : [finger],
          changedTouches: [finger],
        }),
      )
    },
    { type, x, y, selector },
  )
}

test("drawer follows the finger before release and leaves scrolling controls alone", async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith("mobile"))
  await login(page)
  const dialog = page.getByRole("dialog", { name: "เมนูทั้งหมด" })
  await touch(page, "touchstart", 100, 200, "main h1")
  await touch(page, "touchmove", 125, 201)
  await expect(dialog).toBeVisible()
  const first = await dialog.boundingBox()
  expect(first?.x).toBeLessThan(-100)
  await touch(page, "touchmove", 185, 202)
  const second = await dialog.boundingBox()
  expect((second?.x ?? 0) - (first?.x ?? 0)).toBeGreaterThan(45)
  expect(second?.x).toBeLessThan(-100)
  await touch(page, "touchend", 185, 202)
  await expect.poll(async () => Math.round((await dialog.boundingBox())?.x ?? -999)).toBe(0)
  await touch(page, "touchstart", 220, 200, '[data-slot="drawer-header"]')
  await touch(page, "touchmove", 150, 200)
  expect((await dialog.boundingBox())?.x).toBeLessThan(-60)
  await touch(page, "touchend", 150, 200)
  await expect(dialog).not.toBeVisible()

  await touch(page, "touchstart", 100, 200, "main h1")
  await touch(page, "touchmove", 120, 201)
  await touch(page, "touchcancel", 120, 201)
  await expect(dialog).not.toBeVisible()
  await touch(page, "touchstart", 100, 200, "main h1")
  await touch(page, "touchmove", 110, 290)
  await touch(page, "touchend", 110, 290)
  await expect(dialog).not.toBeVisible()

  await page.route("**/api/v1/schedule", (route) =>
    route.fulfill({ json: { data: { term, registrations: courses } } }),
  )
  await page.goto("/schedule")
  await expect(page.getByTestId("schedule-grid")).toBeVisible()
  await touch(page, "touchstart", 100, 500, '[data-testid="schedule-grid"]')
  await touch(page, "touchmove", 250, 500)
  await touch(page, "touchend", 250, 500)
  await expect(dialog).not.toBeVisible()
  await page.getByTestId("mobile-sidebar-trigger").click()
  await expect.poll(async () => Math.round((await dialog.boundingBox())?.x ?? -999)).toBe(0)
  await page.setViewportSize({ width: 1024, height: 900 })
  await expect(dialog).not.toBeVisible()
})

test("compact layouts and exports stay readable across phone widths", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("mobile"))
  test.setTimeout(120_000)
  await login(page)
  await page.route("**/api/v1/registrations", (route) =>
    route.fulfill({ json: { data: { term, registrations: courses } } }),
  )
  await page.route("**/api/v1/schedule", (route) =>
    route.fulfill({ json: { data: { term, registrations: courses } } }),
  )
  const dimensions: number[][] = []
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/dashboard")
    const scheduleLink = page.getByRole("link", { name: "ดูตารางทั้งหมด", exact: true })
    await expect(scheduleLink).toBeVisible()
    expect(
      await scheduleLink.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const content = range.getBoundingClientRect()
        const box = element.getBoundingClientRect()
        return content.left >= box.left + 5 && content.right <= box.right - 5
      }),
    ).toBe(true)
    await page.screenshot({ path: `tmp/browser/ux-dashboard-${width}.png`, fullPage: true })
    await page.goto("/search")
    const input = page.getByLabel("รหัสหรือชื่อรายวิชา")
    await expect(input).toBeVisible()
    const before = await input.boundingBox()
    await page.getByTestId("term-utility").getByRole("button").click()
    await expect(page.getByRole("listbox")).toBeVisible()
    expect(await input.boundingBox()).toEqual(before)
    await page.screenshot({ path: `tmp/browser/ux-term-${width}.png` })
    await page.keyboard.press("Escape")
    await page.goto("/register")
    await expect(page.getByTestId("registration-active-row")).toHaveCount(2)
    for (const row of await page.getByTestId("registration-active-row").all()) {
      expect((await row.boundingBox())?.height).toBeLessThan(230)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      await page.locator('button[data-inline-control="button"]').evaluateAll((buttons) =>
        buttons
          .filter((button) => {
            const content = button.querySelector("span")
            if (!content) return false
            const box = button.getBoundingClientRect()
            const text = content.getBoundingClientRect()
            return text.right > box.right + 1 || text.left < box.left - 1
          })
          .map((button) => button.textContent),
      ),
    ).toEqual([])
    await page.screenshot({ path: `tmp/browser/ux-register-${width}.png`, fullPage: true })
    await page.goto("/schedule")
    await expect(page.getByTestId("schedule-class-block")).toHaveCount(2)
    await expect(page.getByTestId("schedule-class-block").first()).toContainText("CALCULUS I")
    await expect(page.getByTestId("schedule-class-block").nth(1)).toContainText(
      "ฟิสิกส์สำหรับวิทยาศาสตร์กายภาพ",
    )
    await expect(page.getByTestId("schedule-class-room").first()).toHaveText("SCI· 101")
    const roomFits = await page
      .getByTestId("schedule-class-room")
      .first()
      .evaluate((element) => {
        const room = element.getBoundingClientRect()
        const block = element.parentElement?.getBoundingClientRect()
        return Boolean(block && room.bottom <= block.bottom && room.top >= block.top)
      })
    expect(roomFits).toBe(true)
    expect(
      (await page.getByTestId("schedule-class-block").first().boundingBox())?.width,
    ).toBeGreaterThanOrEqual(95)
    await expect(page.getByTestId("schedule-day-row")).toHaveCount(5)
    expect((await page.getByTestId("schedule-grid").boundingBox())?.height).toBeLessThan(400)
    const hourWidths = await page.getByTestId("schedule-time-axis").evaluate((element) => ({
      empty: element.querySelector('[data-empty="true"]')?.getBoundingClientRect().width ?? 0,
      occupied: element.querySelector('[data-empty="false"]')?.getBoundingClientRect().width ?? 0,
    }))
    expect(hourWidths.empty).toBeLessThan(hourWidths.occupied / 2)
    await expect(
      page.getByTestId("schedule-class-block").first().locator("small").first(),
    ).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `tmp/browser/ux-schedule-${width}.png`, fullPage: true })
    if (width === 375 || width === 768) {
      const downloadPromise = page.waitForEvent("download")
      await page.getByRole("button", { name: "ดาวน์โหลด PNG" }).click()
      const download = await downloadPromise
      const path = `tmp/browser/ux-schedule-export-${width}.png`
      await download.saveAs(path)
      const bytes = await readFile(path)
      dimensions.push([bytes.readUInt32BE(16), bytes.readUInt32BE(20)])
      await expect(page.locator('[data-schedule-export="true"]')).toHaveCount(0)
    }
  }
  expect(dimensions[0]).toEqual(dimensions[1])
  expect(dimensions[0]?.[0]).toBeGreaterThan(3000)
})

test("browser touch input drags the drawer without waiting for touch release", async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith("mobile"))
  await login(page)
  const client = await page.context().newCDPSession(page)
  const heading = await page.locator("main h1").boundingBox()
  const y = (heading?.y ?? 150) + 10
  const dialog = page.getByRole("dialog", { name: "เมนูทั้งหมด" })
  const dispatch = (type: "touchStart" | "touchMove" | "touchEnd", x: number) =>
    client.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    })
  await dispatch("touchStart", 100)
  await dispatch("touchMove", 130)
  await expect(dialog).toBeVisible()
  expect((await dialog.boundingBox())?.x).toBeLessThan(-150)
  await dispatch("touchMove", 195)
  expect((await dialog.boundingBox())?.x).toBeGreaterThan(-200)
  await dispatch("touchEnd", 195)
  await expect.poll(async () => Math.round((await dialog.boundingBox())?.x ?? -999)).toBe(0)
  await dispatch("touchStart", 220)
  await dispatch("touchMove", 130)
  expect((await dialog.boundingBox())?.x).toBeLessThan(-70)
  await dispatch("touchEnd", 130)
  await expect(dialog).not.toBeVisible()
  await client.detach()
})

test("weekend rows appear only for courses using that day", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("mobile"))
  await login(page)
  let dayCode = "SA"
  await page.route("**/api/v1/schedule", (route) =>
    route.fulfill({
      json: {
        data: {
          term,
          registrations: [
            {
              ...courses[0],
              meetings: [{ ...courses[0]?.meetings[0], dayCode, startMinute: 570, endMinute: 675 }],
            },
          ],
        },
      },
    }),
  )
  await page.goto("/schedule")
  await expect(page.locator('[data-day="SA"]')).toBeVisible()
  await expect(page.locator('[data-day="SU"]')).toHaveCount(0)
  await expect(page.getByTestId("schedule-day-row")).toHaveCount(6)
  const bounds = await page.getByTestId("schedule-class-block").boundingBox()
  const hour = await page.locator('[data-hour="9"]').boundingBox()
  expect((bounds?.x ?? 0) - (hour?.x ?? 0)).toBeCloseTo((hour?.width ?? 0) / 2, 0)
  dayCode = "SU"
  await page.reload()
  await expect(page.locator('[data-day="SU"]')).toBeVisible()
  await expect(page.locator('[data-day="SA"]')).toHaveCount(0)
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.getByTestId("schedule-class-block").locator("small").first()).toBeVisible()
  const widths = await page
    .getByTestId("schedule-time-axis")
    .locator("span")
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width))
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1)
})
