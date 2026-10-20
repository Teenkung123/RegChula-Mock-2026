import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useMobileSidebar } from "./useMobileSidebar"

type Point = { identifier: number; clientX: number; clientY: number }

function dispatchTouch(target: Element, type: string, points: Point[]) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const changedTouches = points
  const touches = type === "touchend" || type === "touchcancel" ? [] : points
  Object.defineProperties(event, {
    touches: { value: touches },
    changedTouches: { value: changedTouches },
  })
  target.dispatchEvent(event)
}

function swipe(target: Element, startX: number, endX: number) {
  const start = { identifier: 1, clientX: startX, clientY: 120 }
  const end = { identifier: 1, clientX: endX, clientY: 120 }
  dispatchTouch(target, "touchstart", [start])
  dispatchTouch(target, "touchmove", [end])
  dispatchTouch(target, "touchend", [end])
}

describe("useMobileSidebar touch ownership", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal("innerWidth", 390)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("does not claim a swipe that starts inside an explicitly ignored map", () => {
    const map = document.createElement("div")
    map.setAttribute("data-sidebar-swipe-ignore", "")
    const canvas = document.createElement("canvas")
    map.append(canvas)
    document.body.append(map)
    const { result, unmount } = renderHook(useMobileSidebar)

    act(() => swipe(canvas, 24, 130))

    expect(result.current.isOpen).toBe(false)
    unmount()
    map.remove()
  })

  it("still opens for a left-edge swipe outside ignored controls", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const { result, unmount } = renderHook(useMobileSidebar)

    act(() => swipe(target, 5, 90))

    expect(result.current.isOpen).toBe(true)
    unmount()
    target.remove()
  })
})
