import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import { stat } from "node:fs/promises"

test("audit populated planning views, palette, and PNG in light and dark modes", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "Focused populated accessibility/export audit")
  test.setTimeout(120_000)
  const challenge = (await (await page.request.get("/api/v1/auth/challenge")).json()).data
  const response = await page.request.post("/api/v1/auth/login", {
    headers: { origin: "http://localhost:5173" },
    data: {
      studentId: "audit-populated-" + Date.now(),
      password: "local-audit-only",
      challengeToken: challenge.token,
      challengeCode: challenge.code,
    },
  })
  expect(response.ok()).toBe(true)
  const term = { id: 1, academicYear: 2569, semester: 1, label: "2569/1" }
  const registrations = ["1111111", "2222222"].map((courseCode, index) => ({
    registrationId: index + 1,
    courseCode,
    nameTh: "รายวิชาสำหรับตรวจสอบ " + (index + 1),
    nameEn: "Audit course " + (index + 1),
    credits: 3,
    status: "active",
    offeringId: index + 1,
    sectionId: index + 1,
    sectionNo: "1",
    meetings: [
      {
        dayCode: "MO",
        startMinute: 420 + index * 30,
        endMinute: 510 + index * 30,
        arranged: false,
        periodLabel: index ? "07:30-09:00" : "07:00-08:30",
        building: "TEST",
        room: "101",
        teachers: ["STAFF"],
      },
    ],
  }))
  await page.route("**/api/v1/schedule", (route) =>
    route.fulfill({ json: { data: { term, registrations } } }),
  )
  await page.route("**/api/v1/schedule/colors", (route) =>
    route.fulfill({
      json: {
        data: {
          termId: 1,
          colors: [
            { courseCode: "1111111", colorId: "amber" },
            { courseCode: "2222222", colorId: "violet" },
          ],
        },
      },
    }),
  )
  await page.route("**/api/v1/exams", (route) =>
    route.fulfill({
      json: {
        data: {
          term,
          courses: registrations.map((course, index) => ({
            ...course,
            midterm: null,
            final: { date: "2026-11-20", startMinute: 540 + index * 30, endMinute: 660 },
          })),
        },
      },
    }),
  )
  const checkA11y = async (label: string) => {
    const audit = await new AxeBuilder({ page }).exclude('[data-live-announcer="true"]').analyze()
    expect(
      audit.violations
        .filter((issue) => ["serious", "critical"].includes(issue.impact ?? ""))
        .map((issue) => ({ id: issue.id, nodes: issue.nodes.map((node) => node.target) })),
      label,
    ).toEqual([])
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      label,
    ).toBe(false)
  }
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme })
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 950 })
      await page.goto("/schedule")
      await expect(page.getByTestId("schedule-class-block")).toHaveCount(2)
      await expect(page.getByTestId("schedule-time-axis")).toContainText("07:00")
      await checkA11y(theme + " schedule " + width)
      await page.getByRole("button", { name: "เปลี่ยนสีรายวิชา 1111111" }).click()
      await expect(page.getByRole("dialog", { name: "สีรายวิชา 1111111" })).toBeVisible()
      await checkA11y(theme + " palette " + width)
      await page.screenshot({ path: "tmp/browser/audit-palette-" + theme + "-" + width + ".png" })
      await page.keyboard.press("Escape")
      if (width === 1440 && theme === "light") {
        const downloaded = page.waitForEvent("download")
        await page.getByRole("button", { name: "ดาวน์โหลด PNG" }).click()
        const download = await downloaded
        const file = await download.path()
        expect(file).not.toBeNull()
        if (!file) throw new Error("PNG download path missing")
        expect((await stat(file)).size).toBeGreaterThan(1000)
      }
      await page.goto("/exams")
      await expect(page.getByTestId("exam-course-card")).toHaveCount(4)
      await checkA11y(theme + " exams " + width)
      await page.screenshot({
        path: "tmp/browser/audit-exams-" + theme + "-" + width + ".png",
        fullPage: true,
      })
    }
  }
})
