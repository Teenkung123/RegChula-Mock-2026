import type { ScheduleColorsDto } from "@regchula/api/public-types"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { getScheduleColors, setScheduleColor } from "./api"
import { useCourseColors } from "./course-colors"

vi.mock("./api", () => ({
  getScheduleColors: vi.fn(),
  setScheduleColor: vi.fn(),
  resetScheduleColor: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe("concurrent course color saves", () => {
  it.each(["failure-first", "success-first"])("preserves the other course on %s", async (order) => {
    const initial: ScheduleColorsDto = {
      termId: 1,
      colors: [
        { courseCode: "A", colorId: "rose" },
        { courseCode: "B", colorId: "blue" },
      ],
    }
    const first = deferred<{ courseCode: string; colorId: "green" }>()
    const second = deferred<{ courseCode: string; colorId: "violet" }>()
    const refresh = deferred<ScheduleColorsDto>()
    vi.mocked(getScheduleColors).mockReset().mockReturnValue(refresh.promise)
    vi.mocked(setScheduleColor)
      .mockReset()
      .mockImplementation((courseCode) => (courseCode === "A" ? first.promise : second.promise))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    client.setQueryData(["schedule-colors"], initial)
    const { result, unmount } = renderHook(useCourseColors, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    })
    act(() => {
      result.current.save("A", "green")
      result.current.save("B", "violet")
      result.current.save("A", "amber")
    })
    await waitFor(() => {
      expect(setScheduleColor).toHaveBeenCalledTimes(2)
      expect(result.current.isPending("A")).toBe(true)
      expect(result.current.isPending("B")).toBe(true)
      expect(result.current.colorIdFor("A")).toBe("green")
      expect(result.current.colorIdFor("B")).toBe("violet")
    })
    const failure = new Error("Save failed")
    const fail = () => first.reject(failure)
    const succeed = () => second.resolve({ courseCode: "B", colorId: "violet" })
    await act(async () => {
      ;(order === "failure-first" ? fail : succeed)()
    })
    expect(getScheduleColors).not.toHaveBeenCalled()
    expect(result.current.colorIdFor("B")).toBe("violet")
    if (order === "success-first") expect(result.current.isPending("A")).toBe(true)
    await act(async () => {
      ;(order === "failure-first" ? succeed : fail)()
    })
    await waitFor(() => expect(getScheduleColors).toHaveBeenCalledTimes(1))
    expect(result.current.colorIdFor("A")).toBe("rose")
    expect(result.current.colorIdFor("B")).toBe("violet")
    expect(result.current.error).toBe(failure)
    await act(async () =>
      refresh.resolve({
        ...initial,
        colors: [
          { courseCode: "A", colorId: "rose" },
          { courseCode: "B", colorId: "violet" },
        ],
      }),
    )
    await waitFor(() => expect(result.current.isPending("B")).toBe(false))
    unmount()
    client.clear()
  })
})
