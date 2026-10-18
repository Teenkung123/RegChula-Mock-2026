import { expect, test } from "@playwright/test"
import { DEFAULT_APPEARANCE_SETTINGS } from "../../packages/appearance/src"

test("dashboard advances the next class in Bangkok time without a duplicated course list", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile-375", "Focused mobile dashboard clock check")
  await page.clock.install({ time: new Date("2026-09-14T01:59:00Z") })
  const term = { id: 1, academicYear: 2569, semester: 1, label: "2569/1", current: true }
  const registrations = [540, 600].map((startMinute, index) => ({
    registrationId: index + 1,
    courseCode: `230110${index}`,
    nameTh: `วิชาทดสอบ ${index + 1}`,
    nameEn: `Test course ${index + 1}`,
    credits: 3,
    status: "active",
    offeringId: index + 1,
    sectionId: index + 1,
    sectionNo: "1",
    meetings: [
      {
        arranged: false,
        dayCode: "MO",
        startMinute,
        endMinute: startMinute + 60,
        periodLabel: "",
        building: "ENG",
        room: "101",
        teachers: [],
      },
    ],
  }))
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: { data: { studentId: "next-class-audit", rememberMe: true } } }),
  )
  await page.route("**/api/v1/preferences", (route) =>
    route.fulfill({ json: { data: DEFAULT_APPEARANCE_SETTINGS } }),
  )
  await page.route("**/api/v1/terms", (route) => route.fulfill({ json: { data: [term] } }))
  await page.route("**/api/v1/registrations", (route) =>
    route.fulfill({ json: { data: { term, registrations } } }),
  )
  await page.route("**/api/v1/announcements", (route) => route.fulfill({ json: { data: [] } }))
  await page.goto("/dashboard")
  const card = page.getByTestId("next-class-card")
  await expect(card.getByRole("heading", { name: "วิชาถัดไป" })).toBeVisible()
  await expect(page.getByTestId("next-class-countdown")).toContainText("1 นาที")
  await expect(page.getByTestId("next-class-course")).toContainText("2301100")
  await expect(card).toContainText("ENG · 101")
  await expect(page.getByText("2301101", { exact: false })).toHaveCount(0)
  await page.clock.fastForward(60_000)
  await expect(card.getByRole("heading", { name: "กำลังเรียน", exact: true })).toBeVisible()
  await expect(page.getByTestId("next-class-countdown")).toContainText("1 ชม.")
  const upcoming = page.getByTestId("up-next-preview")
  await expect(upcoming).toContainText("2301101")
  await expect(upcoming).toHaveAttribute("data-prominent", "false")
  await page.clock.fastForward(39 * 60_000)
  await expect(upcoming).toHaveAttribute("data-prominent", "false")
  const compactSize = await upcoming
    .locator("strong")
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
  await page.clock.fastForward(60_000)
  await expect(upcoming).toHaveAttribute("data-prominent", "true")
  expect(
    await upcoming
      .locator("strong")
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThan(compactSize)
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `tmp/browser/dashboard-up-next-${width}.png`, fullPage: true })
  }
  await page.clock.fastForward(20 * 60_000)
  await expect(page.getByTestId("next-class-course")).toContainText("2301101")
  await expect(page.getByTestId("next-class-course")).not.toContainText("2301100")
  await expect(upcoming).toContainText("2301100")
  await expect(upcoming).toHaveAttribute("data-prominent", "false")
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: "tmp/browser/mobile-fixes-next-class.png", fullPage: true })
  for (const registration of registrations) registration.meetings = []
  await page.reload()
  await expect(card).toContainText("ยังไม่มีเวลาเรียนที่ระบุไว้")
  registrations.splice(0)
  await page.reload()
  await expect(card).toContainText("ตารางใหม่เริ่มได้ที่นี่")
})
