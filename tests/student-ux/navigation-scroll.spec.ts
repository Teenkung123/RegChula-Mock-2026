import { expect } from "@playwright/test"
import { randomStudentId, test } from "../e2e/identity"

test("mobile navigation preserves a settled catalogue scroll position", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile")
  const challenge = (await (await page.request.get("/api/v1/auth/challenge")).json()).data
  const login = await page.request.post("/api/v1/auth/login", {
    headers: { origin: "http://localhost:5173" },
    data: {
      studentId: await randomStudentId(),
      password: "12345678",
      challengeCode: challenge.code,
      challengeToken: challenge.token,
    },
  })
  expect(login.ok()).toBe(true)
  await page.goto("/search")
  await expect(page.locator("main article").first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }))
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(900)
  const snapshot = () =>
    page.evaluate(() => ({
      scrollY,
      scrollX,
      clientWidth: document.documentElement.clientWidth,
      bodyWidth: document.body.getBoundingClientRect().width,
      scrollHeight: document.documentElement.scrollHeight,
    }))
  const before = await snapshot()
  const trigger = page.getByTestId("mobile-sidebar-trigger")
  const triggerBox = await trigger.boundingBox()
  if (!triggerBox) throw new Error("Missing mobile menu trigger")
  await page.touchscreen.tap(
    triggerBox.x + triggerBox.width / 2,
    triggerBox.y + triggerBox.height / 2,
  )
  const dialog = page.getByRole("dialog", { name: "เมนูทั้งหมด" })
  await expect(dialog).toBeVisible()
  await expect.poll(async () => Math.round((await dialog.boundingBox())?.x ?? -999)).toBe(0)
  expect(await snapshot()).toEqual(before)
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(await snapshot()).toEqual(before)
})
