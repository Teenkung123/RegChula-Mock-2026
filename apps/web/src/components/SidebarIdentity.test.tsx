import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "../i18n"
import { SidebarIdentity } from "./SidebarIdentity"

afterEach(() => vi.useRealTimers())

describe("SidebarIdentity", () => {
  it("updates Bangkok Buddhist date on minute boundaries and year rollover, and cleans up", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-04T20:16:45Z"))
    const { unmount } = render(
      <LocaleProvider language="th">
        <SidebarIdentity studentId="student-42" />
      </LocaleProvider>,
    )
    expect(screen.getByText("วันที่ 5 ก.ย.2569 03:16")).toBeVisible()
    act(() => vi.advanceTimersByTime(15_000))
    expect(screen.getByText("วันที่ 5 ก.ย.2569 03:17")).toBeVisible()
    act(() => {
      vi.setSystemTime(new Date("2026-12-31T16:59:59Z"))
      document.dispatchEvent(new Event("visibilitychange"))
    })
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByText("วันที่ 1 ม.ค.2570 00:00")).toBeVisible()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
  it("shows actual ID, updates on account change, and marks absent fields unavailable", () => {
    const { rerender } = render(
      <LocaleProvider language="th">
        <SidebarIdentity studentId="student-42" />
      </LocaleProvider>,
    )
    expect(screen.getByText("student-42")).toBeVisible()
    expect(screen.getAllByText("ไม่มีข้อมูล")).toHaveLength(4)
    rerender(
      <LocaleProvider language="th">
        <SidebarIdentity studentId="student-99" />
      </LocaleProvider>,
    )
    expect(screen.queryByText("student-42")).not.toBeInTheDocument()
    expect(screen.getByText("student-99")).toBeVisible()
    rerender(
      <LocaleProvider language="th">
        <SidebarIdentity studentId=" " />
      </LocaleProvider>,
    )
    expect(screen.getAllByText("ไม่มีข้อมูล")).toHaveLength(5)
  })
  it("localizes English and Chinese while keeping Bangkok time", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-04T20:16:00Z"))
    const { container, rerender } = render(
      <LocaleProvider language="en">
        <SidebarIdentity studentId="42" />
      </LocaleProvider>,
    )
    expect(screen.getAllByText("Unavailable")).toHaveLength(4)
    expect(container.querySelector("time")).toHaveTextContent("2026")
    expect(container.querySelector("time")).toHaveTextContent("03:16")
    rerender(
      <LocaleProvider language="zh">
        <SidebarIdentity studentId="42" />
      </LocaleProvider>,
    )
    expect(screen.getAllByText("暂无数据")).toHaveLength(4)
    expect(container.querySelector("time")).toHaveTextContent("03:16")
  })
})
