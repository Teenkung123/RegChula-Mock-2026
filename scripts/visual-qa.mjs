import AxeBuilder from "@axe-core/playwright"
import { chromium } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const viewports = [
  { width: 320, height: 900 },
  { width: 375, height: 900 },
  { width: 414, height: 900 },
  { width: 768, height: 900 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1080 },
  { width: 3440, height: 1440 },
]
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const auditTheme = process.env.AUDIT_THEME === "dark" ? "dark" : "light"
const auditWidths = process.env.AUDIT_WIDTHS?.split(",").map(Number)
const outputDirectory = resolve(scriptDirectory, "../tmp/browser", "audit-" + auditTheme)
await mkdir(outputDirectory, { recursive: true })

async function assertInlineControlQuality(page, label, width) {
  const failures = await page.evaluate(() => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0
      )
    }
    const textRects = (element) => {
      const root = element.getBoundingClientRect()
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      const rects = []
      let node = walker.nextNode()
      while (node) {
        if (node.textContent?.trim() && !node.parentElement?.closest("[aria-hidden='true']")) {
          const range = document.createRange()
          range.selectNodeContents(node)
          for (const rect of range.getClientRects()) {
            if (
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom > root.top &&
              rect.top < root.bottom
            ) {
              rects.push(rect)
            }
          }
        }
        node = walker.nextNode()
      }
      return rects
    }
    const describe = (element) =>
      element.getAttribute("aria-label") ||
      element.textContent?.trim().replaceAll(/\s+/g, " ").slice(0, 80) ||
      element.tagName.toLowerCase()
    const marked = [...document.querySelectorAll("[data-inline-control]")].filter(
      (element) =>
        isVisible(element) && !element.closest("[data-inline-layout='stacked-navigation']"),
    )
    const actionCandidates = [
      ...new Set([...document.querySelectorAll("button, a, [role='button']"), ...marked]),
    ].filter(
      (element) =>
        isVisible(element) && !element.closest("[data-inline-layout='stacked-navigation']"),
    )
    const issues = []
    for (const field of document.querySelectorAll('[data-field-control="true"]')) {
      if (!isVisible(field)) continue
      const box = field.getBoundingClientRect()
      const icon = field.querySelector("svg")?.getBoundingClientRect()
      const input = field.querySelector("input")?.getBoundingClientRect()
      if (
        !icon ||
        !input ||
        icon.left < box.left ||
        icon.right > box.right ||
        Math.abs(icon.top + icon.height / 2 - (input.top + input.height / 2)) > 2
      ) {
        issues.push("misaligned in-field icon: " + describe(field))
      }
    }

    for (const control of marked) {
      const style = window.getComputedStyle(control)
      if (!style.display.includes("flex") || style.flexWrap !== "nowrap") {
        issues.push("non-inline layout: " + describe(control))
      }
      for (const icon of control.querySelectorAll("svg, [data-slot='spinner']")) {
        if (window.getComputedStyle(icon).flexShrink !== "0") {
          issues.push("shrinkable icon: " + describe(control))
          break
        }
      }
    }

    for (const control of actionCandidates) {
      const icons = [...control.querySelectorAll("svg")].filter(isVisible)
      const labels = textRects(control).sort((left, right) => left.top - right.top)
      if (icons.length === 0 || labels.length === 0) continue

      const label = labels[0]
      const distinctLines = new Set(labels.map((rect) => Math.round(rect.top)))
      if (distinctLines.size > 1) {
        issues.push("wrapped action label: " + describe(control))
        continue
      }
      for (const icon of icons) {
        const iconRect = icon.getBoundingClientRect()
        if (iconRect.bottom < label.top - 4 || iconRect.top > label.bottom + 4) {
          issues.push("separated icon and label: " + describe(control))
          break
        }
      }
    }
    return issues
  })
  if (failures.length > 0) {
    throw new Error(
      label + " inline-control layout failures at " + width + "px: " + failures.join(", "),
    )
  }
}

async function assertPageQuality(page, label, width) {
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  if (horizontalOverflow) throw new Error(`${label} horizontal overflow at ${width}px`)
  const headingAligned = await page.evaluate(() => {
    const page = document.querySelector("main > div")?.getBoundingClientRect()
    const heading = document.querySelector("main h1")?.getBoundingClientRect()
    return !page || !heading || Math.abs(heading.left - page.left) < 60
  })
  if (!headingAligned)
    throw new Error(`${label} title is detached from its page context at ${width}px`)
  await assertInlineControlQuality(page, label, width)
  // React Aria owns this offscreen transient announcement region. It is not application content,
  // and axe can inspect it between announcement text insertion and cleanup.
  const axe = await new AxeBuilder({ page }).exclude('[data-live-announcer="true"]').analyze()
  const blocking = axe.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  )
  if (blocking.length > 0) {
    throw new Error(
      `${label} accessibility violations at ${width}px: ${blocking
        .flatMap((violation) =>
          violation.nodes.map((node) => `${violation.id} ${node.target.join(" ")} :: ${node.html}`),
        )
        .join(", ")}`,
    )
  }
}

async function activateWithoutScroll(locator) {
  await locator.evaluate((element) => element.click())
}

const browser = await chromium.launch({ headless: true, timeout: 15_000 })
try {
  for (const { width, height } of viewports) {
    if (auditWidths && !auditWidths.includes(width)) continue
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: auditTheme,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(15_000)
    const errors = []
    page.on("console", (message) => {
      const knownBrowserQuirk = message
        .text()
        .includes("ResizeObserver loop completed with undelivered notifications")
      if (
        (message.type() === "error" || message.type() === "warning") &&
        !message.text().includes("401 (Unauthorized)") &&
        !knownBrowserQuirk
      ) {
        errors.push(message.text())
      }
    })
    await page.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" })
    await page.getByTestId("challenge-code").waitFor()
    const layout = await page.evaluate(() => {
      const controls = [...document.querySelectorAll("button, a, [role=tab]")]
      const wrapped = controls
        .filter((element) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          const lines = new Set()
          let node = walker.nextNode()
          while (node) {
            if (node.textContent?.trim()) {
              const range = document.createRange()
              range.selectNodeContents(node)
              for (const rect of range.getClientRects()) {
                if (rect.width > 0 && rect.height > 0) lines.add(Math.round(rect.top))
              }
            }
            node = walker.nextNode()
          }
          return lines.size > 1
        })
        .map((element) => element.textContent?.trim() ?? element.getAttribute("aria-label") ?? "")
      return {
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        wrapped,
      }
    })
    if (layout.horizontalOverflow) throw new Error(`Horizontal overflow at ${width}px`)
    if (layout.wrapped.length > 0) {
      throw new Error(`Wrapped clickable text at ${width}px: ${layout.wrapped.join(", ")}`)
    }
    await assertInlineControlQuality(page, "login", width)
    const axe = await new AxeBuilder({ page }).analyze()
    const serious = axe.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    )
    if (serious.length > 0) {
      throw new Error(
        "Accessibility violations at " +
          width +
          "px: " +
          serious.map((violation) => violation.id).join(", "),
      )
    }
    if (errors.length > 0) {
      throw new Error(`Console errors at ${width}px: ${errors.join(" | ")}`)
    }
    if (width >= 960) {
      const primaryAction = await page.getByRole("button", { name: "เข้าสู่ระบบ" }).boundingBox()
      if (!primaryAction || primaryAction.y + primaryAction.height > height) {
        throw new Error(`Primary login action falls below the fold at ${width}x${height}`)
      }
    }
    await page.screenshot({
      path: resolve(outputDirectory, `login-${width}.png`),
      fullPage: true,
    })
    if (width !== 1280) {
      const challenge = (await page.getByTestId("challenge-code").textContent())?.trim() ?? ""
      await page.getByLabel("รหัสนิสิต").fill(`audit-${auditTheme}-${width}`)
      await page.getByLabel("รหัสผ่าน").fill("local-visual-audit-only")
      await page.getByLabel("กรอกรหัสยืนยัน").fill(challenge)
      await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click()
      await page.waitForURL(/\/dashboard$/)
      await page.getByRole("heading", { name: "ภาพรวมของคุณ" }).waitFor()
      await page.locator(`html[data-theme="${auditTheme}"]`).waitFor()
      await assertPageQuality(page, "dashboard", width)
      await page.screenshot({
        path: resolve(outputDirectory, `dashboard-${width}.png`),
        fullPage: true,
      })

      await page.getByRole("button", { name: "ค้นหารายวิชา" }).click()
      const quickSearch = page.getByRole("dialog", { name: "ค้นหารายวิชา" })
      await quickSearch.waitFor()
      const quickSearchBox = await quickSearch.boundingBox()
      if (!quickSearchBox || quickSearchBox.width > Math.min(416, width - 32)) {
        throw new Error(`Topbar search is not compact at ${width}px`)
      }
      await quickSearch.screenshot({
        path: resolve(outputDirectory, `topbar-search-${width}.png`),
      })
      await quickSearch.getByRole("combobox").fill("0123101")
      await page.getByRole("option").filter({ hasText: "0123101" }).first().waitFor()
      await assertPageQuality(page, "quick-search", width)
      await page.keyboard.press("Escape")
      await page.keyboard.press("Escape")
      await quickSearch.waitFor({ state: "hidden" })

      await page.goto("http://localhost:5173/search", { waitUntil: "domcontentloaded" })
      await page.getByRole("heading", { name: "ค้นหารายวิชา" }).waitFor()
      await page.getByRole("button", { name: "ตัวกรองเพิ่มเติม" }).click()
      await page.getByTestId("filter-group-attributes").click()
      await page.getByTestId("filter-group-classes").click()
      const filterHeights = await Promise.all(
        [
          page.getByTestId("faculty-autocomplete"),
          page.getByTestId("department-autocomplete"),
          page.getByTestId("time-start-trigger"),
          page.getByTestId("time-end-trigger"),
        ].map(async (control) => (await control.boundingBox())?.height ?? 0),
      )
      if (Math.max(...filterHeights) - Math.min(...filterHeights) > 2) {
        throw new Error(
          `Catalogue control height mismatch at ${width}px: ${filterHeights.join(", ")}`,
        )
      }
      await page.screenshot({
        path: resolve(outputDirectory, `search-${width}.png`),
        fullPage: true,
      })
      await page.getByTestId("term-utility").getByRole("button").click()
      await page.getByLabel("เปลี่ยนภาคการศึกษา").waitFor()
      await activateWithoutScroll(page.getByRole("button", { name: "เปลี่ยนภาคการศึกษา" }))
      const termListbox = page.getByRole("listbox")
      await termListbox.waitFor()
      await termListbox.screenshot({
        path: resolve(outputDirectory, `search-select-menu-${width}.png`),
      })
      await page.screenshot({
        path: resolve(outputDirectory, `search-select-${width}.png`),
        fullPage: true,
      })
      await termListbox.focus()
      await page.keyboard.press("Escape")
      await termListbox.waitFor({ state: "hidden" })
      await assertPageQuality(page, "search", width)

      await page.goto("http://localhost:5173/register", { waitUntil: "domcontentloaded" })
      await page.getByRole("heading", { name: "แก้ไขรายการลงทะเบียน" }).waitFor()
      await page.getByTestId("registration-repeater").waitFor()
      await page.screenshot({
        path: resolve(outputDirectory, `register-${width}.png`),
        fullPage: true,
      })
      await assertPageQuality(page, "register", width)

      await page.goto("http://localhost:5173/drop", { waitUntil: "domcontentloaded" })
      await page.getByTestId("management-form").waitFor()
      await assertPageQuality(page, "drop", width)
      await page.screenshot({
        path: resolve(outputDirectory, `drop-${width}.png`),
        fullPage: true,
      })

      await page.goto("http://localhost:5173/withdraw", { waitUntil: "domcontentloaded" })
      await page.getByTestId("management-form").waitFor()
      await assertPageQuality(page, "withdraw", width)
      await page.screenshot({
        path: resolve(outputDirectory, `withdraw-${width}.png`),
        fullPage: true,
      })

      await page.goto("http://localhost:5173/appearance", { waitUntil: "domcontentloaded" })
      await page.getByRole("heading", { name: "การแสดงผลและการอ่าน" }).waitFor()
      await assertPageQuality(page, "appearance", width)
      await page.screenshot({
        path: resolve(outputDirectory, `appearance-${width}.png`),
        fullPage: true,
      })

      await page.goto("http://localhost:5173/buildings", { waitUntil: "domcontentloaded" })
      await page.getByRole("heading", { name: "รายชื่ออาคาร" }).waitFor()
      await page.getByTestId("building-directory").waitFor()
      await assertPageQuality(page, "buildings", width)
      await page.screenshot({
        path: resolve(outputDirectory, `buildings-${width}.png`),
        fullPage: true,
      })

      await page.goto("http://localhost:5173/faculties", { waitUntil: "domcontentloaded" })
      await page.getByRole("heading", { name: "ค้นหารหัสคณะและภาควิชา" }).waitFor()
      await page.getByTestId("faculty-directory").waitFor()
      await assertPageQuality(page, "faculties", width)
      await page.screenshot({
        path: resolve(outputDirectory, `faculties-${width}.png`),
        fullPage: true,
      })

      await page.goto("http://localhost:5173/schedule", { waitUntil: "domcontentloaded" })
      await page.getByRole("heading", { name: "ตารางเรียนรายสัปดาห์" }).waitFor()
      await assertPageQuality(page, "schedule", width)
      await page.screenshot({
        path: resolve(outputDirectory, `schedule-${width}.png`),
        fullPage: true,
      })

      await page.goto("http://localhost:5173/exams", { waitUntil: "domcontentloaded" })
      await page.getByRole("heading", { name: "ตารางสอบ", exact: true }).waitFor()
      await assertPageQuality(page, "exams", width)
      await page.screenshot({
        path: resolve(outputDirectory, `exams-${width}.png`),
        fullPage: true,
      })
    }
    if (errors.length)
      throw new Error(`Console issues ${auditTheme}/${width}: ${errors.join(" | ")}`)
    console.log(`[visual] ${auditTheme} ${width}px passed`)
    await context.close()
  }
} finally {
  await browser.close()
}
