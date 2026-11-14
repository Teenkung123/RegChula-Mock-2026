import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "../i18n"
import { getRegistrations } from "../lib/api"
import { ManageRegistrationPage } from "./ManageRegistrationPage"

vi.mock("../lib/api", () => ({
  getRegistrations: vi.fn(),
  getMe: vi.fn(async () => ({ studentId: "9912345678" })),
  confirmBatchDrop: vi.fn(),
  createWithdrawalForm: vi.fn(),
  previewBatchDrop: vi.fn(),
  previewWithdrawalForm: vi.fn(),
}))

describe("registration management recovery", () => {
  it.each(["drop", "withdraw"] as const)(
    "does not report an empty %s list when loading fails",
    async (action) => {
      const fetcher = vi
        .mocked(getRegistrations)
        .mockReset()
        .mockRejectedValueOnce(new Error("Unavailable"))
        .mockResolvedValue({ term: null, registrations: [] })
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <LocaleProvider language="en">
              <ManageRegistrationPage action={action} />
            </LocaleProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      )
      expect(
        await screen.findByText("Could not load registrations. Please try again."),
      ).toBeVisible()
      expect(screen.queryByText("No active courses")).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "Try again" }))
      expect(await screen.findByText("No active courses")).toBeVisible()
      expect(fetcher).toHaveBeenCalledTimes(2)
    },
  )
})
