import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import { randomStudentId, test } from "./identity"

async function login(page: Page, studentId: string, rememberMe = false) {
  await page.goto("/login")
  const challenge = page.getByTestId("challenge-code")
  await expect(challenge).toHaveText(/^\d{4}$/)
  const code = (await challenge.textContent())?.trim()
  expect(code).toMatch(/^\d{4}$/)
  await page.getByLabel("รหัสนิสิต").fill(studentId)
  await page.getByLabel("รหัสผ่าน").fill("12345678")
  if (rememberMe) await page.getByText("จดจำการเข้าสู่ระบบบนอุปกรณ์นี้").click()
  await page.getByLabel("กรอกรหัสยืนยัน").fill(code ?? "")
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test("Remember Me is opt-in", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByRole("checkbox", { name: /จดจำการเข้าสู่ระบบ/ })).not.toBeChecked()
  await login(
    page,
    await randomStudentId(),
    true,
  )
  const response = await page.request.get("http://localhost:3000/api/v1/me")
  expect(response.ok()).toBe(true)
  expect(((await response.json()) as { data: { rememberMe: boolean } }).data.rememberMe).toBe(true)
})

async function dropActiveCourses(page: Page, courseCodes: string[]) {
  const registrationsResponse = await page.request.get("http://localhost:3000/api/v1/registrations")
  expect(registrationsResponse.ok()).toBe(true)
  const registrationsBody = (await registrationsResponse.json()) as {
    data: {
      registrations: Array<{
        registrationId: number
        courseCode: string
        status: string
      }>
    }
  }
  const registrationIds = registrationsBody.data.registrations
    .filter((item) => item.status === "active" && courseCodes.includes(item.courseCode))
    .map((item) => item.registrationId)
  if (registrationIds.length === 0) return

  const headers = {
    "content-type": "application/json",
    origin: "http://localhost:5173",
  }
  const previewResponse = await page.request.post(
    "http://localhost:3000/api/v1/registrations/drop-preview",
    { headers, data: { registrationIds } },
  )
  expect(previewResponse.ok()).toBe(true)
  const previewBody = (await previewResponse.json()) as {
    data: { confirmationToken: string }
  }
  const dropResponse = await page.request.post("http://localhost:3000/api/v1/registrations/drop", {
    headers: {
      ...headers,
      "idempotency-key": "e2e-drop-" + crypto.randomUUID(),
    },
    data: { confirmationToken: previewBody.data.confirmationToken },
  })
  expect(dropResponse.ok()).toBe(true)
}

async function registerEligibleCourses(page: Page, count: number) {
  const headers = {
    "content-type": "application/json",
    origin: "http://localhost:5173",
  }
  const catalogResponse = await page.request.get("http://localhost:3000/api/v1/courses?pageSize=20")
  expect(catalogResponse.ok()).toBe(true)
  const catalogBody = (await catalogResponse.json()) as {
    data: Array<{ courseCode: string }>
  }
  const candidates = [
    { courseCode: "0123106", sectionNo: "1" },
    { courseCode: "0295103", sectionNo: "71" },
    ...catalogBody.data.map((course) => ({ courseCode: course.courseCode, sectionNo: "" })),
  ].filter(
    (candidate, index, values) =>
      values.findIndex((item) => item.courseCode === candidate.courseCode) === index,
  )
  const selected: Array<{ courseCode: string; sectionId: number }> = []

  for (const candidate of candidates) {
    if (selected.length >= count) break
    const detailResponse = await page.request.get(
      "http://localhost:3000/api/v1/courses/" + encodeURIComponent(candidate.courseCode),
    )
    if (!detailResponse.ok()) continue
    const detailBody = (await detailResponse.json()) as {
      data: { sections: Array<{ id: number; sectionNo: string }> }
    }
    const preferred = detailBody.data.sections.filter(
      (section) => section.sectionNo === candidate.sectionNo,
    )
    const fallback = detailBody.data.sections
      .filter((section) => section.sectionNo !== candidate.sectionNo)
      .slice(0, 4)
    for (const section of [...preferred, ...fallback]) {
      const previewResponse = await page.request.post(
        "http://localhost:3000/api/v1/registrations/preview",
        { headers, data: { sectionId: section.id, allowAdvisoryOverride: true } },
      )
      if (!previewResponse.ok()) continue
      const previewBody = (await previewResponse.json()) as {
        data: { eligible: boolean; confirmationToken: string | null }
      }
      if (!previewBody.data.eligible || !previewBody.data.confirmationToken) continue
      selected.push({ courseCode: candidate.courseCode, sectionId: section.id })
      break
    }
  }

  expect(selected).toHaveLength(count)
  const previewResponse = await page.request.post(
    "http://localhost:3000/api/v1/registrations/batch-preview",
    {
      headers,
      data: {
        choices: selected.map(({ sectionId }) => ({ sectionId })),
        allowAdvisoryOverride: true,
      },
    },
  )
  expect(previewResponse.ok()).toBe(true)
  const previewBody = (await previewResponse.json()) as {
    data: { eligible: boolean; confirmationToken: string | null }
  }
  expect(previewBody.data.eligible).toBe(true)
  expect(previewBody.data.confirmationToken).not.toBeNull()
  const confirmResponse = await page.request.post(
    "http://localhost:3000/api/v1/registrations/batch",
    {
      headers: {
        ...headers,
        "idempotency-key": "e2e-register-batch-" + crypto.randomUUID(),
      },
      data: { confirmationToken: previewBody.data.confirmationToken },
    },
  )
  expect(confirmResponse.ok()).toBe(true)
  const confirmBody = (await confirmResponse.json()) as {
    data: { registrations: Array<{ courseCode: string; registrationId: number }> }
  }
  expect(confirmBody.data.registrations).toHaveLength(count)
  return confirmBody.data.registrations
}
async function viewportSnapshot(page: Page) {
  return page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    clientWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.getBoundingClientRect().width,
  }))
}

async function touchSwipe(
  page: Page,
  options: {
    startX: number
    startY: number
    endX: number
    endY: number
    targetSelector?: string
  },
) {
  await page.evaluate(({ startX, startY, endX, endY, targetSelector }) => {
    const target = targetSelector
      ? document.querySelector(targetSelector)
      : document.elementFromPoint(startX, startY)
    if (!target) throw new Error("Swipe target was not found")
    const createTouch = (x: number, y: number) =>
      new Touch({
        identifier: 17,
        target,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        pageX: x,
        pageY: y,
        radiusX: 1,
        radiusY: 1,
      })
    const start = createTouch(startX, startY)
    const end = createTouch(endX, endY)
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        touches: [start],
        targetTouches: [start],
        changedTouches: [start],
      }),
    )
    target.dispatchEvent(
      new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        touches: [end],
        targetTouches: [end],
        changedTouches: [end],
      }),
    )
    target.dispatchEvent(
      new TouchEvent("touchend", {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [end],
      }),
    )
  }, options)
}

async function expectLeftDrawerSettled(dialog: Locator) {
  await expect
    .poll(async () => {
      const bounds = await dialog.boundingBox()
      const transitioning = await dialog.evaluate((element) => {
        let current: Element | null = element
        while (current) {
          if (current.hasAttribute("data-entering") || current.hasAttribute("data-exiting")) {
            return true
          }
          current = current.parentElement
        }
        return false
      })
      return Math.abs(bounds?.x ?? 999) < 3 && !transitioning
    })
    .toBe(true)
  await dialog.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
}

async function pointerClick(page: Page, locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  if (!box) throw new Error("Target is not measurable")
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

async function centerForPointer(locator: Locator) {
  await locator.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" }),
  )
}

function visibleRadio(page: Page, label: string) {
  return page.locator("[data-slot='radio-content']").filter({ hasText: label }).last()
}

test("mock login, catalog search, and responsive shell", async ({ page }) => {
  await login(page, await randomStudentId())
  await expect(page.getByRole("heading", { name: "ภาพรวมของคุณ" })).toBeVisible()
  await page.goto("/search")
  const termSelect = page.getByRole("button", { name: "เปลี่ยนภาคการศึกษา" })
  await termSelect.click()
  const termList = page.getByRole("listbox")
  await expect(termList).toBeVisible()
  await expect(termList.getByRole("option")).toHaveCount(18)
  await expect(termList.getByRole("option", { name: "2569/ฤดูร้อน" })).toBeVisible()
  await expect(termList.getByRole("option", { name: "2564/ฤดูร้อน" })).toBeVisible()
  await expect(page.locator('[data-slot="list-box-item-indicator"]:visible')).toHaveCount(1)
  await termList.focus()
  await page.keyboard.press("Escape")
  await page.getByLabel("รหัสหรือชื่อรายวิชา").fill("0123101")
  await expect(page).toHaveURL(/q=0123101/)
  await expect(page.getByText("0123101").first()).toBeVisible()
  await expect(page.getByText("3 หน่วยกิต").first()).toBeVisible()
})

test("profile dropdown owns term context and appearance navigation", async ({ page }) => {
  const studentId = await randomStudentId()
  await login(page, studentId)

  const sidebar = page.locator("aside")
  await expect(sidebar.getByText("ภาคปัจจุบัน")).toHaveCount(0)
  await expect(sidebar.getByRole("link", { name: "การแสดงผล" })).toHaveCount(0)

  await page.getByRole("button", { name: studentId }).click()
  const menu = page.getByRole("menu", { name: studentId })
  await expect(menu).toBeVisible()
  await expect(menu.locator('[data-slot="submenu-indicator"]')).toHaveCount(0)
  expect(await menu.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none")
  await expect(page.getByText("ภาคปัจจุบัน", { exact: true })).toBeVisible()
  await menu.getByRole("menuitem", { name: "การแสดงผล" }).click()
  await expect(page).toHaveURL(/\/appearance$/)
})

test("topbar utilities change language and theme", async ({ page }) => {
  const studentId = await randomStudentId()
  await page.emulateMedia({ colorScheme: "dark" })
  await login(page, studentId)
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  await page.getByRole("button", { name: studentId }).click()
  await page.getByRole("menuitem", { name: /ภาษา/ }).click()
  await page
    .getByRole("menu", { name: /ภาษา/ })
    .getByRole("menuitemradio", { name: "English" })
    .click()
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible()
  await page.getByRole("button", { name: "Toggle light and dark mode" }).click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
  await page.getByRole("button", { name: studentId }).click()
  await page.getByRole("menuitem", { name: /Color mode/ }).click()
  await page
    .getByRole("menu", { name: /Color mode/ })
    .getByRole("menuitemradio", { name: "Match your device setting" })
    .click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
})

test("profile submenus and color picker fit responsive viewports", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Scoped responsive geometry")
  const studentId = await randomStudentId()
  await login(page, studentId)

  for (const width of [320, 375, 414, 768, 2560]) {
    await page.setViewportSize({ width, height: width === 2560 ? 600 : 900 })
    await page.goto("/appearance")
    await page.getByRole("button", { name: /เลือกสีเอง/ }).click()
    const colorPopover = page.locator('[data-slot="color-picker-popover"]')
    const colorArea = colorPopover.locator('[data-slot="color-area"]')
    await expect(colorPopover).not.toHaveAttribute("data-entering", "true")
    const popoverBox = await colorPopover.boundingBox()
    const areaBox = await colorArea.boundingBox()
    expect(popoverBox).not.toBeNull()
    expect(areaBox).not.toBeNull()
    if (!popoverBox || !areaBox) throw new Error("Missing responsive color picker geometry")
    expect(Math.abs(areaBox.width - areaBox.height)).toBeLessThan(2)
    expect(
      Math.abs(areaBox.x + areaBox.width / 2 - (popoverBox.x + popoverBox.width / 2)),
    ).toBeLessThan(2)
    expect(popoverBox.x).toBeGreaterThanOrEqual(0)
    expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(width)
    if (width === 320 || width === 2560) {
      await page.screenshot({ path: `tmp/browser/color-picker-${width}.png` })
    }
    await page.keyboard.press("Escape")

    await page.getByRole("button", { name: studentId }).click()
    await page.getByRole("menuitem", { name: /ภาษา/ }).click()
    const visibleMenus = page.locator('[data-slot="dropdown-popover"]:visible')
    await expect(visibleMenus).toHaveCount(2)
    await expect(visibleMenus.last()).not.toHaveAttribute("data-entering", "true")
    const menuBoxes = await visibleMenus.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect()
        return {
          left: box.left,
          right: box.right,
          outlineStyle: getComputedStyle(element.querySelector('[role="menu"]') ?? element)
            .outlineStyle,
        }
      }),
    )
    expect(menuBoxes.every((box) => box.left >= 0 && box.right <= width)).toBe(true)
    expect(menuBoxes.every((box) => box.outlineStyle === "none")).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 320 || width === 2560) {
      await page.screenshot({ path: `tmp/browser/profile-utilities-${width}.png` })
    }
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")
  }
})

test("topbar search stays compact and offers detailed search", async ({ page }) => {
  await login(page, await randomStudentId())
  const trigger = page.getByRole("button", { name: "ค้นหารายวิชา" })
  await trigger.click()
  const popup = page.getByRole("dialog", { name: "ค้นหารายวิชา" })
  await expect(popup).toBeVisible()
  const box = await popup.boundingBox()
  expect(box?.width ?? 0).toBeLessThan(500)
  await popup.getByRole("combobox", { name: "ค้นหารหัสหรือชื่อวิชา" }).fill("0123101")
  await expect(page.getByRole("option").filter({ hasText: "0123101" })).toBeVisible()
  await page.getByRole("button", { name: "ค้นหาแบบละเอียด" }).click()
  await expect(page).toHaveURL(/q=0123101/)
  await expect(page.locator("#course-search-advanced")).toBeVisible()
})

test("topbar autocomplete accepts keyboard selection and empty searches", async ({
  page,
}) => {
  await login(page, await randomStudentId())
  await page.getByRole("button", { name: "ค้นหารายวิชา", exact: true }).click()
  const input = page.getByRole("combobox", { name: "ค้นหารหัสหรือชื่อวิชา" })
  await input.fill("0123101")
  await expect(page.getByRole("option").filter({ hasText: "0123101" })).toBeVisible()
  await input.press("ArrowDown")
  await input.press("Enter")
  await expect(page).toHaveURL(/q=0123101/)
  await expect(page.getByRole("dialog", { name: "ค้นหารายวิชา" })).toHaveCount(0)
  await page.getByRole("button", { name: "ค้นหารายวิชา", exact: true }).first().click()
  const dialog = page.getByRole("dialog", { name: "ค้นหารายวิชา" })
  await dialog.getByRole("combobox").fill("no-such-course-xyz")
  await expect(page.getByText("ไม่พบรายวิชาที่ตรงกัน", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await dialog.getByRole("button", { name: "ค้นหาแบบละเอียด" }).click()
  await expect(page.locator("#course-search-advanced")).toBeVisible()
  await expect(page).toHaveURL(/q=no-such-course-xyz/)
})

test("course autocompletes match every catalogue name variant", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Focused multilingual autocomplete coverage")
  await login(page, await randomStudentId())

  await page.getByRole("button", { name: "ค้นหารายวิชา", exact: true }).click()
  const quickSearch = page.getByRole("combobox", { name: "ค้นหารหัสหรือชื่อวิชา" })
  await quickSearch.fill("UNIV THAI READING")
  await expect(page.getByRole("option").filter({ hasText: "0123104" })).toBeVisible()
  await page.keyboard.press("Escape")

  await page.goto("/register")
  const registrationSearch = page.getByRole("combobox", { name: "รหัสหรือชื่อรายวิชา" })
  for (const query of [
    "0123-104",
    "การอ่านภาษาไทย",
    "university thai reading",
    "จับใจความ การตีความ",
  ]) {
    await registrationSearch.fill(query)
    await expect(page.getByRole("option").filter({ hasText: "0123104" })).toBeVisible()
  }
})

test("session lookup failure offers retry without forcing a new login", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Scoped error recovery")
  await login(page, await randomStudentId())
  let unavailable = true
  await page.route("**/api/v1/me", (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          json: { status: 503, code: "DATABASE_UNAVAILABLE", detail: "Unavailable" },
        })
      : route.continue(),
  )
  await page.goto("/dashboard")
  await expect(page.getByText("เชื่อมต่อระบบไม่ได้ โปรดลองอีกครั้ง")).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)
  unavailable = false
  await page.getByRole("button", { name: "ลองอีกครั้ง" }).click()
  await expect(page.getByRole("heading", { name: "ภาพรวมของคุณ" })).toBeVisible()
})

test("system dark mode toggle and keyboard skip navigation work", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Scoped system theme and keyboard navigation")
  await page.emulateMedia({ colorScheme: "dark" })
  await login(page, await randomStudentId())
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  await page.getByRole("button", { name: "สลับโหมดสว่างและมืด" }).click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
  await page.getByRole("link", { name: "ข้ามไปเนื้อหา" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.locator("#main-content")).toBeFocused()
})

test("building directory searches imported public building records", async ({ page }) => {
  await login(page, await randomStudentId())
  await page.goto("/buildings")
  await expect(page.getByRole("heading", { name: "รายชื่ออาคาร" })).toBeVisible()
  await expect(page.getByTestId("building-count")).toContainText("238")
  await page.getByLabel("ค้นหารหัสหรือชื่ออาคาร").fill("ANAND")
  await expect(page.getByText("ANAND", { exact: true })).toBeVisible()
  await expect(page.getByText("ตึกอานันทมหิดล")).toBeVisible()
})

test("faculty directory searches a department and expands its faculty", async ({
  page,
}) => {
  await login(page, await randomStudentId())
  await page.goto("/faculties")
  await expect(page.getByRole("heading", { name: "ค้นหารหัสคณะและภาควิชา" })).toBeVisible()
  await expect(page.getByTestId("faculty-count")).toContainText("29")
  await page.getByLabel("ค้นหารหัสหรือชื่อคณะ / ภาควิชา").fill("2101")
  await expect(page.getByText("ภาควิชาวิศวกรรมโยธา")).toBeVisible()
  await expect(page.getByText("DEPARTMENT OF CIVIL ENGINEERING")).toBeVisible()
  await page.getByLabel("ค้นหารหัสหรือชื่อคณะ / ภาควิชา").fill("2100A")
  await expect(page.getByText("Smart Urban Systems Engineering", { exact: true })).toBeVisible()
  await page.goto("/faculties")
  await page.locator('[data-code="21"] > details > summary').click()
  await page.locator('[data-code="2101"] > details > summary').click()
  await expect(page.getByText("Infrastructure in Civil Engineering", { exact: true })).toBeVisible()
})

test("login page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByTestId("challenge-code")).toHaveText(/^\d{4}$/)
  await expect(page.getByRole("img", { name: /^รหัสยืนยัน/ })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "ข้อกำหนดการเข้าสู่ระบบการลงทะเบียนเรียน" }),
  ).toBeVisible()
  const studentBox = await page.getByLabel("รหัสนิสิต").boundingBox()
  const rememberBox = await page.getByRole("checkbox").evaluate((element) => {
    const root = element.closest('[data-slot="checkbox"]')
    return root?.getBoundingClientRect().toJSON() ?? null
  })
  const otpBox = await page.getByTestId("challenge-otp").boundingBox()
  expect(studentBox).not.toBeNull()
  expect(rememberBox).not.toBeNull()
  expect(otpBox).not.toBeNull()
  expect(Math.abs((rememberBox?.x ?? 0) - (studentBox?.x ?? 0))).toBeLessThanOrEqual(3)
  expect(otpBox?.width ?? 0).toBeLessThanOrEqual(240)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter((violation) => violation.impact === "serious")).toEqual([])
  expect(results.violations.filter((violation) => violation.impact === "critical")).toEqual([])
})

test("catalog filters use inline search, real GenEd data, and full-hitbox time fields", async ({
  page,
}, testInfo) => {
  await login(page, await randomStudentId())
  await page.goto("/search")
  await expect(page.getByTestId("term-utility")).toBeVisible()
  await page.getByRole("button", { name: "ตัวกรองเพิ่มเติม" }).click()

  await page.getByTestId("filter-group-attributes").click()
  const facultyPicker = page.getByTestId("faculty-autocomplete")
  await facultyPicker.click()
  await expect(page.getByRole("listbox")).toBeVisible()
  await page
    .getByRole("option")
    .first()
    .evaluate((element) => (element as HTMLElement).click())
  await expect(page.getByRole("dialog", { name: "คณะ / หน่วยงาน" })).toHaveCount(0)

  await page.getByRole("button", { name: "หมวดวิทย์" }).click()
  if (!testInfo.project.name.startsWith("mobile")) {
    await page.getByTestId("filter-group-classes").click()
    const timeControl = page.getByTestId("time-start-trigger")
    await timeControl.click()
    await expect(page.getByRole("dialog", { name: "เริ่มหลัง" })).toBeVisible()
    await expect(page.getByRole("spinbutton", { name: "hour, เริ่มหลัง" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog", { name: "เริ่มหลัง" })).toBeHidden()
  }
  await expect(page).toHaveURL(/genEdTypes=SC/)
  await expect(page.getByText("หมวดวิทย์").first()).toBeVisible()
})
test("appearance customization is discoverable and persists", async ({ page }, testInfo) => {
  await login(page, await randomStudentId())
  await page.goto("/appearance")
  await expect(page.getByRole("heading", { name: "การแสดงผลและการอ่าน" })).toBeVisible()
  const darkMode = page.getByRole("radio", { name: /โหมดมืด/ })
  const saved = page.waitForResponse(`**/api/v1/preferences`)
  await visibleRadio(page, "โหมดมืด").click()
  const savedResponse = await saved
  expect(savedResponse.ok()).toBe(true)
  await expect(darkMode).toBeChecked()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  await page.reload()
  await expect(page.getByRole("radio", { name: /โหมดมืด/ })).toBeChecked()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")

  const lightMode = page.getByRole("radio", { name: /โหมดสว่าง/ })
  const lightSaved = page.waitForResponse("**/api/v1/preferences")
  await visibleRadio(page, "โหมดสว่าง").click()
  expect((await lightSaved).ok()).toBe(true)
  await expect(lightMode).toBeChecked()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")

  const systemMode = page.getByRole("radio", { name: /ตามการตั้งค่าของอุปกรณ์/ })
  const systemSaved = page.waitForResponse("**/api/v1/preferences")
  await visibleRadio(page, "ตามการตั้งค่าของอุปกรณ์").click()
  expect((await systemSaved).ok()).toBe(true)
  await expect(systemMode).toBeChecked()

  await visibleRadio(page, "โหมดมืด").click()
  await visibleRadio(page, "โหมดสว่าง").click()
  await visibleRadio(page, "ตามการตั้งค่าของอุปกรณ์").click()
  await expect(systemMode).toBeChecked()
  await expect
    .poll(async () => {
      const response = await page.request.get("http://localhost:3000/api/v1/preferences")
      return ((await response.json()) as { data: { theme: string } }).data.theme
    })
    .toBe("system")

  const language = page.getByRole("radio", { name: "English" })
  await visibleRadio(page, "English").click()
  await expect(language).toBeChecked()
  await expect(page.getByRole("heading", { name: "Display and readability" })).toBeVisible()
  if (testInfo.project.name.startsWith("mobile")) {
    await expect(page.getByRole("button", { name: "Course search", exact: true })).toBeVisible()
  } else {
    await expect(page.getByRole("link", { name: "Course search", exact: true })).toBeVisible()
  }

  await page
    .getByRole("button", { name: "Restore defaults" })
    .evaluate((element) => (element as HTMLElement).click())
  await expect(page.getByRole("alertdialog", { name: "Restore defaults" })).toBeVisible()
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore defaults" }).click()
  await expect(page.getByRole("heading", { name: "การแสดงผลและการอ่าน" })).toBeVisible()
})

test("appearance supports custom accent, scale, and drawer presentation", async ({
  page,
}, testInfo) => {
  const isMobile = testInfo.project.name.startsWith("mobile")
  const studentId = await randomStudentId()
  await login(page, studentId)
  await page.goto("/appearance")
  const selectionMarks = page.locator("[data-selection-mark='true']:visible")
  await expect(selectionMarks).toHaveCount(isMobile ? 3 : 4)
  await expect(selectionMarks.locator("svg")).toHaveCount(isMobile ? 3 : 4)

  const labelStyle = page.getByRole("radiogroup", { name: "รูปแบบป้ายกำกับ" })
  const softLabels = labelStyle.getByRole("radio", { name: "ป้ายโทนอ่อน" })
  const solidLabels = labelStyle.getByRole("radio", { name: "ป้ายโทนทึบ" })
  await expect(softLabels).toBeChecked()
  const labelStyleSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/preferences") &&
      response.request().method() === "PATCH" &&
      response.request().postData()?.includes('"labelStyle":"solid"'),
  )
  await visibleRadio(page, "ป้ายโทนทึบ").click()
  expect((await labelStyleSaved).ok()).toBe(true)
  await expect(solidLabels).toBeChecked()
  await expect(page.getByRole("button", { name: "ตัวอย่างปุ่ม" })).toHaveCount(0)

  const mint = page.getByRole("option", { name: "Mint" })
  const mintSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/preferences") &&
      response.request().method() === "PATCH" &&
      response.request().postData()?.includes('"accentPreset":"mint"'),
  )
  await mint.click()
  expect((await mintSaved).ok()).toBe(true)
  await expect(mint).toHaveAttribute("aria-selected", "true")
  await expect(page.locator("html")).toHaveCSS("--color-accent", "#168065")
  await expect(page.locator("html")).toHaveCSS("--accent", "#168065")
  const themedSurfaces = await page.locator("html").evaluate((element) => {
    const root = element as HTMLElement
    return ["--color-paper", "--color-toolbar", "--color-rule", "--color-ink"].map((token) =>
      root.style.getPropertyValue(token),
    )
  })
  expect(themedSurfaces.every((value) => !value.includes("#168065"))).toBe(true)
  expect(
    await page
      .locator("html")
      .evaluate((element) => element.style.getPropertyValue("--color-surface")),
  ).toBe("var(--theme-surface-base)")
  const fixedShellSurfaces = await page.locator("html").evaluate((element) => {
    const root = element as HTMLElement
    return [
      root.style.getPropertyValue("--color-canvas"),
      root.style.getPropertyValue("--color-sidebar"),
    ]
  })
  expect(fixedShellSurfaces).toEqual(["var(--theme-canvas-base)", "var(--theme-sidebar-base)"])

  await page
    .getByRole("button", { name: /เลือกสีเอง/ })
    .evaluate((element) => (element as HTMLElement).click())
  const colorPopover = page.locator('[data-slot="color-picker-popover"]')
  const colorArea = colorPopover.locator('[data-slot="color-area"]')
  await expect(colorPopover).toBeVisible()
  const popoverBox = await colorPopover.boundingBox()
  const areaBox = await colorArea.boundingBox()
  expect(popoverBox).not.toBeNull()
  expect(areaBox).not.toBeNull()
  if (!popoverBox || !areaBox) throw new Error("Missing color picker geometry")
  expect(Math.abs(areaBox.width - areaBox.height)).toBeLessThan(2)
  expect(
    Math.abs(areaBox.x + areaBox.width / 2 - (popoverBox.x + popoverBox.width / 2)),
  ).toBeLessThan(2)
  expect(popoverBox.width - areaBox.width).toBeLessThanOrEqual(36)
  const customColor = page.getByRole("textbox", { name: /เลือกสีเอง/ })
  await customColor.fill("#168065")
  const accentSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/preferences") && response.request().method() === "PATCH",
  )
  await page
    .getByRole("button", { name: "บันทึก" })
    .last()
    .evaluate((element) => (element as HTMLElement).click())
  expect((await accentSaved).ok()).toBe(true)
  await expect(page.locator("html")).toHaveCSS("--color-accent", "#168065")

  const scale = page.getByRole("slider", { name: "ขนาดส่วนติดต่อ" })
  const scaleSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/preferences") &&
      response.request().method() === "PATCH" &&
      response.request().postData()?.includes('"uiScale"'),
  )
  await scale.focus()
  await scale.press("ArrowRight")
  await expect(scale).toHaveValue("1.05")
  expect((await scaleSaved).ok()).toBe(true)

  if (!isMobile) {
    const detailPresentation = page.getByRole("radiogroup", {
      name: "วิธีแสดงรายละเอียดรายวิชา",
    })
    const detailDrawer = detailPresentation.getByRole("radio", { name: "แผงด้านข้าง" })
    const drawerSaved = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/preferences") &&
        response.request().method() === "PATCH" &&
        response.request().postData()?.includes('"detailPresentation":"drawer"'),
    )
    await visibleRadio(page, "แผงด้านข้าง").click()
    expect((await drawerSaved).ok()).toBe(true)
    await expect(detailDrawer).toBeChecked()
  }
  await page.goto("/search")
  await page
    .locator('button[data-mode="search"]')
    .first()
    .evaluate((element) => (element as HTMLElement).click())
  await expect(
    page.locator('[data-presentation="drawer"][data-slot="drawer-content"]'),
  ).toBeVisible()

  const preferences = await page.request.get("http://localhost:3000/api/v1/preferences")
  expect(preferences.ok()).toBe(true)
  const payload = (await preferences.json()) as {
    data: {
      accentPreset: string
      customAccent: string | null
      detailPresentation: string
      uiScale: number
    }
  }
  expect(payload.data.accentPreset).toBe("custom")
  expect(payload.data.customAccent).toBe("#168065")
  expect(payload.data.detailPresentation).toBe(isMobile ? "modal" : "drawer")
  expect(payload.data.uiScale).toBeGreaterThan(1)
})

test("popup interactions preserve viewport position", async ({ page }) => {
  const studentId = await randomStudentId()
  await login(page, studentId)
  await page.goto("/search")
  await expect(page.getByRole("heading", { name: "ค้นหารายวิชา" })).toBeVisible()

  const termTrigger = page.getByRole("button", { name: "เปลี่ยนภาคการศึกษา" })
  await centerForPointer(termTrigger)
  const selectPosition = await viewportSnapshot(page)
  await termTrigger.click({ force: true })
  await expect(page.getByRole("listbox")).toBeVisible()
  const openSelect = await viewportSnapshot(page)
  expect(selectPosition).toEqual(openSelect)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("listbox")).toBeHidden()
  expect(await viewportSnapshot(page)).toEqual(selectPosition)

  const beforeMenu = await viewportSnapshot(page)
  await pointerClick(page, page.getByRole("button", { name: studentId }))
  await expect(page.getByRole("menu")).toBeVisible()
  expect(await viewportSnapshot(page)).toEqual(beforeMenu)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toBeHidden()
  expect(await viewportSnapshot(page)).toEqual(beforeMenu)

  await page.evaluate(() => window.scrollTo(0, 500))
  const beforeScrolledMenu = await viewportSnapshot(page)
  const scrolledMenuTrigger = page.getByRole("button", { name: studentId })
  await pointerClick(page, scrolledMenuTrigger)
  await expect(page.getByRole("menu")).toBeVisible()
  expect(await viewportSnapshot(page)).toEqual(beforeScrolledMenu)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toBeHidden()
  expect(await viewportSnapshot(page)).toEqual(beforeScrolledMenu)

  const courseTrigger = page.locator('button[data-mode="search"]').first()
  await courseTrigger.scrollIntoViewIfNeeded()
  const beforeDialog = await viewportSnapshot(page)
  await courseTrigger.evaluate((element) => (element as HTMLElement).click())
  await expect(page.getByRole("dialog")).toBeVisible()
  expect(await viewportSnapshot(page)).toEqual(beforeDialog)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()
  expect(await viewportSnapshot(page)).toEqual(beforeDialog)
  await expect(courseTrigger).toBeFocused()
})

test("current-term registrations propagate to plan views", async ({ page }, testInfo) => {
  const studentId = await randomStudentId()
  await login(page, studentId)
  const registered = await registerEligibleCourses(page, 1)
  const courseCode = registered[0]?.courseCode
  if (!courseCode) throw new Error("No compatible test course was registered")

  try {
    await page.goto("/register")
    await expect(page.getByRole("heading", { name: "แก้ไขรายการลงทะเบียน" })).toBeVisible()
    if (!testInfo.project.name.startsWith("mobile")) {
      const gridTemplates = await Promise.all(
        [
          page.getByTestId("registration-table-header"),
          page.getByTestId("registration-active-row").first(),
        ].map((locator) =>
          locator.evaluate((element) => getComputedStyle(element).gridTemplateColumns),
        ),
      )
      expect(gridTemplates[0]).toBe(gridTemplates[1])
    }
    await expect(page.getByTestId("registration-active-row").first()).not.toContainText(
      "ใช้หน้าลดรายวิชา",
    )

    await page.goto("/schedule")
    await expect(page.getByRole("heading", { name: "ตารางเรียนรายสัปดาห์" })).toBeVisible()
    if (!testInfo.project.name.startsWith("mobile")) {
      await expect(page.getByTestId("schedule-grid")).toBeVisible()
      const gridColumns = await page
        .getByTestId("schedule-grid")
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" "))
      expect(gridColumns).toHaveLength(2)
      await expect(page.getByTestId("schedule-time-axis").locator("span")).toHaveCount(12)
      const dayCount = await page.getByTestId("schedule-day-row").count()
      expect(dayCount).toBeGreaterThanOrEqual(5)
      expect(dayCount).toBeLessThanOrEqual(7)
    }

    await page.goto("/exams")
    await expect(page.getByRole("heading", { name: "ตารางสอบ", exact: true })).toBeVisible()
    await page.goto("/drop")
    await expect(page.getByTestId("management-table")).toContainText(courseCode)
    await page.goto("/withdraw")
    await expect(page.getByTestId("management-table")).toContainText(courseCode)
  } finally {
    await dropActiveCourses(page, [courseCode])
  }
})
test("batch drop confirms all selected courses together", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Shared mock mutation flow runs once in Chromium")
  const studentId = await randomStudentId()
  await login(page, studentId)
  const registered = await registerEligibleCourses(page, 2)
  try {
    await page.goto("/drop")
    for (const course of registered) {
      await page
        .getByRole("checkbox", { name: "เลือก " + course.courseCode })
        .evaluate((element) => (element as HTMLElement).click())
    }
    await expect(page.getByText("เลือกแล้ว 2 รายวิชา")).toBeVisible()
    await page.getByRole("button", { name: "ลดรายวิชาที่เลือก" }).click()
    const dialog = page.getByRole("alertdialog", { name: "ยืนยันการลดรายวิชา" })
    await expect(dialog).toBeVisible()
    for (const course of registered) {
      await expect(dialog).toContainText(course.courseCode)
    }
    await dialog.getByRole("button", { name: "ยืนยันลดรายวิชาที่เลือก" }).click()
    await expect(page.getByText("ลดรายวิชาที่เลือกแล้ว 2 รายวิชา")).toBeVisible()

    const registrationsResponse = await page.request.get(
      "http://localhost:3000/api/v1/registrations",
    )
    const registrationsBody = (await registrationsResponse.json()) as {
      data: { registrations: Array<{ registrationId: number; status: string }> }
    }
    for (const course of registered) {
      expect(
        registrationsBody.data.registrations.find(
          (registration) => registration.registrationId === course.registrationId,
        )?.status,
      ).toBe("dropped")
    }
  } finally {
    await dropActiveCourses(
      page,
      registered.map((course) => course.courseCode),
    )
  }
})

test("withdrawal form keeps every selected course active", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Shared mock mutation flow runs once in Chromium")
  const studentId = await randomStudentId()
  await login(page, studentId)
  const registered = await registerEligibleCourses(page, 2)
  try {
    await page.goto("/withdraw")
    for (const course of registered) {
      await page
        .getByRole("checkbox", { name: "เลือก " + course.courseCode })
        .evaluate((element) => (element as HTMLElement).click())
      await page.getByLabel("เหตุผลถอน " + course.courseCode).fill("ต้องส่งคำร้องให้คณะพิจารณา")
    }
    await expect(page.getByText("พิมพ์คำร้องเพื่อส่งคณะ", { exact: true })).toHaveCount(0)
    await page.goto("/schedule")
    await page.goto("/withdraw")
    await page.reload()
    for (const course of registered) {
      await expect(page.getByRole("checkbox", { name: "เลือก " + course.courseCode })).toBeChecked()
      await expect(page.getByLabel("เหตุผลถอน " + course.courseCode)).toHaveValue(
        "ต้องส่งคำร้องให้คณะพิจารณา",
      )
    }
    await page.getByRole("button", { name: "ตรวจสอบคำร้องที่เลือก" }).click()
    const dialog = page.getByRole("alertdialog", { name: "ยืนยันการสร้างคำร้องถอน" })
    await expect(dialog).toBeVisible()
    for (const course of registered) {
      await expect(dialog).toContainText(course.courseCode)
      await expect(dialog).toContainText("ต้องส่งคำร้องให้คณะพิจารณา")
    }

    const pdfResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/withdrawals/form") &&
        response.request().method() === "POST",
    )
    await dialog.getByRole("button", { name: "สร้างแบบฟอร์มเพื่อพิมพ์" }).click()
    const formResponse = await pdfResponse
    expect(formResponse.ok()).toBe(true)
    expect(formResponse.headers()["content-type"]).toContain("application/pdf")
    await expect(page.getByText("การลงทะเบียนของคุณยังคงเดิม")).toBeVisible()

    const registrationsResponse = await page.request.get(
      "http://localhost:3000/api/v1/registrations",
    )
    const registrationsBody = (await registrationsResponse.json()) as {
      data: { registrations: Array<{ registrationId: number; status: string }> }
    }
    for (const course of registered) {
      expect(
        registrationsBody.data.registrations.find(
          (registration) => registration.registrationId === course.registrationId,
        )?.status,
      ).toBe("active")
    }
  } finally {
    await dropActiveCourses(
      page,
      registered.map((course) => course.courseCode),
    )
  }
})
test("desktop forms keep controls aligned and footer reaches the page bottom", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "desktop project only")
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page, await randomStudentId())
  await page.goto("/register")
  const row = page.getByTestId("registration-draft-row")
  const boxes = await Promise.all([
    row.getByRole("combobox", { name: "รหัสหรือชื่อรายวิชา" }).boundingBox(),
    row.getByRole("button", { name: "ตอน" }).boundingBox(),
    row.getByRole("button", { name: "รูปแบบ" }).boundingBox(),
    row.getByRole("button", { name: "ลบแถว" }).boundingBox(),
  ])
  expect(boxes.every((box) => box !== null)).toBe(true)
  const tops = boxes.map((box) => box?.y ?? 0)
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(3)

  await page.goto("/drop")
  await expect(page.getByTestId("management-form")).toBeVisible()
  const footer = await page.locator("footer").boundingBox()
  expect(footer).not.toBeNull()
  expect((footer?.y ?? 0) + (footer?.height ?? 0)).toBeGreaterThanOrEqual(850)
})

test("registration offers initial suggestions and visible live requirements", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Focused live registration feedback")
  await login(page, await randomStudentId())
  await page.goto("/register")
  const courseInput = page.getByRole("combobox", { name: "รหัสหรือชื่อรายวิชา" })
  await courseInput.click()
  await expect(page.getByRole("option").first()).toContainText(/\d{7}/)
  await courseInput.fill("no-such-course-xyz")
  await expect(page.getByText("เลือกรายวิชาที่ตรงกันจากรายการแนะนำ")).toBeVisible()
  await courseInput.fill("2102201")
  await page.getByRole("option").filter({ hasText: "2102201" }).first().click()
  const requirements = page
    .getByTestId("registration-draft-row")
    .getByRole("button", { name: /เงื่อนไขรายวิชา/ })
  await expect(requirements).toBeVisible()
  await requirements.click()
  await expect(page.getByText("เงื่อนไขจากต้นทาง", { exact: true })).toBeVisible()
  await expect(
    page.getByTestId("registration-draft-row").getByText("2102201", { exact: true }),
  ).toHaveCount(0)
})

test("course schedule colors persist and carry into the exam board", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Shared mutation runs once in Chromium")
  const studentId = await randomStudentId()
  await login(page, studentId)
  const registered = await registerEligibleCourses(page, 1)
  try {
    const course = registered[0]
    if (!course) throw new Error("Expected one registered course")
    await page.goto("/schedule")
    const card = page.getByTestId("schedule-course-card").filter({ hasText: course.courseCode })
    await expect(card).toBeVisible()
    await page.getByRole("button", { name: "เปลี่ยนสีรายวิชา " + course.courseCode }).click()
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/schedule/colors/") &&
        response.request().method() === "PUT",
    )
    await page.getByRole("button", { name: "ฟ้า", exact: true }).click()
    expect((await saved).ok()).toBe(true)
    await expect
      .poll(async () =>
        card.evaluate((element) => element.style.getPropertyValue("--course-color")),
      )
      .toBe("#438ad7")
    await page.screenshot({ path: "tmp/browser/schedule-course-colors.png", fullPage: true })
    await page.reload()
    await expect
      .poll(async () =>
        page
          .getByTestId("schedule-course-card")
          .filter({ hasText: course.courseCode })
          .evaluate((element) => element.style.getPropertyValue("--course-color")),
      )
      .toBe("#438ad7")
    await page.goto("/exams")
    await expect
      .poll(async () =>
        page
          .getByTestId("exam-course-card")
          .filter({ hasText: course.courseCode })
          .first()
          .evaluate((element) => element.style.getPropertyValue("--course-color")),
      )
      .toBe("#438ad7")
    await page.screenshot({ path: "tmp/browser/exam-course-colors.png", fullPage: true })
  } finally {
    await dropActiveCourses(
      page,
      registered.map((course) => course.courseCode),
    )
  }
})

test("planning grids and course cards remain usable on mobile", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile planning view")
  await login(page, await randomStudentId())
  const term = { id: 1, academicYear: 2569, semester: 1, label: "2569/1" }
  const registration = {
    registrationId: 1,
    courseCode: "1111111",
    nameTh: "รายวิชาทดสอบ",
    nameEn: "Test course",
    credits: 3,
    status: "active",
    offeringId: 1,
    sectionId: 1,
    sectionNo: "1",
    meetings: [
      {
        dayCode: "MO",
        startMinute: 540,
        endMinute: 660,
        arranged: false,
        periodLabel: "09:00-11:00",
        building: "TEST",
        room: "101",
        teachers: ["STAFF"],
      },
    ],
  }
  await page.route("**/api/v1/schedule", (route) =>
    route.fulfill({ json: { data: { term, registrations: [registration] } } }),
  )
  const solidLabels = await page.request.patch("http://localhost:3000/api/v1/preferences", {
    headers: { origin: "http://localhost:5173" },
    data: { labelStyle: "solid" },
  })
  expect(solidLabels.ok()).toBe(true)
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/schedule")
    await expect(page.getByTestId("schedule-grid")).toBeVisible()
    const frame = await page.getByTestId("schedule-grid").evaluate((element) => ({
      nestedOverflow:
        (element.parentElement?.scrollWidth ?? 0) > (element.parentElement?.clientWidth ?? 0),
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    }))
    expect(frame.pageOverflow, `schedule width ${width}`).toBe(false)
    if (width <= 414) expect(frame.nestedOverflow, `schedule width ${width}`).toBe(true)
    const classBlock = page.getByTestId("schedule-class-block")
    await expect(classBlock).toBeVisible()
    const solidStyle = await classBlock.evaluate((element) => {
      const style = getComputedStyle(element)
      const resolveColor = (value: string) => {
        const probe = document.createElement("span")
        probe.style.color = value
        document.body.append(probe)
        const color = getComputedStyle(probe).color
        probe.remove()
        return color
      }
      return {
        background: style.backgroundColor,
        expectedBackground: resolveColor(style.getPropertyValue("--course-color")),
        foreground: style.color,
        expectedForeground: resolveColor(style.getPropertyValue("--course-ink")),
      }
    })
    expect(solidStyle.background).toBe(solidStyle.expectedBackground)
    expect(solidStyle.foreground).toBe(solidStyle.expectedForeground)
    await expect(page.getByTestId("schedule-course-card")).toBeVisible()
    const colorTrigger = page.getByRole("button", { name: "เปลี่ยนสีรายวิชา 1111111" })
    await expect(colorTrigger).toBeVisible()
    expect((await colorTrigger.boundingBox())?.width ?? 999).toBeLessThan(90)
    const triggerAlignment = await colorTrigger.evaluate((element) => {
      const children = [...element.children].map((child) => child.getBoundingClientRect())
      const first = children[0]
      const second = children[1]
      return {
        display: getComputedStyle(element).display,
        direction: getComputedStyle(element).flexDirection,
        centerDifference:
          first && second
            ? Math.abs(first.top + first.height / 2 - (second.top + second.height / 2))
            : 999,
      }
    })
    expect(triggerAlignment.display).toBe("flex")
    expect(triggerAlignment.direction).toBe("row")
    expect(triggerAlignment.centerDifference).toBeLessThanOrEqual(1)
    if (width === 320 || width === 768) {
      await page.screenshot({
        path: `tmp/browser/mobile-colored-schedule-${width}.png`,
        fullPage: true,
      })
    }
  }
  await page.route("**/api/v1/exams", (route) =>
    route.fulfill({
      json: {
        data: {
          term,
          courses: [
            {
              ...registration,
              midterm: null,
              final: { date: "2026-11-20", startMinute: 540, endMinute: 660 },
            },
          ],
        },
      },
    }),
  )
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/exams")
    await expect(page.getByTestId("exam-boards")).toBeVisible()
    await expect(page.getByTestId("exam-course-card")).toHaveCount(2)
    const examTable = page.getByRole("grid", { name: "ตารางสอบกลางภาคและปลายภาค" })
    await expect(examTable).toBeVisible()
    const examOverflow = await page.getByTestId("exam-table-wrap").evaluate((element) => ({
      nested: element.scrollWidth > element.clientWidth,
      page: document.documentElement.scrollWidth > innerWidth,
    }))
    expect(examOverflow).toEqual({ nested: true, page: false })
    if (width === 320 || width === 768) {
      await page.screenshot({ path: `tmp/browser/mobile-exam-boards-${width}.png`, fullPage: true })
    }
  }
})

test("overlapping class and exam events remain visible as warnings", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Deterministic overlap rendering fixture")
  await page.setViewportSize({ width: 1440, height: 1000 })
  await login(page, await randomStudentId())
  const solidLabels = await page.request.patch("http://localhost:3000/api/v1/preferences", {
    headers: { origin: "http://localhost:5173" },
    data: { labelStyle: "solid", theme: "dark" },
  })
  expect(solidLabels.ok()).toBe(true)
  const term = { id: 1, academicYear: 2569, semester: 1, label: "2569/1" }
  const registrations = ["1111111", "2222222"].map((courseCode, index) => ({
    registrationId: index + 1,
    courseCode,
    nameTh: "รายวิชาทดสอบ " + (index + 1),
    nameEn: "Test course " + (index + 1),
    credits: 3,
    status: "active",
    offeringId: index + 1,
    sectionId: index + 1,
    sectionNo: "1",
    meetings: [
      {
        dayCode: "MO",
        startMinute: 540 + index * 30,
        endMinute: 660 + index * 30,
        arranged: false,
        periodLabel: index ? "09:30-11:30" : "09:00-11:00",
        building: "TEST",
        room: "101",
        teachers: [],
      },
    ],
  }))
  await page.route("**/api/v1/schedule", (route) =>
    route.fulfill({ json: { data: { term, registrations } } }),
  )
  await page.goto("/schedule")
  await expect(
    page.getByText("มีเวลาเรียนซ้อนกัน ระบบยังคงแสดงและอนุญาตทุกรายวิชา", { exact: true }),
  ).toHaveCount(0)
  const blocks = page.getByTestId("schedule-class-block")
  await expect(blocks).toHaveCount(2)
  await expect(blocks.nth(0)).toHaveAttribute("data-conflict", "true")
  await expect(blocks.nth(1)).toHaveAttribute("data-conflict", "true")
  const first = await blocks.nth(0).boundingBox()
  const second = await blocks.nth(1).boundingBox()
  expect(first).not.toBeNull()
  expect(second?.y ?? 0).toBeGreaterThanOrEqual((first?.y ?? 0) + (first?.height ?? 0) - 1)
  await expect(blocks.nth(1).getByText("รายวิชาทดสอบ 2")).toBeVisible()
  const conflictBadge = blocks.nth(0).locator(".chip--danger")
  await expect(conflictBadge).toBeVisible()
  expect((await conflictBadge.textContent())?.trim()).not.toBe("")
  const conflictBadgeColors = await conflictBadge.evaluate((element) => {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas color conversion is unavailable")
    const parse = (value: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((channel) => channel / 255)
    }
    const luminance = (value: string) => {
      const channels = parse(value).map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      )
      return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
    }
    const style = getComputedStyle(element)
    const foreground = luminance(style.color)
    const background = luminance(style.backgroundColor)
    return {
      background: style.backgroundColor,
      color: style.color,
      ratio: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
    }
  })
  expect(conflictBadgeColors.ratio).toBeGreaterThanOrEqual(4.5)
  await page.screenshot({ path: "tmp/browser/overlap-schedule.png" })
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
  await page.goto("/exams")
  await expect(
    page.getByText("มีกำหนดการสอบซ้อนกัน ระบบยังคงแสดงและอนุญาตทุกรายวิชา", { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText("เวลาสอบซ้อน", { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: "tmp/browser/overlap-exams.png" })
})

test("course modal is spacious and presents details without tabs", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop course-panel geometry")
  await page.setViewportSize({ width: 1440, height: 1000 })
  await login(page, await randomStudentId())
  await page.goto("/search")
  await page.locator('button[data-mode="search"]').first().click()
  const dialog = page.getByRole("dialog", { name: "รายละเอียดรายวิชา" })
  await expect(dialog).toBeVisible()
  await expect.poll(async () => (await dialog.boundingBox())?.width ?? 0).toBeGreaterThan(1000)
  await expect(dialog.getByRole("tablist")).toHaveCount(0)
  await expect(dialog.getByText("หน่วยกิต", { exact: true })).toBeVisible()
  await page.screenshot({ path: "tmp/browser/course-modal-unified.png" })
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
})

test("neutral themes fill ultra-wide screens and preserve contained width", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Shared theme and viewport geometry coverage")
  await login(page, await randomStudentId())
  const preferences = async (data: Record<string, unknown>) => {
    const response = await page.request.patch("http://localhost:3000/api/v1/preferences", {
      headers: { origin: "http://localhost:5173" },
      data,
    })
    expect(response.ok()).toBe(true)
    await page.goto("/register")
    await expect(page.getByTestId("registration-repeater")).toBeVisible()
  }
  const neutralStyles = async () => {
    const card = await page.getByTestId("registration-repeater").evaluate((element) => {
      const style = getComputedStyle(element)
      return [style.backgroundColor, style.borderTopColor, style.color, style.boxShadow]
    })
    const field = await page
      .getByRole("combobox", { name: "รหัสหรือชื่อรายวิชา" })
      .evaluate((element) => {
        const style = getComputedStyle(element)
        return [style.backgroundColor, style.borderTopColor, style.color]
      })
    return { card, field }
  }
  for (const theme of ["light", "dark"]) {
    await preferences({
      theme,
      accentPreset: "rose",
      customAccent: null,
      contentLayout: "fluid",
      uiScale: 1,
    })
    await expect(page.getByTestId("registration-repeater")).toHaveCSS(
      "color",
      theme === "dark" ? "rgb(245, 245, 245)" : "rgb(37, 47, 74)",
    )
    const beforeAccent = await neutralStyles()
    for (const width of [320, 375, 414, 768, 1440, 1920, 2560, 3440]) {
      await page.setViewportSize({ width, height: 1000 })
      const geometry = await page.locator("main").evaluate((element) => {
        const main = element.getBoundingClientRect()
        const child = element.firstElementChild
        if (!child) throw new Error("Page content is missing")
        const content = child.getBoundingClientRect()
        return {
          width: content.width,
          mainWidth: main.width,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }
      })
      expect(geometry.overflow).toBe(false)
      expect(geometry.width).toBeGreaterThan(geometry.mainWidth - 90)
      if (width === 320 || width === 3440) {
        await page.screenshot({
          path: `tmp/browser/theme-fluid-${width}-${theme}.png`,
          fullPage: true,
        })
      }
    }
    await preferences({ accentPreset: "mint" })
    await expect.poll(neutralStyles).toEqual(beforeAccent)
    await expect(page.locator('[data-reg-variant="primary"]').first()).toHaveCSS(
      "background-color",
      "rgb(22, 128, 101)",
    )
  }
  await page.goto("/appearance")
  await page.getByRole("button", { name: "การจัดวางเนื้อหา" }).click()
  await page.getByRole("option", { name: "จำกัดความกว้าง" }).click()
  await expect
    .poll(async () => {
      const response = await page.request.get("http://localhost:3000/api/v1/preferences")
      return (await response.json()).data.contentLayout
    })
    .toBe("contained")
  await page.goto("/register")
  await expect
    .poll(async () => (await page.locator("main > div").first().boundingBox())?.width)
    .toBe(1120)
  await page.reload()
  await expect
    .poll(async () => (await page.locator("main > div").first().boundingBox())?.width)
    .toBe(1120)
})

test("mobile navigation uses a dismissable left sidebar", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "mobile project only")
  await login(page, await randomStudentId())
  const menuTrigger = page.getByTestId("mobile-sidebar-trigger")
  await expect(menuTrigger).toBeVisible()
  await expect(page.getByRole("button", { name: "เพิ่มเติม", exact: true })).toHaveCount(0)
  await page.goto("/search")
  await expect(page.locator("main article").first()).toBeVisible()
  await expect(page.getByTestId("page-loading")).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.scrollTo(0, Math.min(900, document.body.scrollHeight)))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(900)
  const topbar = page.getByRole("banner")
  await expect.poll(async () => Math.round((await topbar.boundingBox())?.y ?? -1)).toBe(0)
  const toolbarBackground = await topbar.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  )
  const shellBackground = await page
    .locator("body > div > div")
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(toolbarBackground).toBe(shellBackground)
  expect(toolbarBackground).not.toBe("rgba(0, 0, 0, 0)")
  await page.screenshot({ path: "tmp/browser/mobile-solid-topbar.png" })
  const beforeMenu = await viewportSnapshot(page)
  const tapMenu = async () => {
    const box = await menuTrigger.boundingBox()
    if (!box) throw new Error("Mobile menu trigger is not visible")
    // Tap the visible sticky control; locator.click() scrolls it before dispatching.
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  }
  await tapMenu()
  const dialog = page.getByRole("dialog", { name: "เมนูทั้งหมด" })
  await expect(dialog).toBeVisible()
  await expectLeftDrawerSettled(dialog)
  const mobileNavigation = dialog.getByRole("navigation", { name: "เมนูหลัก" })
  await expect(mobileNavigation).toBeVisible()
  const viewportHeight = await page.evaluate(() => innerHeight)
  const viewportWidth = await page.evaluate(() => innerWidth)
  const drawer = await dialog.boundingBox()
  expect(Math.abs((drawer?.y ?? 99) + (drawer?.height ?? 0) - viewportHeight)).toBeLessThan(3)
  expect(drawer?.width ?? viewportWidth).toBeLessThan(viewportWidth)
  await page.screenshot({ path: "tmp/browser/mobile-sidebar-open.png" })
  expect(await viewportSnapshot(page)).toEqual(beforeMenu)

  await dialog.getByRole("button", { name: "ปิดเมนู" }).click()
  await expect(dialog).not.toBeVisible()
  await expect(menuTrigger).toBeFocused()

  await tapMenu()
  await expectLeftDrawerSettled(dialog)
  const backdrop = page.locator('[data-slot="drawer-backdrop"]')
  await backdrop.click({ position: { x: viewportWidth - 4, y: 80 } })
  await expect(dialog).not.toBeVisible()

  await tapMenu()
  await dialog.getByRole("link", { name: "ลดรายวิชา" }).click()
  await expect(page.getByRole("heading", { name: "ลดรายวิชา" })).toBeVisible()
  await expect(dialog).not.toBeVisible()

  await touchSwipe(page, { startX: 8, startY: 400, endX: 112, endY: 404 })
  await expect(dialog).toBeVisible()
  await expectLeftDrawerSettled(dialog)
  await touchSwipe(page, {
    startX: 220,
    startY: 400,
    endX: 100,
    endY: 404,
    targetSelector: '[role="dialog"]',
  })
  await expect(dialog).not.toBeVisible()

  await page.evaluate(() => {
    const scroller = document.createElement("div")
    scroller.id = "e2e-horizontal-scroller"
    scroller.style.cssText =
      "position:fixed;inset:80px auto auto 0;width:160px;height:40px;overflow-x:auto;z-index:20"
    const content = document.createElement("div")
    content.style.cssText = "width:480px;height:40px"
    scroller.append(content)
    document.body.append(scroller)
  })
  await touchSwipe(page, {
    startX: 8,
    startY: 90,
    endX: 112,
    endY: 94,
    targetSelector: "#e2e-horizontal-scroller",
  })
  await expect(dialog).not.toBeVisible()
  await page.locator("#e2e-horizontal-scroller").evaluate((element) => element.remove())
})

test("mobile sidebar fits every supported compact width", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "mobile project only")
  await login(page, await randomStudentId())
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/dashboard")
    const trigger = page.getByTestId("mobile-sidebar-trigger")
    await expect(trigger).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await trigger.click()
    const dialog = page.getByRole("dialog", { name: "เมนูทั้งหมด" })
    await expect(dialog).toBeVisible()
    await expectLeftDrawerSettled(dialog)
    const bounds = await dialog.boundingBox()
    expect(bounds?.width ?? width).toBeLessThan(width)
    expect(bounds?.height ?? 0).toBe(900)
    await page.screenshot({ path: `tmp/browser/mobile-sidebar-${width}.png` })
    await dialog.getByRole("button", { name: "ปิดเมนู" }).click()
    await expect(dialog).not.toBeVisible()
  }
})

test("desktop topbar becomes a solid surface after scrolling", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "desktop projects only")
  await page.setViewportSize({ width: 2560, height: 600 })
  await login(page, await randomStudentId())
  await page.goto("/search")
  const topbar = page.getByRole("banner")
  await expect(topbar).not.toHaveAttribute("data-scrolled", "true")
  await page.evaluate(() =>
    window.scrollTo(0, Math.min(500, document.body.scrollHeight - innerHeight)),
  )
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await expect(topbar).toHaveAttribute("data-scrolled", "true")
  await expect(topbar).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await page.screenshot({ path: "tmp/browser/desktop-solid-topbar-2560.png" })
})
