import { describe, expect, it } from "bun:test"
import { mockSectionCapacity } from "./mock-availability"

describe("mock section availability", () => {
  it("adds five seats only when a section is full", () => {
    expect(mockSectionCapacity(30, 30)).toBe(35)
    expect(mockSectionCapacity(30, 35)).toBe(40)
    expect(mockSectionCapacity(30, 25, 5)).toBe(35)
  })

  it("preserves sections that already have an available seat", () => {
    expect(mockSectionCapacity(30, 29)).toBe(30)
    expect(mockSectionCapacity(30, 25, 4)).toBe(30)
  })
})
