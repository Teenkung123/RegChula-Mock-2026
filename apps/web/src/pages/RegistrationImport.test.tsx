import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "../i18n"
import { confirmBatchRegistration, getCourse } from "../lib/api"
import { RegistrationPage } from "./RegistrationPage"

const favoriteState = vi.hoisted(() => ({
  courses: [
    { courseCode: "100", nameTh: "วิชา 100", nameEn: "Course 100", offered: true },
    { courseCode: "200", nameTh: "วิชา 200", nameEn: "Course 200", offered: true },
    {
      courseCode: "300",
      nameTh: null as string | null,
      nameEn: null as string | null,
      offered: false,
    },
    { courseCode: "400", nameTh: "วิชา 400", nameEn: "Course 400", offered: true },
  ],
}))

vi.mock("./RegistrationAccess", () => ({
  RegistrationAccess: ({ children }: { children: () => ReactNode }) => children(),
}))
vi.mock("../lib/personal-planning", () => ({
  useFavorites: () => ({
    data: favoriteState.courses,
    isError: false,
  }),
}))
vi.mock("../lib/api", () => ({
  ApiError: class extends Error {},
  getRegistrations: vi.fn(async () => ({
    term: { id: 1, academicYear: 2026, semester: 1 },
    registrations: [
      {
        registrationId: 1,
        status: "active",
        courseCode: "200",
        nameTh: "Existing",
        nameEn: "Existing",
        credits: 3,
        sectionNo: "1",
      },
    ],
  })),
  getCourses: vi.fn(async () => ({ data: [] })),
  getCourse: vi.fn(async (courseCode: string) => {
    if (courseCode === "400") throw new Error("Unavailable")
    return {
      offering: {
        courseCode,
        nameTh: `Course ${courseCode}`,
        nameEn: `Course ${courseCode}`,
        credits: 3,
      },
      sections: [],
    }
  }),
  previewBatchRegistration: vi.fn(),
  confirmBatchRegistration: vi.fn(),
}))

describe("favorite course import", () => {
  it("preserves the draft, skips duplicates and unavailable courses, and does not submit", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LocaleProvider language="en">
            <RegistrationPage />
          </LocaleProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const importButton = await screen.findByRole("button", { name: "Import favorites" })
    await waitFor(() => expect(importButton).toBeEnabled())
    fireEvent.click(importButton)
    let dialog = await screen.findByRole("alertdialog", { name: "Import favorites" })
    expect(within(dialog).getByText(/Choose sections and save when ready/)).toBeVisible()
    const toImport = within(dialog).getByRole("region", { name: "To import" })
    expect(toImport).toHaveTextContent(/100.*Course 100/)
    expect(toImport).toHaveTextContent(/400.*Course 400/)
    expect(toImport).not.toHaveTextContent("200")
    expect(within(dialog).getByRole("region", { name: "Already in your list" })).toHaveTextContent(
      "200",
    )
    expect(within(dialog).getByRole("region", { name: "Not offered this term" })).toHaveTextContent(
      "300",
    )
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(getCourse).not.toHaveBeenCalled()
    fireEvent.click(importButton)
    dialog = await screen.findByRole("alertdialog", { name: "Import favorites" })
    fireEvent.click(within(dialog).getByRole("button", { name: /^Import$/ }))
    await waitFor(() => expect(screen.getAllByTestId("registration-draft-row")).toHaveLength(1))
    await waitFor(() =>
      expect(
        within(screen.getByTestId("registration-draft-row")).getByRole("combobox", {
          name: "Course code or title",
        }),
      ).toHaveValue("100 · Course 100"),
    )
    expect(screen.getByText("No open sections have available seats")).toBeVisible()
    expect(vi.mocked(getCourse)).not.toHaveBeenCalledWith("200", expect.anything())
    expect(vi.mocked(getCourse)).not.toHaveBeenCalledWith("300", expect.anything())
    expect(confirmBatchRegistration).not.toHaveBeenCalled()

    fireEvent.click(importButton)
    dialog = await screen.findByRole("alertdialog", { name: "Import favorites" })
    expect(within(dialog).getByRole("region", { name: "Already in your list" })).toHaveTextContent(
      "100",
    )
    expect(within(dialog).getByRole("region", { name: "To import" })).not.toHaveTextContent("100")
    fireEvent.click(within(dialog).getByRole("button", { name: /^Import$/ }))
    await waitFor(() => expect(importButton).toBeEnabled())
    expect(screen.getAllByTestId("registration-draft-row")).toHaveLength(1)
    expect(
      within(screen.getByTestId("registration-draft-row")).getByRole("combobox", {
        name: "Course code or title",
      }),
    ).toHaveValue("100 · Course 100")
    expect(confirmBatchRegistration).not.toHaveBeenCalled()

    vi.mocked(getCourse).mockImplementationOnce(() => new Promise(() => {}))
    fireEvent.click(importButton)
    dialog = await screen.findByRole("alertdialog", { name: "Import favorites" })
    fireEvent.click(within(dialog).getByRole("button", { name: /^Import$/ }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled())
  })

  it("prevents importing when no favorites can be added", async () => {
    favoriteState.courses = [
      { courseCode: "200", nameTh: "วิชา 200", nameEn: "Course 200", offered: true },
      { courseCode: "300", nameTh: null, nameEn: null, offered: false },
    ]
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LocaleProvider language="en">
            <RegistrationPage />
          </LocaleProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const importButton = await screen.findByRole("button", { name: "Import favorites" })
    await waitFor(() => expect(importButton).toBeEnabled())
    fireEvent.click(importButton)
    const dialog = await screen.findByRole("alertdialog", { name: "Import favorites" })
    expect(within(dialog).getByRole("region", { name: "Already in your list" })).toHaveTextContent(
      "200",
    )
    expect(within(dialog).getByRole("region", { name: "Not offered this term" })).toHaveTextContent(
      "300",
    )
    expect(within(dialog).getByRole("button", { name: /^Import$/ })).toBeDisabled()
  })
})
