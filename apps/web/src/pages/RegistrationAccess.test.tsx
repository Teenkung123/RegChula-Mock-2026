import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "../i18n"
import { RegistrationAccess } from "./RegistrationAccess"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(["me"], { studentId: "6712345621" })
  render(
    <QueryClientProvider client={client}>
      <LocaleProvider language="en">
        <RegistrationAccess>{() => <div>Registration editor</div>}</RegistrationAccess>
      </LocaleProvider>
    </QueryClientProvider>,
  )
}

describe("RegistrationAccess", () => {
  it("requires a valid advisor code before showing the registration editor", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ data: { termId: 1, status: "code_required", authorized: false } }),
      )
      .mockResolvedValueOnce(response({ code: "REGISTRATION_CODE_INVALID" }, 409))
      .mockResolvedValueOnce(response({ data: { termId: 1, status: "open", authorized: true } }))
    vi.stubGlobal("fetch", fetcher)
    show()

    const field = await screen.findByRole("textbox", { name: "Registration code" })
    expect(screen.queryByText("Registration editor")).not.toBeInTheDocument()
    fireEvent.change(field, { target: { value: "wrong" } })
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(await screen.findByText("The registration code is incorrect.")).toBeVisible()
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field).toHaveAccessibleDescription("The registration code is incorrect.")
    fireEvent.change(field, { target: { value: "correct" } })
    expect(screen.queryByText("The registration code is incorrect.")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(await screen.findByText("Registration editor")).toBeVisible()
    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/v1/registration-access",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "correct" }) }),
    )
  })

  it("keeps registration closed and explains missing profile information", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response({ data: { termId: 1, status: "profile_required", authorized: false } }),
        ),
    )
    show()
    await waitFor(() => expect(screen.getByText(/Contact the registrar/)).toBeVisible())
    expect(screen.queryByText("Registration editor")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument()
  })

  it.each(["profile_required", "closed"])(
    "can recheck %s access after an administrator updates it",
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(response({ data: { termId: 1, status, authorized: false } }))
        .mockResolvedValueOnce(response({ data: { termId: 1, status: "open", authorized: true } }))
      vi.stubGlobal("fetch", fetcher)
      show()
      fireEvent.click(await screen.findByRole("button", { name: "Check again" }))
      expect(await screen.findByText("Registration editor")).toBeVisible()
      expect(fetcher).toHaveBeenCalledTimes(2)
    },
  )
})
