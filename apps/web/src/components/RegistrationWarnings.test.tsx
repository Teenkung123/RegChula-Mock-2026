import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it } from "vitest"
import { LocaleProvider } from "../i18n"
import {
  isAdvisoryIssue,
  RegistrationWarnings,
  type RegistrationWarningsProps,
} from "./RegistrationWarnings"

afterEach(cleanup)

function show(props: RegistrationWarningsProps, language: "en" | "th" | "zh" = "en") {
  return render(
    <MemoryRouter>
      <LocaleProvider language={language}>
        <RegistrationWarnings {...props} />
      </LocaleProvider>
    </MemoryRouter>,
  )
}

const pair = {
  courseCode: "7654321",
  target: { dayCode: "MO", startMinute: 540, endMinute: 660 },
  existing: { dayCode: "MO", startMinute: 600, endMinute: 720 },
}

describe("RegistrationWarnings", () => {
  it("keeps raw-only requirements neutral, preserves OR and toggles a linked panel", () => {
    show({ courseCode: "1234567", issues: [], prerequisiteText: "PRER 1111111 OR 2222222" })
    const button = screen.getByRole("button", { name: "Course requirements" })
    expect(button).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText(/Warnings only/)).not.toBeInTheDocument()
    expect(screen.queryByText("Not verified")).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(button).toHaveAttribute("aria-expanded", "true")
    expect(document.getElementById(button.getAttribute("aria-controls") ?? "")).toBeVisible()
    expect(screen.getByText("PRER 1111111 OR 2222222")).toBeVisible()
    const link = screen.getByRole("link", { name: "Search 1111111 (opens in a new tab)" })
    expect(link).toHaveAttribute("href", "/search?q=1111111")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(isAdvisoryIssue({ code: "REQUIREMENTS", message: "" })).toBe(false)
    expect(isAdvisoryIssue({ code: "SECTION_FULL", message: "" })).toBe(false)
  })

  it("counts and links specifically unverified courses, keeping source alternatives separate", () => {
    show({
      courseCode: "1234567",
      defaultExpanded: true,
      prerequisiteText: "PRER 1111111 OR 2222222",
      issues: [
        {
          code: "PREREQUISITE_MISSING",
          message: "",
          details: { missingCourseCodes: ["1111111", "3333333", null, 42] },
        },
      ],
    })
    const region = screen.getByRole("region", { name: "Prerequisites 2" })
    expect(within(region).getByText("Not verified")).toBeVisible()
    expect(within(region).getAllByRole("link")).toHaveLength(2)
    expect(within(region).queryByText("2222222")).not.toBeInTheDocument()
    expect(screen.getByText(/Warnings only/)).toBeVisible()
  })

  it("counts conflict pairs and shows localized days, exact ranges and geometry-only bars", () => {
    const { container } = show({
      courseCode: "1234567",
      defaultExpanded: true,
      issues: [
        {
          code: "SCHEDULE_CONFLICT",
          message: "",
          details: { conflicts: [pair, { ...pair, courseCode: "3333333" }] },
        },
      ],
    })
    expect(screen.getByRole("button", { name: "Class times overlap 2" })).toBeVisible()
    expect(screen.getAllByText(/Monday/)).toHaveLength(4)
    expect(screen.getAllByText(/09:00–11:00/)).toHaveLength(2)
    expect(screen.getAllByText("Overlap: 60 minutes")).toHaveLength(2)
    expect(container.querySelectorAll('[style*="--bar-start"]')).toHaveLength(8)
    expect(container.querySelector("[aria-live]")).toBeNull()
  })

  it.each(["en", "th", "zh"] as const)(
    "accepts revived Dates and ISO dates in %s using UTC",
    (language) => {
      show(
        {
          courseCode: "1234567",
          defaultExpanded: true,
          issues: [
            {
              code: "EXAM_CONFLICT",
              message: "",
              details: {
                conflicts: [
                  {
                    ...pair,
                    target: { ...pair.target, date: new Date("2026-09-06T00:00:00Z") },
                    existing: { ...pair.existing, date: "2026-09-06T00:00:00.000Z" },
                    targetKind: "midterm",
                    existingKind: "final",
                  },
                ],
              },
            },
          ],
        },
        language,
      )
      const locale = { en: "en-US", th: "th-TH", zh: "zh-CN" }[language]
      const date = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date("2026-09-06T00:00:00Z"))
      expect(
        screen.getAllByText(
          (_, element) => element?.tagName === "P" && !!element.textContent?.includes(date),
        ),
      ).toHaveLength(2)
    },
  )

  it("does not render invented durations for invalid dates and supports fallback", () => {
    show({
      courseCode: "1234567",
      defaultExpanded: true,
      issues: [
        {
          code: "EXAM_CONFLICT",
          message: "",
          details: {
            conflictingCourseCode: "7654321",
            conflicts: [null, { ...pair, target: { ...pair.target, date: new Date("invalid") } }],
          },
        },
      ],
    })
    expect(screen.getByRole("region", { name: "Exam times overlap 2" })).toHaveTextContent(
      "1234567 ↔ 7654321",
    )
    expect(screen.getByText(/Some timing details/)).toBeVisible()
    expect(screen.queryByText(/Overlap:/)).not.toBeInTheDocument()
  })

  it("keeps Thai catalogue requirements visible with defaultExpanded", () => {
    show(
      {
        courseCode: "1234567",
        issues: [],
        prerequisiteText: "CORE 1111111",
        defaultExpanded: true,
      },
      "th",
    )
    expect(screen.getByRole("button", { name: "เงื่อนไขรายวิชา" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(screen.getByText("เงื่อนไขจากต้นทาง")).toBeVisible()
    expect(screen.getByText("CORE 1111111")).toBeVisible()
  })

  it("rejects adjacent ranges and nonfinite minutes without drawing bars", () => {
    const { container } = show({
      courseCode: "1234567",
      defaultExpanded: true,
      issues: [
        {
          code: "SCHEDULE_CONFLICT",
          message: "",
          details: {
            conflicts: [
              { ...pair, existing: { ...pair.existing, startMinute: 660 } },
              { ...pair, target: { ...pair.target, startMinute: Number.NaN } },
            ],
          },
        },
      ],
    })
    expect(screen.queryByText(/Overlap:/)).not.toBeInTheDocument()
    expect(container.querySelector('[style*="--bar-start"]')).toBeNull()
    expect(screen.getByText(/Some timing details/)).toBeVisible()
  })
})
