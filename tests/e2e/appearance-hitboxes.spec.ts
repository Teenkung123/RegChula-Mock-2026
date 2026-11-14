import { expect } from "@playwright/test"
import { randomStudentId, test } from "./identity"

test("appearance cards accept edge clicks and repeated changes during slow saves", async ({
  page,
}) => {
  await page.goto("/login")
  await expect(page.getByTestId("challenge-code")).toHaveText(/^\d{4}$/)
  await page.getByLabel("รหัสนิสิต").fill(await randomStudentId())
  await page.getByLabel("รหัสผ่าน").fill("12345678")
  await page
    .getByLabel("กรอกรหัสยืนยัน")
    .fill((await page.getByTestId("challenge-code").textContent())?.trim() ?? "")
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click()
  await expect(page).toHaveURL(/dashboard/)
  await page.goto("/appearance")
  await page.route("**/api/v1/preferences", async (route) => {
    if (route.request().method() === "PATCH")
      await new Promise((resolve) => setTimeout(resolve, 350))
    await route.continue()
  })
  for (const theme of ["dark", "light", "dark", "system", "light"]) {
    const radio = page.getByRole("radio", {
      name: theme === "dark" ? "โหมดมืด" : theme === "light" ? "โหมดสว่าง" : "ตามการตั้งค่าของอุปกรณ์",
    })
    const field = radio.locator('xpath=ancestor::*[@data-slot="radio"]')
    await field.scrollIntoViewIfNeeded()
    const box = await field.boundingBox()
    expect(box).not.toBeNull()
    if (!box) throw new Error("Missing appearance card")
    await page.mouse.click(box.x + box.width - 5, box.y + box.height / 2)
    await expect(radio).toBeChecked()
    const content = await field.locator('[data-slot="radio-content"]').boundingBox()
    expect(content?.width).toBeGreaterThan(box.width - 4)
  }
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
  await expect(page.getByText("บันทึกการตั้งค่าแล้ว", { exact: true })).toBeVisible()

  for (const accent of ["Coral", "Indigo", "Mint"]) {
    const option = page.getByRole("option", { name: accent })
    await option.scrollIntoViewIfNeeded()
    const box = await option.boundingBox()
    expect(box).not.toBeNull()
    if (!box) throw new Error("Missing accent swatch")
    await page.mouse.click(box.x + box.width - 5, box.y + box.height / 2)
    await expect(option).toHaveAttribute("aria-selected", "true")
  }
  await expect(page.locator("html")).toHaveCSS("--color-accent", "#168065")

  await page.getByRole("button", { name: /เลือกสีเอง/ }).click()
  const customColor = page.getByRole("textbox", { name: /เลือกสีเอง/ })
  await customColor.fill("#336699")
  await expect(page.locator("html")).toHaveCSS("--color-accent", "#336699")
  const hue = page.getByRole("slider", { name: "เฉดสี" })
  await hue.focus()
  await hue.press("ArrowRight")
  await expect(customColor).toBeVisible()
  await page.getByRole("button", { name: "ยกเลิก" }).click()
  await expect(customColor).toBeHidden()
  await expect(page.locator("html")).toHaveCSS("--color-accent", "#168065")

  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
  await expect(page.getByRole("option", { name: "Mint" })).toHaveAttribute("aria-selected", "true")
})
