import { expect, test } from "@playwright/test"

test("exam filters query announced slots and mobile controls persist in the URL", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile-375", "Focused live catalog and mobile filter check")
  test.setTimeout(60_000)
  const challenge = (await (await page.request.get("/api/v1/auth/challenge")).json()).data
  const login = await page.request.post("/api/v1/auth/login", {
    headers: { origin: "http://localhost:5173" },
    data: {
      studentId: `exam-audit-${Date.now()}`,
      password: "local-audit-only",
      challengeToken: challenge.token,
      challengeCode: challenge.code,
    },
  })
  expect(login.ok()).toBe(true)
  const query = "examDays=MO&examStartTime=00%3A00&examEndTime=23%3A59&pageSize=10"
  const response = await page.request.get(`/api/v1/courses?${query}`)
  expect(response.ok()).toBe(true)
  const result = await response.json()
  expect(result.data.length).toBeGreaterThan(0)
  for (const course of result.data) {
    const detail = (await (await page.request.get(`/api/v1/courses/${course.courseCode}`)).json())
      .data.offering
    const matches = [detail.midterm, detail.final].some(
      (slot) =>
        slot &&
        new Date(`${slot.date.slice(0, 10)}T00:00:00Z`).getUTCDay() === 1 &&
        slot.startMinute >= 0 &&
        slot.endMinute <= 1439 &&
        slot.endMinute > slot.startMinute,
    )
    expect(matches, course.courseCode).toBe(true)
  }
  for (const invalid of [
    "examDays=XX",
    "examStartTime=25:00",
    "examStartTime=12:00&examEndTime=09:00",
  ]) {
    const response = await page.request.get(`/api/v1/courses?${invalid}`)
    expect(response.status()).toBe(422)
  }
  await page.goto(`/search?${query}`)
  const monday = page.getByRole("button", { name: "วันสอบ จ", exact: true })
  await expect(monday).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByTestId("exam-time-start-trigger")).toContainText("00:00")
  await expect(page.getByTestId("exam-time-end-trigger")).toContainText("23:59")
  await monday.click()
  await expect.poll(() => new URL(page.url()).searchParams.has("examDays")).toBe(false)
  await monday.click()
  await expect.poll(() => new URL(page.url()).searchParams.get("examDays")).toBe("MO")
  await page.getByTestId("exam-time-start-trigger").click()
  const dialog = page.getByRole("dialog", { name: "สอบเริ่มไม่ก่อน" })
  const hour = dialog.getByRole("spinbutton").first()
  await hour.focus()
  await hour.press("ArrowUp")
  await page.keyboard.press("Escape")
  await expect.poll(() => new URL(page.url()).searchParams.get("examStartTime")).toBe("01:00")
  await page.reload()
  await expect(page.getByTestId("exam-time-start-trigger")).toContainText("01:00")
  await expect(monday).toHaveAttribute("aria-pressed", "true")
  await page.getByTestId("exam-time-start-trigger").scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: "tmp/browser/mobile-fixes-exam-search.png" })
  await page.getByRole("button", { name: "ล้างตัวกรอง", exact: true }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has("examStartTime")).toBe(false)
  await expect.poll(() => new URL(page.url()).searchParams.has("examDays")).toBe(false)
})
