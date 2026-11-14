import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import type {
  BatchRegistrationPreviewDto,
  CourseDetailDto,
  RuleIssueDto,
} from "../../apps/api/src/public-types"
import { DEFAULT_APPEARANCE_SETTINGS } from "../../packages/appearance/src/index"

const term = { id: 1, academicYear: 2569, semester: 1, label: "2569/1", current: true }
const course = {
  courseCode: "2301101",
  shortName: "CALCULUS I",
  nameTh: "วิชาทดสอบ",
  nameEn: "Warning review course",
  faculty: "Science",
  department: "Mathematics",
  credits: 3,
  prerequisiteText: "PRER 2300101; COREQ 2300102",
  genEdType: null,
  sectionCount: 1,
  reviewCount: 0,
  reviewAverage: null,
}
const section = {
  id: 901,
  sectionNo: "1",
  closed: false,
  capacity: 30,
  baselineEnrolled: 10,
  localActive: 0,
  remainingSeats: 20,
  note: null,
  active: true,
  meetings: [],
}
const detail: CourseDetailDto = {
  term,
  offering: {
    ...course,
    id: 1,
    termId: 1,
    shortName: course.shortName,
    descriptionTh: null,
    descriptionEn: null,
    creditHours: null,
    studyPrograms: [],
    midterm: null,
    final: null,
  },
  sections: [section],
  reviewSummary: { count: 0, average: null },
}
const issues: RuleIssueDto[] = [
  { code: "PREREQUISITE_MISSING", message: "Prerequisite not verified" },
  { code: "COREQUISITE_MISSING", message: "Corequisite not verified" },
  { code: "FACULTY_APPROVAL_REQUIRED", message: "Faculty approval needs review" },
  {
    code: "SCHEDULE_CONFLICT",
    message: "Class overlap",
    details: {
      conflicts: [
        {
          courseCode: "2301102",
          target: { dayCode: "MO", startMinute: 540, endMinute: 660 },
          existing: { dayCode: "MO", startMinute: 600, endMinute: 720 },
        },
      ],
    },
  },
  {
    code: "EXAM_CONFLICT",
    message: "Exam overlap",
    details: {
      conflicts: [
        {
          courseCode: "2301102",
          targetKind: "midterm",
          existingKind: "final",
          target: { date: "2026-11-20", startMinute: 780, endMinute: 900 },
          existing: { date: "2026-11-20", startMinute: 840, endMinute: 960 },
        },
      ],
    },
  },
]

async function mockRegistration(page: Page) {
  const state = {
    previews: [] as unknown[],
    saves: [] as { confirmationToken: string }[],
    saveKeys: [] as (string | undefined)[],
    registrationReads: 0,
    detailReads: [] as string[],
    referenceReads: [] as string[],
    detailsDelivered: 0,
    includeSecondCourse: false,
    defaultDetail: detail,
    detailQueue: [] as {
      courseCode: string
      wait?: Promise<void>
      data: CourseDetailDto
      status?: number
      done?: () => void
    }[],
    unexpected: [] as string[],
    failPreview: false,
    failSave: null as null | 409 | 503 | "network",
    full: false,
    language: "en" as "en" | "th" | "zh",
    theme: "light" as "light" | "dark",
    holdPreview: null as Promise<void> | null,
  }
  // Never fall through to the real API, including unexpected writes.
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const ok = (data: unknown) => route.fulfill({ json: { data } })
    const failure = () =>
      route.fulfill({
        status: 503,
        json: {
          type: "about:blank",
          title: "Temporary failure",
          status: 503,
          code: "TEMPORARY_FAILURE",
          detail: "Temporary failure; review again",
        },
      })
    if (method === "GET") {
      if (path === "/api/v1/terms") return ok([term])
      if (path === "/api/v1/registration-access")
        return ok({ termId: term.id, status: "open", authorized: true })
      if (path === "/api/v1/favorites") return ok([])
      if (path === "/api/v1/me")
        return ok({
          studentId: "warnings-mocked",
          rememberMe: true,
          lastLoginAt: "2026-09-06T00:00:00Z",
        })
      if (path === "/api/v1/preferences")
        return ok({ ...DEFAULT_APPEARANCE_SETTINGS, theme: state.theme, language: state.language })
      if (path === "/api/v1/registrations") {
        state.registrationReads++
        return ok({
          term,
          registrations: [
            {
              registrationId: 701,
              courseCode: "2301102",
              shortName: "PHYSICS I",
              nameTh: "วิชาเดิม",
              nameEn: "Existing overlapping course",
              credits: 3,
              status: "active",
              offeringId: 2,
              sectionId: 902,
              sectionNo: "2",
              meetings: [],
            },
          ],
        })
      }
      if (path === "/api/v1/courses") {
        const params = new URL(request.url()).searchParams
        const q = params.get("q") ?? ""
        if (["2300101", "2300102"].includes(q)) {
          state.referenceReads.push(q)
          expect(params.get("academicYear")).toBe("2569")
          expect(params.get("semester")).toBe("1")
          return route.fulfill({
            json: {
              data: [
                { ...course, courseCode: q, shortName: q === "2300101" ? "PRE CALC" : "CALC LAB" },
              ],
              meta: { term },
            },
          })
        }
        return route.fulfill({
          json: {
            data: state.includeSecondCourse
              ? [course, { ...course, courseCode: "2301200", nameEn: "Race course B" }]
              : [course],
            meta: { term, page: 1, pageSize: 8, total: 1, totalPages: 1 },
          },
        })
      }
      if (/^\/api\/v1\/courses\/\d{7}$/.test(path)) {
        const code = path.split("/").at(-1) ?? ""
        state.detailReads.push(code)
        const index = state.detailQueue.findIndex((response) => response.courseCode === code)
        const response = index >= 0 ? state.detailQueue.splice(index, 1)[0] : undefined
        if (response?.wait) await response.wait
        if (response?.status) await failure()
        else await ok(response?.data ?? state.defaultDetail)
        state.detailsDelivered++
        response?.done?.()
        return
      }
    }
    if (method === "POST" && path === "/api/v1/registrations/batch-preview") {
      state.previews.push(request.postDataJSON())
      const token = `review-${state.previews.length}`
      if (state.holdPreview) await state.holdPreview
      if (state.failPreview) {
        state.failPreview = false
        return failure()
      }
      const preview: BatchRegistrationPreviewDto = {
        eligible: !state.full,
        confirmationToken: state.full ? null : token,
        expiresAt: "2099-01-01T00:00:00Z",
        items: [
          {
            requestIndex: 0,
            eligible: !state.full,
            course,
            section,
            issues: state.full
              ? [...issues, { code: "SECTION_FULL", message: "SECTION_FULL: No seats remain" }]
              : issues,
          },
        ],
      }
      return ok(preview)
    }
    if (method === "POST" && path === "/api/v1/registrations/batch") {
      state.saves.push(request.postDataJSON())
      state.saveKeys.push(request.headers()["idempotency-key"])
      if (state.failSave) {
        const failureKind = state.failSave
        state.failSave = null
        if (failureKind === "network") return route.abort("failed")
        if (failureKind === 409)
          return route.fulfill({
            status: 409,
            json: {
              type: "about:blank",
              title: "Confirmation invalid",
              status: 409,
              code: "CONFIRMATION_INVALID",
              detail: "Confirmation invalid; review again",
            },
          })
        return failure()
      }
      return ok({
        registrations: [
          { registrationId: 702, status: "active", courseCode: course.courseCode, sectionNo: "1" },
        ],
      })
    }
    state.unexpected.push(`${method} ${path}`)
    return route.fulfill({ status: 501, json: { code: "UNMOCKED_REQUEST" } })
  })
  return state
}

async function selectDraft(page: Page, relation?: "Or" | "To", language?: "en" | "th" | "zh") {
  await page.goto("/register")
  if (language) await expect(page.locator("html")).toHaveAttribute("data-language", language)
  const row = page.getByTestId("registration-draft-row")
  await row
    .getByRole("combobox", { name: /Course code or title|รหัสหรือชื่อรายวิชา|课程代码或名称/ })
    .fill(course.courseCode)
  await page.getByRole("option", { name: new RegExp(course.courseCode) }).click()
  if (relation) {
    await row.getByRole("button", { name: "Mode", exact: true }).click()
    await page.getByRole("option", { name: relation, exact: true }).click()
  }
  await row.getByRole("button", { name: /^(Section|ตอน|班次)$/ }).click()
  await page.getByRole("option", { name: /(?:Section|ตอน|班次) 1/ }).click()
  return row
}

async function expandCategory(scope: Locator, category: RegExp, key = "Enter") {
  const toggle = scope.getByRole("button", { name: category })
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await toggle.focus()
  await toggle.press(key)
  await expect(toggle).toHaveAttribute("aria-expanded", "true")
  const panel = scope.getByRole("region", { name: category })
  await expect(panel).toBeVisible()
  return panel
}

async function expectNoPanelOverflow(scope: Locator, label: string) {
  const measurements = await scope.evaluate((element) =>
    [element, ...element.querySelectorAll("section[aria-labelledby]")]
      .filter((panel) => panel.clientWidth > 0)
      .map((panel) => ({
        panel:
          panel.getAttribute("aria-label") ??
          panel.getAttribute("aria-labelledby") ??
          panel.tagName,
        scrollWidth: panel.scrollWidth,
        clientWidth: panel.clientWidth,
      })),
  )
  expect(measurements.length).toBeGreaterThan(0)
  for (const measurement of measurements)
    expect
      .soft(measurement.scrollWidth, `${label}: ${measurement.panel}`)
      .toBeLessThanOrEqual(measurement.clientWidth)
}

async function settleDialog(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible()
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    )
  })
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        for (let node: Element | null = element; node; node = node.parentElement) {
          if (node.hasAttribute("data-entering") || node.hasAttribute("data-exiting")) return false
          if (Number(getComputedStyle(node).opacity) !== 1) return false
        }
        return true
      }),
    )
    .toBe(true)
}

async function captureReview(page: Page, testInfo: TestInfo, label: string) {
  const dialog = page.getByRole("alertdialog", { name: /^(Confirm save|ยืนยันการบันทึก|确认保存)$/ })
  const save = dialog.getByRole("button", { name: /^(Save anyway|บันทึกแม้มีคำเตือน|仍然保存)$/ })
  await expect(save).toBeEnabled()
  await settleDialog(page, dialog)
  // Scroll within the real overlay; never expand the document to capture a fixed dialog.
  await dialog.evaluate((element) => {
    for (const child of element.querySelectorAll<HTMLElement>("*")) {
      if (
        /auto|scroll/.test(getComputedStyle(child).overflowY) &&
        child.scrollHeight > child.clientHeight
      )
        child.scrollTop = 0
    }
  })
  await dialog.getByRole("heading").scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath(`confirm-warnings-${label}.png`),
    fullPage: false,
    animations: "disabled",
  })
  const headingVisibility = await dialog.getByRole("heading").evaluate((heading) => {
    const bounds = heading.getBoundingClientRect()
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    )
    return {
      unobscured:
        hit !== null &&
        heading.contains(hit) &&
        heading.closest('[role="alertdialog"]')?.contains(hit),
      top: bounds.top,
      hit: hit?.tagName,
    }
  })
  expect
    .soft(
      headingVisibility.unobscured,
      `dialog heading obscured ${label}: ${JSON.stringify(headingVisibility)}`,
    )
    .toBe(true)
  await expectNoPanelOverflow(dialog, `dialog ${label}`)
  expect
    .soft(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      `root ${label}`,
    )
    .toBe(true)
  const exam = dialog.getByRole("region", {
    name: /^(Exam times overlap|เวลาสอบทับซ้อน|考试时间冲突)/,
  })
  await exam.scrollIntoViewIfNeeded()
  await expect(exam).toBeInViewport({ ratio: 1 })
  await expect(exam).toContainText("13:00–15:00")
  await expect(exam).toContainText("14:00–16:00")
  await page.screenshot({
    path: testInfo.outputPath(`confirm-exam-${label}.png`),
    fullPage: false,
    animations: "disabled",
  })
  await save.scrollIntoViewIfNeeded()
  await expect(save).toBeInViewport({ ratio: 1 })
  await save.click({ trial: true })
  expect(
    await save.evaluate((button) => {
      const bounds = button.getBoundingClientRect()
      const hit = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      )
      return (
        hit !== null &&
        button.contains(hit) &&
        button.closest('[role="alertdialog"]')?.contains(hit)
      )
    }),
    `save button belongs to the foreground dialog ${label}`,
  ).toBe(true)
  const keepEditing = dialog.getByRole("button", { name: /^(Keep editing|กลับไปแก้ไข|继续编辑)$/ })
  await expect(keepEditing).toBeInViewport({ ratio: 1 })
  await page.screenshot({
    path: testInfo.outputPath(`confirm-footer-${label}.png`),
    fullPage: false,
    animations: "disabled",
  })
}

test("live warning categories support keyboard review and fit all target widths", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  const state = await mockRegistration(page)
  const row = await selectDraft(page)
  const classPanel = await expandCategory(row, /^Class/)
  await expect(classPanel).toContainText("2301101")
  await expect(classPanel).toContainText("2301102")
  await expect(classPanel).toContainText("CALCULUS I")
  await expect(classPanel).toContainText("PHYSICS I")
  await expect(classPanel).toContainText("09:00–11:00")
  await expect(classPanel).toContainText("10:00–12:00")
  await expect(classPanel).toContainText("Overlap: 60 minutes")
  const examPanel = await expandCategory(row, /^Exam/, "Space")
  await expect(examPanel).toContainText("2301101")
  await expect(examPanel).toContainText("2301102")
  await expect(examPanel).toContainText("CALCULUS I")
  await expect(examPanel).toContainText("PHYSICS I")
  await expect(examPanel).toContainText(/Nov 20, 2026|2026-11-20/)
  await expect(examPanel).toContainText("Midterm")
  await expect(examPanel).toContainText("Final")
  await expect(examPanel).toContainText("13:00–15:00")
  await expect(examPanel).toContainText("14:00–16:00")
  await expect(examPanel).toContainText("Overlap: 60 minutes")
  for (const category of [/^Prerequisite/, /^Corequisite/, /^(Faculty|Requirements to review)/]) {
    const panel = await expandCategory(row, category)
    await expect(panel).toContainText(/not.*verified/i)
  }
  const requirements = await expandCategory(row, /^Course requirements/)
  await expect(requirements).toContainText(course.prerequisiteText)
  await expect(requirements.getByRole("link", { name: /Search 2300101/ })).toHaveAttribute(
    "href",
    "/search?q=2300101&academicYear=2569&semester=1",
  )
  await expect(requirements).toContainText("PRE CALC")
  await expect(requirements).toContainText("CALC LAB")
  expect(state.referenceReads.sort()).toEqual(["2300101", "2300102"])
  for (const width of [320, 375, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({
      path: testInfo.outputPath(`live-warnings-${width}.png`),
      fullPage: true,
      animations: "disabled",
    })
    expect
      .soft(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `live warnings overflow at ${width}`,
      )
      .toBe(true)
    await expectNoPanelOverflow(row, `live warnings ${width}`)
  }
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled()
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  const dialog = page.getByRole("alertdialog", { name: "Confirm save" })
  await expect(dialog.getByRole("button", { name: "Save anyway" })).toBeEnabled()
  for (const width of [320, 375, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await captureReview(page, testInfo, String(width))
  }
  await dialog.getByRole("button", { name: "Keep editing" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeFocused()
  expect(state.saves).toEqual([])
  expect(state.unexpected).toEqual([])
})

test("settled dark and compact Thai and Chinese confirmation screenshots", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  const state = await mockRegistration(page)
  for (const variant of [
    { language: "en", theme: "dark", width: 1280 },
    { language: "th", theme: "light", width: 320 },
    { language: "zh", theme: "light", width: 320 },
  ] as const) {
    state.language = variant.language
    state.theme = variant.theme
    await page.setViewportSize({ width: variant.width, height: 900 })
    const row = await selectDraft(page, undefined, variant.language)
    await expect(page.locator("html")).toHaveAttribute("data-theme", variant.theme)
    await expect(
      row.getByRole("button", { name: /^(Class times overlap|เวลาเรียนทับซ้อน|上课时间冲突)/ }),
    ).toBeVisible()
    const trigger = page.getByRole("button", { name: /^(Save changes|บันทึกการแก้ไข|保存更改)$/ })
    await trigger.click()
    await captureReview(page, testInfo, `${variant.language}-${variant.theme}-${variant.width}`)
    const dialog = page.getByRole("alertdialog", { name: /^(Confirm save|ยืนยันการบันทึก|确认保存)$/ })
    await dialog.getByRole("button", { name: /^(Keep editing|กลับไปแก้ไข|继续编辑)$/ }).click()
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  }
  expect(state.saves).toEqual([])
  expect(state.unexpected).toEqual([])
})

test("Save changes obtains a fresh review and only Save anyway posts the batch", async ({
  page,
}) => {
  const state = await mockRegistration(page)
  const row = await selectDraft(page)
  await expect(row.getByRole("button", { name: /^Class/ })).toBeVisible()
  const before = state.previews.length
  let release = () => {}
  state.holdPreview = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  const dialog = page.getByRole("alertdialog", { name: "Confirm save" })
  await expect(dialog).toBeVisible()
  await expect.poll(() => state.previews.length).toBe(before + 1)
  expect(state.previews.at(-1)).toMatchObject({ choices: [{ sectionId: 901 }] })
  await expect(dialog.getByRole("button", { name: /Retry check|Save anyway/ })).toBeDisabled()
  expect(state.saves).toEqual([])
  release()
  await expect(dialog.getByRole("button", { name: "Save anyway" })).toBeEnabled()
  expect(state.saves).toEqual([])
  await dialog.getByRole("button", { name: "Save anyway" }).click()
  await expect(dialog).toBeHidden()
  expect(state.saves).toEqual([{ confirmationToken: `review-${before + 1}` }])
  expect(state.unexpected).toEqual([])
})

test("fresh SECTION_FULL review blocks saving despite advisory warnings", async ({ page }) => {
  const state = await mockRegistration(page)
  const row = await selectDraft(page)
  await expect(row.getByRole("button", { name: /^Class/ })).toBeVisible()
  state.full = true
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  const dialog = page.getByRole("alertdialog", { name: "Confirm save" })
  await expect(dialog.getByText("SECTION_FULL: No seats remain", { exact: true })).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Save anyway" })).toBeDisabled()
  expect(state.saves).toEqual([])
  expect(state.unexpected).toEqual([])
})

test("transient preview and known 409 confirmation failure require fresh review", async ({
  page,
}) => {
  const state = await mockRegistration(page)
  state.failPreview = true
  const row = await selectDraft(page)
  await expect(row.getByText(/Check unavailable/)).toBeVisible()
  state.failPreview = true
  await page.getByRole("button", { name: "Save changes", exact: true }).click()
  const dialog = page.getByRole("alertdialog", { name: "Confirm save" })
  const retry = dialog.getByRole("button", { name: "Retry check" })
  await expect(dialog.getByText("Temporary failure; review again", { exact: true })).toBeVisible()
  await expect(retry).toBeEnabled()
  const beforeRetry = state.previews.length
  await retry.click()
  const save = dialog.getByRole("button", { name: "Save anyway" })
  await expect(save).toBeEnabled()
  expect(state.previews).toHaveLength(beforeRetry + 1)
  expect(state.saves).toEqual([])
  state.failSave = 409
  await save.click()
  await expect(retry).toBeEnabled()
  await expect(
    dialog.getByText("Confirmation invalid; review again", { exact: true }),
  ).toBeVisible()
  await expect(save).toHaveCount(0)
  expect(state.saves).toEqual([{ confirmationToken: `review-${beforeRetry + 1}` }])
  const beforeConfirmRetry = state.previews.length
  await retry.click()
  await expect(save).toBeEnabled()
  expect(state.previews).toHaveLength(beforeConfirmRetry + 1)
  expect(state.saves).toHaveLength(1)
  await save.click()
  await expect(dialog).toBeHidden()
  expect(state.saves.at(-1)).toEqual({ confirmationToken: `review-${beforeConfirmRetry + 1}` })
  expect(state.saves).toHaveLength(2)
  expect(state.saveKeys[1]).not.toBe(state.saveKeys[0])
  expect(state.unexpected).toEqual([])
})

test("503 and network uncertainty retry the same token and idempotency key once", async ({
  page,
}) => {
  const state = await mockRegistration(page)
  for (const failureKind of [503, "network"] as const) {
    const row = await selectDraft(page)
    await expect(row.getByRole("button", { name: /^Class/ })).toBeVisible()
    await page.getByRole("button", { name: "Save changes", exact: true }).click()
    const dialog = page.getByRole("alertdialog", { name: "Confirm save" })
    await expect(dialog.getByRole("button", { name: "Save anyway" })).toBeEnabled()
    const previews = state.previews.length
    const saves = state.saves.length
    const reads = state.registrationReads
    state.failSave = failureKind
    await dialog.getByRole("button", { name: "Save anyway" }).click()
    const retry = dialog.getByRole("button", { name: "Retry save", exact: true })
    await expect(retry).toBeEnabled()
    await expect.poll(() => state.registrationReads).toBeGreaterThan(reads)
    expect(state.saves).toHaveLength(saves + 1)
    expect(state.saveKeys[saves]).toBeTruthy()
    await expect(dialog.getByRole("button", { name: "Retry check", exact: true })).toHaveCount(0)
    expect(state.previews).toHaveLength(previews)
    await dialog.getByRole("button", { name: "Keep editing" }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole("button", { name: "Add course", exact: true }).click()
    await expect(page.getByTestId("registration-draft-row")).toHaveCount(2)
    const addedRowFeedback = await page
      .getByTestId("registration-draft-row")
      .last()
      .getByRole("combobox", { name: "Course code or title" })
      .getAttribute("aria-describedby")
    expect(addedRowFeedback).toBeTruthy()
    await page.getByRole("button", { name: "Review pending save", exact: true }).click()
    await expect(retry).toBeEnabled()
    expect
      .soft(state.previews, "Closing/reopening an uncertain save must not preview again")
      .toHaveLength(previews)
    await retry.click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId("registration-draft-row")).toHaveCount(1)
    await expect(
      page
        .getByTestId("registration-draft-row")
        .getByRole("combobox", { name: "Course code or title" }),
    ).toHaveAttribute("aria-describedby", addedRowFeedback ?? "")
    await expect(
      page
        .getByTestId("registration-draft-row")
        .getByRole("combobox", { name: "Course code or title" }),
    ).toHaveValue("")
    expect(state.saves).toHaveLength(saves + 2)
    expect(state.saves[saves + 1]).toEqual(state.saves[saves])
    expect(state.saveKeys[saves + 1]).toBe(state.saveKeys[saves])
    expect
      .soft(state.previews, "Safe replay must not obtain a replacement preview")
      .toHaveLength(previews)
  }
  expect(state.unexpected).toEqual([])
})

test("removing a draft course shows its code and short name", async ({ page }) => {
  const state = await mockRegistration(page)
  const row = await selectDraft(page)
  await row.getByRole("button", { name: "Remove row" }).click()
  const dialog = page.getByRole("alertdialog", { name: "Confirm removal" })
  await expect(dialog).toContainText("2301101 · CALCULUS I")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(row).toBeVisible()
  expect(state.saves).toEqual([])
})

test("incomplete Or and To choices do not enter batch preview", async ({ page }) => {
  const state = await mockRegistration(page)
  for (const relation of ["Or", "To"] as const) {
    const row = await selectDraft(page, relation)
    await expect(row.getByText("Choose the alternative section", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Save changes", exact: true }).click()
    const dialog = page.getByRole("alertdialog", { name: "Confirm save" })
    await expect(
      dialog.getByText("Resolve blocking errors before saving", { exact: true }),
    ).toBeVisible()
    expect(state.previews).toEqual([])
    expect(state.saves).toEqual([])
    await dialog.getByRole("button", { name: "Keep editing" }).click()
    await expect(dialog).toBeHidden()
  }
  expect(state.unexpected).toEqual([])
})

test("A to B to A keeps newest sections when the first A succeeds or fails late", async ({
  page,
}) => {
  const state = await mockRegistration(page)
  state.includeSecondCourse = true
  for (const staleStatus of [200, 503]) {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const newest = { ...detail, sections: [{ ...section, id: 905, sectionNo: "5" }] }
    state.defaultDetail = newest
    let oldFinished = () => {}
    const oldDelivered = new Promise<void>((resolve) => {
      oldFinished = resolve
    })
    const b = {
      ...detail,
      offering: { ...detail.offering, courseCode: "2301200", nameEn: "Race course B" },
    }
    state.detailQueue = [
      {
        courseCode: course.courseCode,
        wait: held,
        done: oldFinished,
        data: detail,
        ...(staleStatus === 503 ? { status: staleStatus } : {}),
      },
      { courseCode: "2301200", data: b },
      { courseCode: course.courseCode, data: newest },
    ]
    const reads = state.detailReads.length
    const delivered = state.detailsDelivered
    await page.goto("/register")
    const row = page.getByTestId("registration-draft-row")
    const choose = async (code: string) => {
      await row.getByRole("combobox", { name: "Course code or title" }).fill(code)
      await page.getByRole("option", { name: new RegExp(code) }).click()
    }
    try {
      await choose(course.courseCode)
      await expect.poll(() => state.detailReads.length).toBe(reads + 1)
      await choose("2301200")
      await expect.poll(() => state.detailsDelivered).toBe(delivered + 1)
      await choose(course.courseCode)
      await expect.poll(() => state.detailsDelivered).toBe(delivered + 2)
      expect(state.detailReads.slice(reads)).toEqual([
        course.courseCode,
        "2301200",
        course.courseCode,
      ])
      const sectionTrigger = row.getByRole("button", { name: "Section", exact: true })
      await sectionTrigger.click()
      await page.getByRole("option", { name: /(?:Section|ตอน) 5/ }).click()
      await expect(row.getByRole("button", { name: /^Class/ })).toBeVisible()
      release()
      await oldDelivered
      // A browser round trip after delivery lets the stale fetch continuation commit, if buggy.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
      await expect(sectionTrigger).toContainText(/(?:Section|ตอน) 5/)
      await sectionTrigger.click()
      await expect(page.getByRole("option", { name: /(?:Section|ตอน) 5/ })).toBeVisible()
      await expect(page.getByRole("option", { name: /(?:Section|ตอน) 1/ })).toHaveCount(0)
      await page.keyboard.press("Escape")
      await expect(row.getByText(/Could not load sections/)).toHaveCount(0)
      await expect(page.getByRole("alertdialog", { name: "Could not load sections" })).toHaveCount(
        0,
      )
    } finally {
      release()
    }
  }
  expect(state.saves).toEqual([])
  expect(state.unexpected).toEqual([])
})
