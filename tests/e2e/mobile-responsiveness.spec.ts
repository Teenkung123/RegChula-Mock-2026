import { expect, test, type Page, type Locator } from "@playwright/test"
import { DEFAULT_APPEARANCE_SETTINGS } from "../../packages/appearance/src"

async function bounds(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error("Expected a visible control")
  return box
}

async function swipe(page: Page, x: number, y: number, endX: number) {
  const session = await page.context().newCDPSession(page)
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  })
  for (let step = 1; step <= 8; step++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + ((endX - x) * step) / 8, y }],
    })
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await session.detach()
}

test("mobile course management, actions, route scrolling and slider gestures", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile-375", "Touch audit in mobile Chromium")
  test.setTimeout(120_000)
  page.setDefaultTimeout(10_000)
  const term = { id: 1, academicYear: 2569, semester: 1, label: "2569/1", current: true }
  const registrations = Array.from({ length: 7 }, (_, index) => ({
    registrationId: index + 1,
    courseCode: `230110${index}`,
    nameTh: "รายวิชาชื่อยาวสำหรับทดสอบการแสดงผลบนหน้าจอมือถือ",
    nameEn: "Long course title for mobile layout verification",
    credits: 3,
    status: "active",
    offeringId: index + 1,
    sectionId: index + 1,
    sectionNo: "1",
    meetings: [
      {
        dayCode: "MO",
        startMinute: 540,
        endMinute: 600,
        arranged: false,
        periodLabel: "09:00–10:00",
        building: "",
        room: "",
        teachers: [],
      },
    ],
  }))
  let settings = { ...DEFAULT_APPEARANCE_SETTINGS }
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: { data: { studentId: "mobile-layout-audit", rememberMe: true } } }),
  )
  await page.route("**/api/v1/preferences", async (route) => {
    if (route.request().method() === "PATCH")
      settings = { ...settings, ...route.request().postDataJSON() }
    await route.fulfill({ json: { data: settings } })
  })
  await page.route("**/api/v1/terms", (route) => route.fulfill({ json: { data: [term] } }))
  await page.route("**/api/v1/registrations", (route) =>
    route.fulfill({ json: { data: { term, registrations } } }),
  )
  await page.route("**/api/v1/announcements", (route) => route.fulfill({ json: { data: [] } }))
  await page.route("**/api/v1/schedule", (route) =>
    route.fulfill({ json: { data: { term, registrations } } }),
  )
  await page.route("**/api/v1/schedule/colors", (route) =>
    route.fulfill({ json: { data: { termId: 1, colors: [] } } }),
  )
  await page.route("**/api/v1/schedule/activities?*", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 1,
            termId: 1,
            title: "Test activity",
            dayCode: "WE",
            startMinute: 780,
            endMinute: 960,
          },
        ],
      },
    }),
  )
  const noOverflow = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const width of [320, 375, 414, 768, 960, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/dashboard")
    const stats = page.getByRole("region", { name: "สรุปการลงทะเบียน" })
    await expect(stats.locator(":scope > div")).toHaveCount(3)
    const boxes = await stats.locator(":scope > div").evaluateAll((nodes) =>
      nodes.map((node) => ({
        x: node.getBoundingClientRect().x,
        y: node.getBoundingClientRect().y,
      })),
    )
    expect(
      width < 768
        ? boxes.every((box) => box.x === boxes[0]?.x)
        : boxes.every((box) => box.y === boxes[0]?.y),
    ).toBe(true)
    await noOverflow()
    if (width === 375)
      await page.screenshot({ path: "tmp/browser/mobile-fixes-dashboard.png", fullPage: true })
    for (const route of ["drop", "withdraw"]) {
      await page.goto(`/${route}`)
      const rows = page.getByTestId("management-table").locator("article")
      await expect(rows).toHaveCount(7)
      if (!(await rows.first().getByRole("checkbox").isChecked()))
        await rows.first().locator('[data-slot="checkbox-content"]').tap()
      await expect(rows.first().getByRole("checkbox")).toBeChecked()
      if (width < 960) {
        const row = rows.first()
        await expect(row).toContainText("หน่วยกิต")
        const title = await bounds(row.locator("strong").first())
        const checkbox = await bounds(row.locator('[data-slot="checkbox"]'))
        expect(checkbox.x).toBeGreaterThan(title.x)
        if (route === "withdraw") await row.getByRole("textbox").fill("ทดสอบเหตุผล")
      }
      await noOverflow()
      if (width === 375)
        await page.screenshot({ path: `tmp/browser/mobile-fixes-${route}.png`, fullPage: true })
    }
  }
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto("/schedule")
  const activities = page.getByRole("region", { name: "กิจกรรมส่วนตัว" })
  await expect(activities.getByRole("button", { name: "แก้ไข Test activity" })).toBeVisible()
  const panel = await bounds(activities)
  for (const name of ["เพิ่มกิจกรรม", "แก้ไข Test activity", "ลบ Test activity"]) {
    const box = await bounds(activities.getByRole("button", { name, exact: true }))
    expect(box.x + box.width / 2).toBeGreaterThan(panel.x + panel.width / 2)
  }
  await page.screenshot({ path: "tmp/browser/mobile-fixes-schedule.png", fullPage: true })
  await page.evaluate(() => window.scrollTo(0, 650))
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300)
  await page.getByTestId("mobile-sidebar-trigger").click()
  await page.getByRole("dialog").getByRole("link", { name: "ภาพรวม", exact: true }).click()
  await expect(page).toHaveURL(/dashboard/)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)

  await page.goto("/appearance")
  await expect(page.locator("#layout-heading")).toBeHidden()
  await expect(page.locator("#detail-heading")).toBeHidden()
  const slider = page.locator('[data-sidebar-swipe="ignore"]').first()
  await slider.scrollIntoViewIfNeeded()
  const track = slider.locator('[data-slot="slider-track"]')
  const box = await bounds(track)
  const before = await slider.locator('input[type="range"]').inputValue()
  await swipe(page, box.x + box.width * 0.25, box.y + box.height / 2, box.x + box.width * 0.8)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect.poll(() => slider.locator('input[type="range"]').inputValue()).not.toBe(before)
  await slider.locator('input[type="range"]').focus()
  await page.keyboard.press("End")
  await expect(slider.locator('input[type="range"]')).toHaveValue("1.35")
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 900 })
    await noOverflow()
    const languages = page.getByRole("radiogroup").first()
    expect(
      await languages
        .locator('[class*="segmentLabel"]')
        .evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth)),
    ).toBe(true)
  }
  await page.setViewportSize({ width: 375, height: 900 })
  await noOverflow()
  await page.screenshot({ path: "tmp/browser/mobile-fixes-appearance.png", fullPage: true })
  await page.evaluate(() => window.scrollTo(0, 0))
  const heading = await bounds(page.locator("h1"))
  await swipe(page, 35, heading.y + heading.height / 2, 240)
  await expect(page.getByRole("dialog")).toBeVisible()
  await swipe(page, 210, 400, 30)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.emulateMedia({ colorScheme: "dark" })
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of ["dashboard", "drop", "withdraw", "schedule", "appearance"]) {
      await page.goto(`/${route}`)
      await expect(page.locator("h1")).toBeVisible()
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
      await noOverflow()
    }
  }
  await page.screenshot({ path: "tmp/browser/mobile-fixes-appearance-dark.png", fullPage: true })
})
