import { DEFAULT_APPEARANCE_SETTINGS } from "@regchula/appearance"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getPreferences, updatePreferences } from "../lib/api"
import { AppearanceProvider, useAppearance } from "./AppearanceProvider"

vi.mock("../lib/api", () => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  resetPreferences: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

function setup() {
  vi.mocked(getPreferences).mockResolvedValue({ ...DEFAULT_APPEARANCE_SETTINGS })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderHook(useAppearance, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <AppearanceProvider studentId="appearance-race">{children}</AppearanceProvider>
      </QueryClientProvider>
    ),
  })
}

describe("appearance save reliability", () => {
  it("saves to the API when localStorage is denied", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied")
    })
    vi.mocked(updatePreferences).mockResolvedValue({
      ...DEFAULT_APPEARANCE_SETTINGS,
      theme: "dark",
    })
    const { result } = setup()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.update({ theme: "dark" }))
    await waitFor(() => expect(result.current.isSaving).toBe(false))
    expect(result.current.settings.theme).toBe("dark")
    expect(result.current.error).toBeNull()
    expect(updatePreferences).toHaveBeenCalledWith({ theme: "dark" })
  })

  it("rolls back a failed choice without losing a newer queued choice", async () => {
    let rejectFirst!: (reason: Error) => void
    const first = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject
    })
    vi.mocked(updatePreferences)
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        ...DEFAULT_APPEARANCE_SETTINGS,
        labelStyle: "solid",
      })
    const { result } = setup()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.update({ theme: "dark" }))
    act(() => result.current.update({ labelStyle: "solid" }))
    expect(result.current.settings.labelStyle).toBe("solid")
    await act(async () => {
      rejectFirst(new Error("offline"))
      await first.catch(() => undefined)
    })
    await waitFor(() => expect(result.current.isSaving).toBe(false))
    expect(result.current.settings.theme).toBe(DEFAULT_APPEARANCE_SETTINGS.theme)
    expect(result.current.settings.labelStyle).toBe("solid")
  })
})
