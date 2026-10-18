import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "../i18n"
import { getCourses } from "../lib/api"
import { courseLabel } from "../lib/course-label"
import { CourseReference } from "./CourseReference"
import { RegistrationWarnings } from "./RegistrationWarnings"

vi.mock("../lib/api", () => ({ getCourses: vi.fn() }))
const lookup = vi.mocked(getCourses)
const term = { academicYear: 2569, semester: 1 }
const named = {
  courseCode: "2301101",
  shortName: "CALCULUS I",
  nameTh: "แคลคูลัส 1",
  nameEn: "Calculus one",
}

beforeEach(() => {
  lookup.mockReset()
})

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LocaleProvider language="en">{children}</LocaleProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("compact course references", () => {
  it("reuses known short names with full hover text and localized fallbacks", () => {
    render(<CourseReference courseCode={named.courseCode} courses={[named]} term={term} />, {
      wrapper,
    })
    expect(screen.getByText("CALCULUS I")).toBeVisible()
    expect(screen.getByTitle("2301101 · Calculus one")).toBeVisible()
    expect(lookup).not.toHaveBeenCalled()
    expect(courseLabel({ ...named, shortName: " " }, "th")).toBe("2301101 · แคลคูลัส 1")
    expect(courseLabel({ courseCode: "2301101" }, "en")).toBe("2301101")
  })

  it("loads only expanded references and shares an exact-code, term-specific lookup", async () => {
    lookup.mockResolvedValue({ data: [named] } as Awaited<ReturnType<typeof getCourses>>)
    render(
      <RegistrationWarnings
        courseCode="9999999"
        prerequisiteText="PRER 2301101"
        term={term}
        issues={[
          {
            code: "PREREQUISITE_MISSING",
            message: "",
            details: { missingCourseCodes: ["2301101"] },
          },
        ]}
      />,
      { wrapper },
    )
    expect(lookup).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Course requirements" }))
    await screen.findByText("CALCULUS I")
    fireEvent.click(screen.getByRole("button", { name: "Prerequisites 1" }))
    expect(await screen.findAllByText("CALCULUS I")).toHaveLength(2)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith(
      expect.objectContaining({ ...term, q: "2301101", mode: "autocomplete" }),
      expect.any(AbortSignal),
    )
    expect(screen.getAllByRole("link")[0]).toHaveAttribute(
      "href",
      "/search?q=2301101&academicYear=2569&semester=1",
    )
  })

  it("never substitutes a different course and leaves a usable code on lookup failure", async () => {
    lookup
      .mockResolvedValueOnce({ data: [named] } as Awaited<ReturnType<typeof getCourses>>)
      .mockRejectedValueOnce(new Error("Offline"))
    render(
      <>
        <CourseReference courseCode="1111111" term={term} />
        <CourseReference courseCode="2222222" term={term} />
      </>,
      { wrapper },
    )
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2))
    expect(screen.getByText("1111111")).toBeVisible()
    expect(screen.getByText("2222222")).toBeVisible()
    expect(screen.queryByText("CALCULUS I")).not.toBeInTheDocument()
  })

  it("keeps names from different catalogue terms separate", async () => {
    lookup.mockImplementation(
      async (query) =>
        ({
          data: [{ ...named, shortName: query.semester === 1 ? "CALCULUS I" : "ARCHIVED NAME" }],
        }) as Awaited<ReturnType<typeof getCourses>>,
    )
    render(
      <>
        <CourseReference courseCode={named.courseCode} term={term} />
        <CourseReference courseCode={named.courseCode} term={{ ...term, semester: 2 }} />
      </>,
      { wrapper },
    )
    await screen.findByText("CALCULUS I")
    await screen.findByText("ARCHIVED NAME")
    expect(lookup).toHaveBeenCalledTimes(2)
  })
})
