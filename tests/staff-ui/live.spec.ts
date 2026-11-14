import { expect, test } from "@playwright/test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const credentialPath = resolve("tmp/staff-audit-credentials.json")

test("live staff login and every admin screen load without request or rendering errors", async ({ page }, info) => {
  test.skip(!existsSync(credentialPath), "Requires the isolated staff audit fixture")
  const credentials = JSON.parse(readFileSync(credentialPath, "utf8")) as {
    admin: { username: string; password: string }
  }
  const failures: string[] = []
  page.on("pageerror", (error) => failures.push(error.message))
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
  })
  await page.goto("/")
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill(credentials.admin.username)
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(credentials.admin.password)
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click()
  await expect(page.locator("main h1")).toContainText("สวัสดี")
  for (const path of ["/terms", "/accounts", "/students", "/catalog", "/advisor-codes"]) {
    const catalogResponse = path === "/catalog"
      ? page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/staff/catalog" && response.request().method() === "GET")
      : null
    await page.goto(path)
    await expect(page.locator("main h1")).toBeVisible()
    if (path === "/terms") await expect(page.locator("table tbody tr").first()).toBeVisible()
    if (path === "/accounts") await expect(page.getByRole("heading", { name: "เจ้าหน้าที่และอาจารย์", exact: true })).toBeVisible()
    if (catalogResponse) {
      const response = await catalogResponse
      expect(response.status()).toBe(200)
      const result = await response.json() as { data: { id: number; courseCode: string; sections: { meetings: unknown[] }[] }[] }
      expect(result.data.length).toBeGreaterThan(0)
      await expect(page.getByRole("button", { name: "แก้ไข", exact: true }).first()).toBeVisible()
      await page.screenshot({ path: `tmp/staff-live-${info.project.name}-catalog-populated.png` })
      const offering = result.data.find((item) => item.sections.some((section) => section.meetings.length > 0))
      expect(offering).toBeDefined()
      if (!offering) throw new Error("No catalogue offering has sections")
      const row = page.getByRole("row").filter({ has: page.getByText(offering.courseCode, { exact: true }) })
      await row.getByRole("button", { name: "แก้ไข", exact: true }).click()
      await page.getByRole("button", { name: "รายละเอียด", exact: true }).nth(offering.sections.findIndex((section) => section.meetings.length > 0)).click()
      await expect(page.getByLabel("ประเภทการเรียน", { exact: true }).first()).toBeVisible()
      await expect(page.getByLabel("ชื่อภาษาอังกฤษ", { exact: true })).not.toHaveValue("")
    }
    if (path === "/advisor-codes") await expect(page.getByRole("button", { name: "ภาคการศึกษา" })).toBeVisible()
    await expect(page.getByRole("alert")).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: `tmp/staff-live-${info.project.name}-${path.slice(1)}.png` })
  }
  expect(failures).toEqual([])
})
