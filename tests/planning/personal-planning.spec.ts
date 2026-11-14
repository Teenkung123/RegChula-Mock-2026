import { randomStudentId, test } from "../e2e/identity"
import { expect, type APIRequestContext } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const origin = "http://localhost:5175"
const headers = { origin }
async function login(request: APIRequestContext, studentId: string) {
  const challenge = (await (await request.get("/api/v1/auth/challenge")).json()).data
  const response = await request.post("/api/v1/auth/login", {
    headers,
    data: {
      studentId,
      password: "12345678",
      rememberMe: false,
      challengeToken: challenge.token,
      challengeCode: challenge.code,
    },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test("personal records enforce student and term boundaries", async ({ playwright }) => {
  const first = await playwright.request.newContext({ baseURL: origin })
  const second = await playwright.request.newContext({ baseURL: origin })
  try {
    await login(first, await randomStudentId())
    await login(second, await randomStudentId())
    const terms = (await (await first.get("/api/v1/terms")).json()).data
    const term = terms.find((item: { current: boolean }) => item.current)
    const other = terms.find((item: { id: number }) => item.id !== term.id)
    const path = `/api/v1/schedule/activities?termId=${term.id}`
    const input = { title: "Lunch", dayCode: "MO", startMinute: 720, endMinute: 780 }
    const created = await first.post(path, { headers, data: input })
    expect(created.ok(), await created.text()).toBe(true)
    const activity = (await created.json()).data
    const ownedPath = `/api/v1/schedule/activities/${activity.id}?termId=${term.id}`
    expect((await second.put(ownedPath, { headers, data: input })).status()).toBe(404)
    expect((await second.delete(ownedPath, { headers })).status()).toBe(404)
    expect((await (await second.get(path)).json()).data).toEqual([])
    expect(
      (await (await first.get(`/api/v1/schedule/activities?termId=${other.id}`)).json()).data,
    ).toEqual([])
    expect(
      (
        await first.put(`/api/v1/schedule/activities/${activity.id}?termId=${other.id}`, {
          headers,
          data: input,
        })
      ).status(),
    ).toBe(404)
    expect((await first.post(path, { headers, data: { ...input, title: " " } })).status()).toBe(400)
    expect((await first.post(path, { headers, data: { ...input, endMinute: 700 } })).status()).toBe(
      400,
    )
    expect(
      (
        await first.post(path, { headers: { origin: "https://untrusted.invalid" }, data: input })
      ).status(),
    ).toBe(400)
    expect(
      (
        await first.put(ownedPath, {
          headers,
          data: { ...input, title: "Sports", dayCode: "SU", endMinute: 1440 },
        })
      ).ok(),
    ).toBe(true)
    expect((await (await first.get(path)).json()).data[0]).toMatchObject({
      title: "Sports",
      dayCode: "SU",
      endMinute: 1440,
    })

    const courses = (
      await (
        await first.get(
          `/api/v1/courses?academicYear=${term.academicYear}&semester=${term.semester}&pageSize=1`,
        )
      ).json()
    ).data
    const code = courses[0].courseCode
    const favorite = `/api/v1/favorites/${code}`
    expect((await first.put(favorite, { headers })).ok()).toBe(true)
    expect((await first.put(favorite, { headers })).ok()).toBe(true)
    const list = (await (await first.get(`/api/v1/favorites?termId=${term.id}`)).json()).data
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ courseCode: code, offered: true })
    const elsewhere = (await (await first.get(`/api/v1/favorites?termId=${other.id}`)).json()).data
    expect(elsewhere).toHaveLength(1)
    expect(elsewhere[0].courseCode).toBe(code)
    const otherOffering = await first.get(
      `/api/v1/courses/${code}?academicYear=${other.academicYear}&semester=${other.semester}`,
    )
    expect(elsewhere[0].offered).toBe(otherOffering.ok())
    expect((await (await second.get(`/api/v1/favorites?termId=${term.id}`)).json()).data).toEqual(
      [],
    )
    await second.delete(favorite, { headers })
    expect(
      (await (await first.get(`/api/v1/favorites?termId=${term.id}`)).json()).data,
    ).toHaveLength(1)
    expect((await first.put("/api/v1/favorites/INVALID-COURSE", { headers })).status()).toBe(404)
    await first.delete(favorite, { headers })
    await first.delete(ownedPath, { headers })
    expect((await (await first.get(path)).json()).data).toEqual([])
    expect((await (await first.get(`/api/v1/favorites?termId=${term.id}`)).json()).data).toEqual([])
  } finally {
    await Promise.all([
      first.post("/api/v1/auth/logout", { headers }),
      second.post("/api/v1/auth/logout", { headers }),
    ])
    await Promise.all([first.dispose(), second.dispose()])
  }
})

test("loading, activity CRUD, overlaps, export and favorites work in the browser", async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  await login(page.request, await randomStudentId())
  let releaseLoading: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    releaseLoading = resolve
  })
  await page.route("**/api/v1/me", async (route) => {
    await gate
    await route.continue()
  })
  await page.goto("/schedule", { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("page-loading")).toBeVisible()
  await page.screenshot({ path: info.outputPath("loading.png"), fullPage: true })
  releaseLoading()
  const add = page.getByRole("button", { name: "เพิ่มกิจกรรม", exact: true })
  await add.click()
  const dialog = page.getByRole("dialog", { name: "กิจกรรมส่วนตัว", exact: true })
  await dialog.getByLabel("ชื่อกิจกรรม", { exact: true }).fill("Lunch")
  const startField = dialog.getByRole("group", { name: /^เวลาเริ่ม/ })
  const endField = dialog.getByRole("group", { name: /^เวลาสิ้นสุด/ })
  await expect(startField.getByRole("spinbutton")).toHaveCount(2)
  await startField.getByRole("spinbutton").nth(1).press("ArrowUp")
  await endField.getByRole("spinbutton").first().press("ArrowUp")
  await page.screenshot({ path: info.outputPath("timefield.png"), fullPage: true })
  await dialog.getByRole("button", { name: "บันทึกกิจกรรม", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(add).toBeFocused()
  await expect(page.getByRole("region", { name: "กิจกรรมส่วนตัว", exact: true })).toContainText(
    "12:01–14:00",
  )
  await expect(page.getByTestId("schedule-activity-block")).toContainText("Lunch")
  await page.reload()
  await expect(page.getByTestId("schedule-activity-block")).toContainText("Lunch")
  await page.getByRole("button", { name: "แก้ไข Lunch", exact: true }).click()
  await dialog.getByLabel("ชื่อกิจกรรม", { exact: true }).fill("Sports")
  await dialog.getByRole("button", { name: "บันทึกกิจกรรม", exact: true }).click()
  await expect(page.getByTestId("schedule-activity-block")).toContainText("Sports")
  await add.click()
  await dialog.getByLabel("ชื่อกิจกรรม", { exact: true }).fill("Break")
  await dialog.getByRole("button", { name: "บันทึกกิจกรรม", exact: true }).click()
  await expect(page.getByTestId("schedule-activity-block")).toHaveCount(2)
  await expect(
    page.locator('[data-testid="schedule-activity-block"][data-conflict="true"]'),
  ).toHaveCount(2)
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "ดาวน์โหลด PNG", exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/\.png$/)
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" })
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    const audit = await new AxeBuilder({ page }).exclude('[data-live-announcer="true"]').analyze()
    expect(
      audit.violations
        .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
        .map((v) => ({
          id: v.id,
          nodes: v.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
        })),
    ).toEqual([])
    await page.screenshot({ path: info.outputPath(`activities-${theme}.png`), fullPage: true })
  }
  for (const title of ["Sports", "Break"]) {
    await page.getByRole("button", { name: `ลบ ${title}`, exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "ลบกิจกรรม", exact: true }).click()
    await expect(page.getByRole("dialog")).not.toBeVisible()
  }
  await expect(page.getByTestId("schedule-activity-block")).toHaveCount(0)
  await add.click()
  await dialog.getByLabel("ชื่อกิจกรรม", { exact: true }).fill("Midnight")
  await startField.getByRole("spinbutton").first().press("End")
  await endField.getByRole("spinbutton").first().press("Home")
  await dialog.getByRole("button", { name: "บันทึกกิจกรรม", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole("region", { name: "กิจกรรมส่วนตัว", exact: true })).toContainText(
    "23:00–24:00",
  )
  await page.getByRole("button", { name: "แก้ไข Midnight", exact: true }).click()
  await expect(endField.getByRole("spinbutton").first()).toHaveAttribute("aria-valuenow", "0")
  await dialog.getByRole("button", { name: "บันทึกกิจกรรม", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole("button", { name: "ลบ Midnight", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "ลบกิจกรรม", exact: true }).click()
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await page.goto("/search")
  const favorite = page.getByRole("button", { name: /^ถูกใจ / }).first()
  await expect(favorite).toBeEnabled()
  const label = await favorite.getAttribute("aria-label")
  const code = label?.split(" ").at(-1)
  await favorite.click()
  await expect(
    page.getByRole("button", { name: `เลิกถูกใจ ${code}`, exact: true }).last(),
  ).toHaveAttribute("aria-pressed", "true")
  await page.screenshot({ path: info.outputPath("favorite-toggle.png"), fullPage: true })
  const panel = page.getByRole("region", { name: "รายวิชาที่ถูกใจ", exact: true })
  await expect(panel).toContainText(code ?? "")
  await expect(panel).toContainText("เปิดสอนภาคนี้")
  await page.reload()
  await expect(panel).toContainText(code ?? "")
  await panel.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByRole("button", { name: "ปิดรายละเอียด", exact: true }).click()
  await panel.getByRole("button", { name: `เลิกถูกใจ ${code}`, exact: true }).click()
  await expect(panel).not.toContainText(code ?? "")
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})

test("section cards remain compact and readable in modal and drawer layouts", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "This test covers all target widths explicitly")
  test.setTimeout(120_000)
  await login(page.request, await randomStudentId())
  const result = await (await page.request.get("/api/v1/courses?pageSize=1")).json()
  const code = result.data[0].courseCode
  const detail = await (await page.request.get(`/api/v1/courses/${code}`)).json()
  const meetings = ["FWK", "LECT", "DISC", "LECT", "DISC"].map((classType, index) => ({
    id: index + 1,
    dayCode: index === 0 ? null : index < 3 ? "TH" : "TU",
    periodLabel: index === 0 ? "ไม่ระบุเวลา" : index % 2 ? "13:00–14:00" : "15:00–16:00",
    arranged: index === 0,
    building: "AR",
    room: "AR",
    classType,
    teachers: ["WPC"],
  }))
  detail.data.sections = [1, 71].map((sectionNo, index) => ({
    id: sectionNo,
    sectionNo: String(sectionNo),
    closed: false,
    capacity: 20,
    baselineEnrolled: 15 - index * 2,
    localActive: 0,
    remainingSeats: 5 + index * 2,
    note: "GENED-IN ONLINE",
    active: true,
    meetings,
  }))
  await page.route(new RegExp(`/api/v1/courses/${code}(?:\\?|$)`), (route) =>
    route.fulfill({ json: detail }),
  )
  await page.goto(`/search?q=${code}`)
  await page.getByRole("button", { name: "ดูรายละเอียด", exact: true }).first().click()
  for (const width of [320, 375, 414, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    const card = dialog.getByTestId("course-section-card").first()
    await card.scrollIntoViewIfNeeded()
    await expect(dialog.getByTestId("course-section-card")).toHaveCount(2)
    await expect(card).toContainText("ลงทะเบียน 15 / 20 ที่นั่ง")
    await expect(card.getByTestId("course-section-meeting")).toHaveCount(5)
    const bounds = await card.boundingBox()
    expect(bounds?.height).toBeLessThan(width < 640 ? 850 : 720)
    expect(await dialog.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({ path: info.outputPath(`sections-${width}.png`), fullPage: true })
  }
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  const audit = await new AxeBuilder({ page }).exclude('[data-live-announcer="true"]').analyze()
  expect(
    audit.violations
      .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
      .map((v) => ({
        id: v.id,
        nodes: v.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
      })),
  ).toEqual([])
  await page.screenshot({ path: info.outputPath("sections-dark.png"), fullPage: true })
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).not.toBeVisible()
})
