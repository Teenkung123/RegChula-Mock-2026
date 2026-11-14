import AxeBuilder from "@axe-core/playwright"
import { expect } from "@playwright/test"
import { randomStudentId, test } from "../e2e/identity"

test("student screens remain usable at desktop and phone widths", async ({ page }, info) => {
  const studentId = await randomStudentId()
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("response", (response) => {
    if (response.status() >= 500 && response.url().includes("/api/")) {
      errors.push(`${response.status()} ${new URL(response.url()).pathname}`)
    }
  })
  await page.goto("/login")
  await expect(page.getByTestId("challenge-code")).toHaveText(/^\d{4}$/)
  await page.getByLabel("รหัสนิสิต", { exact: true }).fill(studentId)
  await page.getByLabel("รหัสผ่าน", { exact: true }).focus()
  await expect(page.getByText("กรอกรหัสผ่านอย่างน้อย 1 ตัวอักษร")).not.toBeVisible()
  await expect(page.getByText("กรอกตัวเลขให้ครบ 4 หลักตามรหัสด้านบน")).not.toBeVisible()
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("12345678")
  await page
    .getByLabel("กรอกรหัสยืนยัน", { exact: true })
    .fill((await page.getByTestId("challenge-code").textContent())?.trim() ?? "")
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  for (const route of [
    "dashboard",
    "search",
    "register",
    "drop",
    "withdraw",
    "schedule",
    "exams",
    "appearance",
    "account/password",
    "buildings",
    "faculties",
    "navigation",
  ]) {
    await page.goto(`/${route}`)
    await expect(page.locator("main h1")).toBeVisible()
    await expect(page.locator('[data-testid="page-loading"]')).toHaveCount(0)
    if (route === "account/password") {
      const current = page.getByLabel("รหัสผ่านปัจจุบัน", { exact: true })
      const replacement = page.getByLabel("รหัสผ่านใหม่", { exact: true })
      const confirmation = page.getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true })
      await current.fill("incorrect")
      await replacement.fill("StudentAuditPassword2026")
      await confirmation.fill("StudentAuditPassword2026")
      await page.getByRole("button", { name: "บันทึกรหัสผ่าน", exact: true }).click()
      await expect(current).toHaveAttribute("aria-invalid", "true")
      await expect(current).toHaveAccessibleDescription("รหัสผ่านปัจจุบันไม่ถูกต้อง")
      await current.fill("12345678")
      await expect(page.getByText("รหัสผ่านปัจจุบันไม่ถูกต้อง")).not.toBeVisible()
      await page.getByRole("button", { name: "บันทึกรหัสผ่าน", exact: true }).click()
      await expect(page.getByText("เปลี่ยนรหัสผ่านแล้ว", { exact: true })).toBeVisible()
      await current.fill("StudentAuditPassword2026")
      await expect(page.getByText("เปลี่ยนรหัสผ่านแล้ว", { exact: true })).not.toBeVisible()
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      route,
    ).toBe(true)
    const audit = await new AxeBuilder({ page }).exclude('[data-live-announcer="true"]').analyze()
    const severe = audit.violations.filter((issue) =>
      ["serious", "critical"].includes(issue.impact ?? ""),
    )
    expect(
      severe.map((issue) => ({ id: issue.id, targets: issue.nodes.map((node) => node.target) })),
      route,
    ).toEqual([])
    await page.screenshot({
      path: `tmp/student-ux-audit/${info.project.name}-${route.replaceAll("/", "-")}.png`,
      fullPage: true,
    })
  }
  expect(errors).toEqual([])
})
