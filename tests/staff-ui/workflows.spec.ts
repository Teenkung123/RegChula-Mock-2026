import { expect, test, type Locator, type Page } from "@playwright/test"

const admin = { id: "staff-1", username: "administrator", displayName: "เจ้าหน้าที่ทะเบียน", role: "admin", active: true }
const terms = [{ id: 1, academicYear: 2569, semester: 1, label: "2569/1", active: true, isCurrent: true, opensAt: null, closesAt: null }]
const student = { studentId: "9900000001", active: true, advisorId: null, advisorName: null }
const profile = { studentId: student.studentId, firstTermId: 1, academicLevel: "undergraduate", code: null as string | null }
const registration = { registrationId: 1, termLabel: "2569/1", courseCode: "2301101", nameTh: "แคลคูลัส", nameEn: "Calculus", sectionNo: "1", status: "active", credits: 3 }
const offering = {
  id: 11, courseCode: "2301101", nameTh: "แคลคูลัส", nameEn: "Calculus", faculty: "Science", department: "Mathematics", credits: 3, active: true,
  studyPrograms: ["S"], midtermDate: null, finalDate: null,
  sections: [{ id: 21, sectionNo: "1", capacity: 30, baselineEnrolled: 10, localActive: 1, closed: false, active: true, note: null, genEdType: null,
    meetings: [{ id: 31, classType: "LECT", dayCode: "MO", startMinute: 540, endMinute: 600, periodLabel: "09:00–10:00", building: "Math", room: "101", teachers: ["อาจารย์"], arranged: false }] }],
}

type Call = { path: string; method: string; body: Record<string, unknown> | null }
const saveAndExit = "บันทึกและปิด"
const mutations = (calls: Call[]) => calls.filter((call) => call.method !== "GET" && !call.path.startsWith("/auth/"))
async function selectOption(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByLabel(label, { exact: true }).click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

async function expectCenteredConfirmation(dialog: Locator) {
  await expect.poll(() => dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return Math.max(
      Math.abs(bounds.x + bounds.width / 2 - innerWidth / 2),
      Math.abs(bounds.y + bounds.height / 2 - innerHeight / 2),
    )
  })).toBeLessThanOrEqual(2)
  await expect(dialog.getByRole("button", { name: "ปิด", exact: true })).toBeVisible()
  await expect(dialog.locator(".staff-editor-footer")).toBeInViewport()
}
type MockOptions = {
  refreshFailure?: "accounts" | "enrollments" | "terms" | "catalog"
  expiredTerms?: boolean
  populated?: boolean
  mutationGate?: Promise<void>
  mutationFailure?: string
}
async function mockStaff(page: Page, options: MockOptions = {}) {
  const calls: Call[] = []
  let changed = false
  let code = profile.code
  const termRows = options.populated
    ? Array.from({ length: 25 }, (_, index) => ({ ...terms[0], id: index + 1, label: `${2569 - Math.floor(index / 3)}/${index % 3 + 1}`, isCurrent: index === 0 }))
    : terms
  const accountRows = options.populated
    ? [admin, ...Array.from({ length: 19 }, (_, index) => ({ ...admin, id: `advisor-${index}`, username: `advisor.${index + 1}`, displayName: `อาจารย์ที่ปรึกษา ${index + 1}`, role: "advisor" }))]
    : [admin]
  const courseRows = options.populated
    ? Array.from({ length: 40 }, (_, index) => ({ ...offering, id: offering.id + index, courseCode: String(Number(offering.courseCode) + index) }))
    : []
  await page.route("**/api/v1/staff/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace("/api/v1/staff", "")
    const method = request.method()
    const body = request.postData() ? JSON.parse(request.postData() ?? "null") : null
    calls.push({ path, method, body })
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: status === 200 ? { data } : { detail: data } })
    if (path === "/auth/me" || path === "/auth/login") return json(admin)
    if (path === "/auth/logout") return json({ loggedOut: true })
    if (method !== "GET") {
      await options.mutationGate
      if (options.mutationFailure) return json(options.mutationFailure, 422)
      changed = true
    }
    if (path === "/terms") {
      if (options.expiredTerms) return json("Session expired", 401)
      if (changed && options.refreshFailure === "terms") return json("Refresh unavailable", 503)
      return json(termRows)
    }
    if (path === "/accounts") {
      if (method === "POST") { changed = true; return json({ ...admin, id: "new-account" }) }
      if (changed && options.refreshFailure === "accounts") return json("Refresh unavailable", 503)
      return json(accountRows)
    }
    if (path === "/students") return json([student])
    if (path === "/advisor-codes") return json({ students: [{ ...profile, code }] })
    if (path.startsWith("/advisor-codes/")) { code = body?.rotate ? "rotated-code" : "issued-code"; return json({ code }) }
    if (path === "/enrollments") {
      if (changed && options.refreshFailure === "enrollments") return json("Refresh unavailable", 503)
      return json({ studentId: student.studentId, registrations: [{ ...registration, status: changed ? "withdrawn" : "active" }] })
    }
    if (path === "/enrollments/1/withdraw") { changed = true; return json({ registrationId: 1, status: "withdrawn" }) }
    if (path === "/catalog") {
      if (changed && options.refreshFailure === "catalog") return json("Refresh unavailable", 503)
      return json(courseRows)
    }
    if (method === "PATCH" || method === "PUT" || method === "POST") return json({ updated: true })
    return json([])
  })
  return calls
}

test("staff pages fit narrow screens and mobile navigation restores focus", async ({ page }, info) => {
  await mockStaff(page)
  for (const path of ["/", "/terms", "/accounts", "/students", "/catalog", "/advisor-codes"]) {
    await page.goto(path)
    await expect(page.locator("main h1")).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(overflow, `Page overflow on ${path}`).toBe(false)
    await page.screenshot({ path: `tmp/staff-ui-${info.project.name}-${path.replaceAll("/", "") || "dashboard"}.png`, fullPage: true })
  }
  if (info.project.name.startsWith("mobile")) {
    const menu = page.getByRole("button", { name: "เปิดเมนู" })
    await menu.click()
    const drawer = page.getByRole("dialog", { name: "เมนูหลัก" })
    await expect(drawer).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(drawer).not.toBeVisible()
    await expect(menu).toBeFocused()
  }
})

test("expired staff sessions return to the sign-in form", async ({ page }) => {
  await mockStaff(page, { expiredTerms: true })
  await page.goto("/terms")
  await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ", exact: true })).toBeVisible()
  await expect(page.getByLabel("ชื่อผู้ใช้", { exact: true })).toBeVisible()
})

test("term editor sends timezone-aware registration dates", async ({ page }) => {
  const calls = await mockStaff(page)
  await page.goto("/terms")
  await page.getByRole("button", { name: "แก้ไข", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "แก้ไข 2569/1", exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("เริ่มลงทะเบียน", { exact: true }).fill("2026-01-01T08:00")
  await dialog.getByLabel("สิ้นสุดการลงทะเบียน", { exact: true }).fill("2026-12-31T18:00")
  await dialog.getByRole("button", { name: saveAndExit, exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole("status")).toContainText("บันทึกภาคการศึกษาแล้ว")
  const saved = calls.find((call) => call.path === "/terms/1" && call.method === "PATCH")
  expect(saved?.body?.opensAt).toMatch(/Z$/)
  expect(saved?.body?.closesAt).toMatch(/Z$/)
})

test("a completed withdrawal closes its confirmation even when refresh fails", async ({ page }) => {
  const calls = await mockStaff(page, { refreshFailure: "enrollments" })
  await page.goto("/students")
  await page.getByLabel("เลขประจำตัวนิสิต", { exact: true }).fill(student.studentId)
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click()
  const trigger = page.getByRole("button", { name: "ถอน", exact: true })
  await trigger.scrollIntoViewIfNeeded()
  const scrollBefore = await page.evaluate(() => scrollY)
  await trigger.click()
  const dialog = page.getByRole("alertdialog", { name: "ยืนยันการถอนรายวิชา", exact: true })
  await expect(dialog).toBeVisible()
  await expectCenteredConfirmation(dialog)
  expect(Math.abs(await page.evaluate(() => scrollY) - scrollBefore)).toBeLessThanOrEqual(1)
  await page.keyboard.press("Escape")
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.press("Enter")
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("button", { name: "ยืนยัน", exact: true })).toBeDisabled()
  await dialog.getByLabel("เหตุผล", { exact: true }).fill("คำร้องได้รับอนุมัติ")
  await dialog.getByLabel("เลขอ้างอิงคำร้องที่อนุมัติ", { exact: true }).fill("REG-2026-001")
  await dialog.getByRole("button", { name: "ยืนยัน", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole("status")).toContainText("บันทึกการถอนรายวิชาแล้ว")
  await expect(page.locator("main").getByRole("alert")).toContainText("บันทึกแล้ว")
  await expect(page.getByRole("heading", { name: "รายการลงทะเบียน", exact: true })).toBeFocused()
  expect(calls.filter((call) => call.path === "/enrollments/1/withdraw")).toHaveLength(1)
})

test("successful account creation closes its modal when the following refresh fails", async ({ page }) => {
  const calls = await mockStaff(page, { refreshFailure: "accounts" })
  await page.goto("/accounts")
  const trigger = page.getByRole("button", { name: "เพิ่มบัญชี", exact: true })
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "เพิ่มบัญชีเจ้าหน้าที่", exact: true })
  await dialog.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("advisor.new")
  await dialog.getByLabel("ชื่อที่แสดง", { exact: true }).fill("อาจารย์ใหม่")
  await dialog.getByLabel("รหัสผ่าน", { exact: true }).fill("TemporaryPass123!")
  await dialog.getByRole("button", { name: saveAndExit, exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole("status")).toContainText("เพิ่มบัญชีแล้ว")
  await expect(page.locator("main").getByRole("alert")).toContainText("บันทึกแล้ว")
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(page.getByLabel("ชื่อผู้ใช้", { exact: true })).toHaveValue("")
  expect(calls.filter((call) => call.path === "/accounts" && call.method === "POST")).toHaveLength(1)
})

test("code issuance and rotation require the selected student and confirmation", async ({ page }) => {
  const calls = await mockStaff(page)
  await page.goto("/advisor-codes")
  await page.getByRole("button", { name: "ออกรหัส", exact: true }).click()
  await expect(page.getByText("issued-code", { exact: true })).toBeVisible()
  const trigger = page.getByRole("button", { name: "เปลี่ยนรหัส", exact: true })
  await trigger.click()
  const dialog = page.getByRole("alertdialog", { name: "เปลี่ยนรหัสลงทะเบียน", exact: true })
  await expect(dialog).toBeVisible()
  await expectCenteredConfirmation(dialog)
  await dialog.getByRole("button", { name: "เปลี่ยนรหัส", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText("rotated-code", { exact: true })).toBeVisible()
  await expect(trigger).toBeFocused()
  expect(calls.filter((call) => call.path.endsWith(student.studentId)).map((call) => call.body?.rotate)).toEqual([false, true])
})

test("catalog saves fields from every tab and meeting IDs in one footer action", async ({ page }) => {
  const calls = await mockStaff(page)
  await page.route("**/api/v1/staff/catalog?*", (route) => route.fulfill({ json: { data: [offering] } }))
  await page.goto("/catalog")
  await page.getByRole("button", { name: "แก้ไข", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "แก้ไข 2301101", exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("ชื่อภาษาอังกฤษ", { exact: true }).fill("Calculus and Applications")
  await dialog.getByRole("tab", { name: "การสอบ", exact: true }).click()
  await dialog.getByLabel("วันสอบกลางภาค", { exact: true }).fill("2026-11-12")
  await dialog.getByLabel("เวลาเริ่มสอบกลางภาค", { exact: true }).fill("09:00")
  await dialog.getByLabel("เวลาสิ้นสุดสอบกลางภาค", { exact: true }).fill("12:00")
  await dialog.getByRole("tab", { name: "ตอนเรียน", exact: true }).click()
  await dialog.getByRole("button", { name: "รายละเอียด", exact: true }).click()
  await dialog.getByLabel("ห้อง", { exact: true }).fill("202")
  await dialog.getByRole("button", { name: "กลับไปตอนเรียน", exact: true }).click()
  expect(mutations(calls)).toHaveLength(0)
  await dialog.locator(".staff-editor-footer").getByRole("button", { name: saveAndExit, exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(mutations(calls)).toHaveLength(1)
  const saved = mutations(calls)[0]
  expect(saved.path).toBe("/catalog/offerings/11/editor")
  expect(saved.method).toBe("PUT")
  expect(saved.body).toMatchObject({ nameEn: "Calculus and Applications", midtermDate: "2026-11-12", midtermStartMinute: 540, midtermEndMinute: 720 })
  expect(saved.body?.sections).toEqual([expect.objectContaining({ id: 21, meetings: [expect.objectContaining({ id: 31, room: "202", startMinute: 540, endMinute: 600 })] })])
})

test("catalog import requires preview and overall confirmation and export downloads JSON", async ({ page }) => {
  const calls = await mockStaff(page)
  await page.route("**/api/v1/staff/catalog/import/preview", (route) => route.fulfill({ json: { data: {
    checksum: "a".repeat(64), courseCount: 1, sectionCount: 1, terms: [{ academicYear: 2569, semester: 1 }], reviewTerms: [], warnings: [],
    changes: [{ academicYear: 2569, semester: 1, added: 1, replaced: 0, removed: 0, overCapacitySections: 0 }],
  } } }))
  await page.route("**/api/v1/staff/catalog/export?*", (route) => route.fulfill({ contentType: "application/json", body: "{}" }))
  await page.goto("/catalog")
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "ส่งออก JSON", exact: true }).click()
  expect((await download).suggestedFilename()).toBe("catalog-1.json")
  await page.getByRole("button", { name: "นำเข้าข้อมูล", exact: true }).click()
  const importer = page.getByRole("dialog", { name: "นำเข้าข้อมูลรายวิชา", exact: true })
  await expect(importer).toBeVisible()
  await importer.getByLabel("ไฟล์รายวิชา JSON", { exact: true }).setInputFiles({ name: "catalog.json", mimeType: "application/json", buffer: Buffer.from('{"datasets":[]}') })
  await importer.getByRole("button", { name: "ตรวจสอบข้อมูล", exact: true }).click()
  await importer.getByRole("button", { name: "นำเข้าข้อมูลรายวิชา", exact: true }).click()
  const dialog = page.getByRole("alertdialog", { name: "ยืนยันการนำเข้ารายวิชา", exact: true })
  await expect(dialog).toBeVisible()
  await expectCenteredConfirmation(dialog)
  expect(calls.some((call) => call.path === "/catalog/import/confirm")).toBe(false)
  await dialog.getByRole("button", { name: "ยืนยันการนำเข้า", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(importer).not.toBeVisible()
  await expect(page.locator("main").getByRole("status")).toContainText("นำเข้าข้อมูลรายวิชาแล้ว")
  expect(calls.some((call) => call.path === "/catalog/import/confirm")).toBe(true)
})

test("first-row editors open immediately above long lists and restore their triggers", async ({ page }, info) => {
  await mockStaff(page, { populated: true })
  for (const route of ["/terms", "/accounts", "/catalog"]) {
    await test.step(route, async () => {
      await page.goto(route)
      const trigger = page.getByRole("button", { name: "แก้ไข", exact: true }).first()
      await trigger.scrollIntoViewIfNeeded()
      const scrollBefore = await page.evaluate(() => scrollY)
      await trigger.click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()
      await expect(dialog).toBeInViewport()
      const close = dialog.locator(".staff-editor-header").getByRole("button", { name: "ปิด", exact: true })
      await expect(close).toBeVisible()
      await expect.poll(() => dialog.evaluate((element) => {
        const header = element.querySelector<HTMLElement>(".staff-editor-header")
        const closeButton = header?.querySelector<HTMLElement>(".staff-editor-close")
        const title = header?.querySelector<HTMLElement>("h2")
        if (!header || !closeButton || !title) return false
        const headerBox = header.getBoundingClientRect()
        const closeBox = closeButton.getBoundingClientRect()
        const titleBox = title.getBoundingClientRect()
        const style = getComputedStyle(header)
        return Math.abs(headerBox.right - closeBox.right - Number.parseFloat(style.paddingRight)) <= 2
          && Math.abs(closeBox.top - headerBox.top - Number.parseFloat(style.paddingTop)) <= 2
          && titleBox.right <= closeBox.left
      })).toBe(true)
      expect(Math.abs(await page.evaluate(() => scrollY) - scrollBefore)).toBeLessThanOrEqual(1)
      await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
      expect(await page.locator("main input").count(), `An editor remained under ${route}'s table`).toBe(route === "/catalog" ? 1 : route === "/accounts" ? 1 : 0)
      if (route === "/terms") {
        await dialog.evaluate(async (element) => {
          const animations: Animation[] = []
          for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
            animations.push(...ancestor.getAnimations())
          }
          await Promise.all(animations
            .filter((animation) => animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
            .map((animation) => animation.finished.catch(() => {})))
        })
        await page.screenshot({ path: `tmp/staff-modal-close-${info.project.name}.png` })
      }
      await page.keyboard.press("Escape")
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeFocused()
      await trigger.click()
      await expect(dialog).toBeVisible()
      await close.click()
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeFocused()
    })
  }
})

test("new term and student management are visible modal tasks", async ({ page }) => {
  await mockStaff(page, { populated: true })
  await page.goto("/terms")
  const add = page.getByRole("button", { name: "เพิ่มภาคการศึกษา", exact: true })
  await expect(add).toBeInViewport()
  await add.click()
  const termDialog = page.getByRole("dialog", { name: "เพิ่มภาคการศึกษา", exact: true })
  await expect(termDialog).toBeVisible()
  await expect(termDialog.getByLabel("ปีการศึกษา", { exact: true })).toBeFocused()
  await termDialog.getByRole("button", { name: "ยกเลิก", exact: true }).click()
  await expect(termDialog).not.toBeVisible()
  await expect(add).toBeFocused()

  await page.goto("/accounts")
  const manage = page.getByRole("button", { name: "จัดการ", exact: true }).first()
  await manage.click()
  const studentDialog = page.getByRole("dialog", { name: `ข้อมูลนิสิต ${student.studentId}`, exact: true })
  await expect(studentDialog).toBeVisible()
  await expect(studentDialog.getByLabel("อาจารย์ที่ปรึกษา", { exact: true })).toBeVisible()
  await studentDialog.locator(".staff-editor-footer").getByRole("button", { name: "ยกเลิก", exact: true }).click()
  await expect(studentDialog).not.toBeVisible()
  await expect(manage).toBeFocused()
})

test("long course details scroll inside the modal while Save and Cancel remain visible", async ({ page }) => {
  await mockStaff(page, { populated: true })
  await page.goto("/catalog")
  const trigger = page.getByRole("button", { name: "แก้ไข", exact: true }).first()
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "แก้ไข 2301101", exact: true })
  const save = dialog.getByRole("button", { name: saveAndExit, exact: true })
  const cancel = dialog.getByRole("button", { name: "ยกเลิก", exact: true })
  const body = dialog.locator(".staff-editor-body")
  await expect(save).toBeInViewport({ ratio: 1 })
  await expect(cancel).toBeInViewport({ ratio: 1 })
  await body.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(save).toBeInViewport({ ratio: 1 })
  await expect(cancel).toBeInViewport({ ratio: 1 })
  const dimensions = await dialog.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    overflowing: [...element.querySelectorAll<HTMLElement>("*")]
      .filter((child) => child.getBoundingClientRect().right > element.getBoundingClientRect().right + 1)
      .slice(0, 5).map((child) => ({ tag: child.tagName, className: child.className, width: child.getBoundingClientRect().width })),
  }))
  expect(dimensions.scrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.clientWidth + 1)
  await cancel.click()
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test("term save announces pending work and prevents dismissing an unfinished save", async ({ page }) => {
  let finish = () => {}
  const gate = new Promise<void>((resolve) => { finish = resolve })
  const calls = await mockStaff(page, { mutationGate: gate })
  await page.goto("/terms")
  await page.getByRole("button", { name: "แก้ไข", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "แก้ไข 2569/1", exact: true })
  try {
    await dialog.getByLabel("ชื่อภาคการศึกษา", { exact: true }).fill("ภาคต้น 2569")
    await dialog.getByRole("button", { name: saveAndExit, exact: true }).click()
    await expect(dialog.getByRole("button", { name: /กำลังบันทึก/ })).toBeDisabled()
    await expect(dialog.getByRole("button", { name: "ยกเลิก", exact: true })).toBeDisabled()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeVisible()
  } finally {
    finish()
  }
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole("status")).toContainText("บันทึกภาคการศึกษาแล้ว")
  expect(calls.filter((call) => call.path === "/terms/1" && call.method === "PATCH")).toHaveLength(1)
})

test("failed term saves keep input and error feedback inside the visible modal", async ({ page }) => {
  await mockStaff(page, { mutationFailure: "ไม่สามารถบันทึกช่วงเวลานี้ได้" })
  await page.goto("/terms")
  await page.getByRole("button", { name: "แก้ไข", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "แก้ไข 2569/1", exact: true })
  await dialog.getByLabel("ชื่อภาคการศึกษา", { exact: true }).fill("ภาคต้น 2569")
  await dialog.getByRole("button", { name: saveAndExit, exact: true }).click()
  const error = dialog.getByRole("alert")
  await expect(error).toHaveText("ไม่สามารถบันทึกช่วงเวลานี้ได้")
  await expect(error).toBeInViewport()
  await expect(dialog.getByLabel("ชื่อภาคการศึกษา", { exact: true })).toHaveValue("ภาคต้น 2569")
  await expect(dialog.getByRole("button", { name: saveAndExit, exact: true })).toBeEnabled()
})

test("a saved term closes its modal and offers refresh recovery without another write", async ({ page }) => {
  const calls = await mockStaff(page, { refreshFailure: "terms" })
  await page.goto("/terms")
  await page.getByRole("button", { name: "แก้ไข", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "แก้ไข 2569/1", exact: true })
  await dialog.getByLabel("ชื่อภาคการศึกษา", { exact: true }).fill("ภาคต้น 2569")
  await dialog.getByRole("button", { name: saveAndExit, exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole("status")).toContainText("บันทึกภาคการศึกษาแล้ว")
  await expect(page.locator("main").getByRole("alert")).toContainText("บันทึกแล้ว")
  expect(calls.filter((call) => call.path === "/terms/1" && call.method === "PATCH")).toHaveLength(1)
})

test("term status and current-term choices stay local until Save and exit", async ({ page }) => {
  const calls = await mockStaff(page, { populated: true })
  await page.goto("/terms")
  const trigger = page.getByRole("button", { name: "แก้ไข", exact: true }).nth(1)
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "แก้ไข 2569/2", exact: true })
  await selectOption(page, dialog, "การใช้งาน", "ปิดใช้งาน")
  expect(mutations(calls)).toHaveLength(0)
  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await trigger.click()
  await expect(dialog.getByLabel("การใช้งาน", { exact: true })).toContainText("เปิดใช้งาน")
  await dialog.getByLabel("ชื่อภาคการศึกษา", { exact: true }).fill("ภาคปลาย 2569")
  await selectOption(page, dialog, "ภาคการศึกษาปัจจุบัน", "ตั้งเป็นภาคปัจจุบัน")
  expect(mutations(calls)).toHaveLength(0)
  await dialog.getByRole("button", { name: saveAndExit, exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(mutations(calls)).toHaveLength(1)
  expect(mutations(calls)[0]).toMatchObject({ path: "/terms/2", method: "PATCH", body: { label: "ภาคปลาย 2569", active: true, isCurrent: true } })
})

test("student advisor and education edits share one Save and exit request", async ({ page }) => {
  const calls = await mockStaff(page, { populated: true })
  await page.goto("/accounts")
  await page.getByRole("button", { name: "จัดการ", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: `ข้อมูลนิสิต ${student.studentId}`, exact: true })
  await selectOption(page, dialog, "อาจารย์ที่ปรึกษา", "อาจารย์ที่ปรึกษา 1")
  await selectOption(page, dialog, "ภาคการศึกษาแรก", "2569/2")
  await selectOption(page, dialog, "ระดับการศึกษา", "บัณฑิตศึกษา")
  expect(mutations(calls)).toHaveLength(0)
  await dialog.locator(".staff-editor-footer").getByRole("button", { name: saveAndExit, exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(mutations(calls)).toHaveLength(1)
  expect(mutations(calls)[0]).toMatchObject({
    path: `/students/${student.studentId}/editor`, method: "PUT",
    body: { advisorId: "advisor-0", firstTermId: 2, academicLevel: "graduate", active: true },
  })
})

test("student Cancel discards edits without a partial save", async ({ page }) => {
  const calls = await mockStaff(page, { populated: true })
  await page.goto("/accounts")
  const trigger = page.getByRole("button", { name: "จัดการ", exact: true })
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: `ข้อมูลนิสิต ${student.studentId}`, exact: true })
  await selectOption(page, dialog, "ระดับการศึกษา", "บัณฑิตศึกษา")
  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(mutations(calls)).toHaveLength(0)
  await trigger.click()
  await expect(dialog.getByLabel("ระดับการศึกษา", { exact: true })).toContainText("ปริญญาตรี")
})

test("student account status is staged and confirmed with the unified save", async ({ page }) => {
  const calls = await mockStaff(page, { populated: true })
  await page.goto("/accounts")
  await page.getByRole("button", { name: "จัดการ", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: `ข้อมูลนิสิต ${student.studentId}`, exact: true })
  await selectOption(page, dialog, "ระดับการศึกษา", "บัณฑิตศึกษา")
  await dialog.getByRole("tab", { name: "บัญชี", exact: true }).click()
  await selectOption(page, dialog, "สถานะบัญชี", "ระงับ")
  expect(mutations(calls)).toHaveLength(0)
  await dialog.getByRole("button", { name: saveAndExit, exact: true }).click()
  const confirmation = page.getByRole("alertdialog", { name: "ยืนยันการจัดการบัญชีนิสิต", exact: true })
  await expectCenteredConfirmation(confirmation)
  await expect(confirmation).toBeVisible()
  expect(mutations(calls)).toHaveLength(0)
  await confirmation.getByRole("button", { name: "ยืนยัน", exact: true }).click()
  await expect(confirmation).not.toBeVisible()
  await expect(dialog).not.toBeVisible()
  expect(mutations(calls)).toHaveLength(1)
  expect(mutations(calls)[0]).toMatchObject({ path: `/students/${student.studentId}/editor`, method: "PUT", body: { academicLevel: "graduate", active: false } })
})

test("a failed unified student save keeps the draft inside its modal", async ({ page }) => {
  const calls = await mockStaff(page, { populated: true, mutationFailure: "บันทึกข้อมูลนิสิตไม่ได้" })
  await page.goto("/accounts")
  await page.getByRole("button", { name: "จัดการ", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: `ข้อมูลนิสิต ${student.studentId}`, exact: true })
  await selectOption(page, dialog, "ระดับการศึกษา", "บัณฑิตศึกษา")
  await dialog.getByRole("button", { name: saveAndExit, exact: true }).click()
  await expect(dialog.getByRole("alert")).toHaveText("บันทึกข้อมูลนิสิตไม่ได้")
  await expect(dialog.getByLabel("ระดับการศึกษา", { exact: true })).toContainText("บัณฑิตศึกษา")
  await expect(dialog.getByRole("button", { name: saveAndExit, exact: true })).toBeEnabled()
  expect(mutations(calls)).toHaveLength(1)
})

test("course Cancel discards staged fields and section changes", async ({ page }) => {
  const calls = await mockStaff(page, { populated: true })
  await page.goto("/catalog")
  const trigger = page.getByRole("button", { name: "แก้ไข", exact: true }).first()
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "แก้ไข 2301101", exact: true })
  await dialog.getByLabel("ชื่อภาษาอังกฤษ", { exact: true }).fill("Unsaved calculus")
  await dialog.getByRole("tab", { name: "ตอนเรียน", exact: true }).click()
  await dialog.getByRole("button", { name: "รายละเอียด", exact: true }).click()
  await dialog.getByLabel("ห้อง", { exact: true }).fill("404")
  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(mutations(calls)).toHaveLength(0)
  await trigger.click()
  await expect(dialog.getByLabel("ชื่อภาษาอังกฤษ", { exact: true })).toHaveValue("Calculus")
})

test("desktop search input and button occupy the same usable row", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Narrow screens intentionally stack when needed")
  await mockStaff(page)
  for (const [route, inputLabel, buttonLabel] of [
    ["/students", "เลขประจำตัวนิสิต", "ค้นหา"],
    ["/catalog", "ค้นหารายวิชา", "ส่งออก JSON"],
  ]) {
    await test.step(route, async () => {
      await page.goto(route)
      const input = page.getByLabel(inputLabel, { exact: true })
      const button = page.getByRole("button", { name: buttonLabel, exact: true })
      const inputBox = await input.boundingBox()
      const buttonBox = await button.boundingBox()
      expect(inputBox).not.toBeNull()
      expect(buttonBox).not.toBeNull()
      if (!inputBox || !buttonBox) throw new Error("Search controls have no visible bounds")
      expect(Math.abs(inputBox.y + inputBox.height / 2 - buttonBox.y - buttonBox.height / 2)).toBeLessThanOrEqual(8)
      expect(buttonBox.x).toBeGreaterThan(inputBox.x + inputBox.width - 1)
      expect(buttonBox.x - inputBox.x - inputBox.width).toBeLessThanOrEqual(24)
    })
  }
})
