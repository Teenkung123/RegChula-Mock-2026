// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  layoutCampusBuildingLabels,
  type MapLabelCandidate,
  type MapLabelRect,
} from "./campus-map-labels"

const candidate = (id: string, x: number, y: number, priority = 0): MapLabelCandidate => ({
  id,
  x,
  y,
  width: 80,
  height: 24,
  priority,
})
const rectangle = (
  label: { left: number; top: number },
  source: MapLabelCandidate,
): MapLabelRect => ({
  ...label,
  right: label.left + source.width,
  bottom: label.top + source.height,
})
const separated = (a: MapLabelRect, b: MapLabelRect) =>
  a.right + 4 <= b.left || b.right + 4 <= a.left || a.bottom + 4 <= b.top || b.bottom + 4 <= a.top

describe("campus building label layout", () => {
  it("gives a route-priority label the shared space before ordinary buildings", () => {
    const labels = [candidate("ordinary", 80, 26), candidate("route", 80, 26, 10)]
    const placed = layoutCampusBuildingLabels(labels, { width: 160, height: 52 }, [], 10)
    expect(placed.map((label) => label.id)).toEqual(["route"])
  })

  it("keeps complete labels in the viewport and close to their roof anchors", () => {
    const viewport = { width: 328, height: 432 }
    const labels = [
      candidate("left-clipped", 10, 100),
      candidate("right-clipped", 320, 100),
      candidate("near-top", 100, 8),
      candidate("near-bottom", 210, 425),
      candidate("central", 164, 216),
    ]
    const placed = layoutCampusBuildingLabels(labels, viewport, [], 10)
    expect(placed.map((label) => label.id)).toContain("central")
    expect(placed.map((label) => label.id)).not.toContain("left-clipped")
    expect(placed.map((label) => label.id)).not.toContain("right-clipped")
    for (const label of placed) {
      const source = labels.find((item) => item.id === label.id)
      if (!source) throw new Error("Unknown label")
      const rect = rectangle(label, source)
      expect(rect.left).toBeGreaterThanOrEqual(8)
      expect(rect.top).toBeGreaterThanOrEqual(8)
      expect(rect.right).toBeLessThanOrEqual(viewport.width - 8)
      expect(rect.bottom).toBeLessThanOrEqual(viewport.height - 8)
      expect(Math.abs(label.top + source.height / 2 - source.y)).toBeLessThanOrEqual(32)
    }
  })

  it("leaves breathing room around endpoint markers, controls, and accepted labels", () => {
    const blocked = [
      { left: 55, top: 76, right: 145, bottom: 104 },
      { left: 220, top: 8, right: 292, bottom: 75 },
    ]
    const labels = [
      candidate("endpoint-neighbor", 100, 90, 5),
      candidate("neighbor", 100, 95),
      candidate("controls", 250, 35),
    ]
    const placed = layoutCampusBuildingLabels(labels, { width: 320, height: 200 }, blocked, 10)
    expect(placed.map((label) => label.id)).toContain("endpoint-neighbor")
    expect(placed.map((label) => label.id)).not.toContain("controls")
    const rectangles = placed.map((label) => {
      const source = labels.find((item) => item.id === label.id)
      if (!source) throw new Error("Unknown label")
      return rectangle(label, source)
    })
    rectangles.forEach((rect, index) => {
      for (const other of [...blocked, ...rectangles.slice(index + 1)])
        expect(separated(rect, other)).toBe(true)
    })
  })

  it("orders ties deterministically, deduplicates IDs, and respects the density cap", () => {
    const labels = [
      candidate("z", 400, 300),
      candidate("b", 300, 200),
      candidate("a", 500, 200),
      candidate("route", 100, 100, 9),
      candidate("route", 600, 400),
    ]
    const viewport = { width: 800, height: 600 }
    const placed = layoutCampusBuildingLabels(labels, viewport, [], 3)
    expect(placed.map((label) => label.id)).toEqual(["route", "z", "a"])
    expect(layoutCampusBuildingLabels([...labels].reverse(), viewport, [], 3)).toEqual(placed)
    expect(new Set(placed.map((label) => label.id)).size).toBe(placed.length)
    const many = Array.from({ length: 100 }, (_, index) =>
      candidate(String(index), 60 + (index % 10) * 100, 50 + Math.floor(index / 10) * 100),
    )
    expect(layoutCampusBuildingLabels(many, { width: 1100, height: 1100 }, [], 1000)).toHaveLength(
      64,
    )
  })

  it("ignores invalid inputs without changing caller arrays", () => {
    const valid = candidate("valid", 100, 100)
    const labels = [
      valid,
      { ...valid, id: "nan", x: NaN },
      { ...valid, id: "zero", width: 0 },
      { ...valid, id: "infinite", priority: Infinity },
      { ...valid, id: "", height: 50 },
      { ...valid, id: "off-map", y: -100 },
      { ...valid, id: "oversized", width: 900 },
    ]
    const snapshot = labels.map((label) => ({ ...label }))
    expect(
      layoutCampusBuildingLabels(
        labels,
        { width: 200, height: 200 },
        [{ left: NaN, top: 0, right: 200, bottom: 200 }],
        5,
      ).map((label) => label.id),
    ).toEqual(["valid"])
    expect(labels).toEqual(snapshot)
    for (const limit of [0, -1, NaN, Infinity])
      expect(layoutCampusBuildingLabels([valid], { width: 200, height: 200 }, [], limit)).toEqual(
        [],
      )
    expect(layoutCampusBuildingLabels([valid], { width: NaN, height: 200 }, [], 5)).toEqual([])
    expect(layoutCampusBuildingLabels([valid], { width: 10, height: 200 }, [], 5)).toEqual([])
  })
})
