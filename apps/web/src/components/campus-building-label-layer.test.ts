import { PerspectiveCamera } from "three"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createCampusBuildingLabelLayer } from "./campus-building-label-layer"
import { applyNorthUpCamera } from "./campus-map-camera"

const mounted: Array<{
  layer: HTMLUListElement
  labels: ReturnType<typeof createCampusBuildingLabelLayer>
}> = []
function mountLabels() {
  const layer = document.createElement("ul")
  document.body.append(layer)
  const labels = createCampusBuildingLabelLayer(layer)
  mounted.push({ layer, labels })
  return { layer, labels }
}
afterEach(() => {
  for (const { layer, labels } of mounted.splice(0)) {
    labels.dispose()
    layer.remove()
  }
  vi.restoreAllMocks()
})

describe("building name layer", () => {
  it("joins mapped names to unnamed footprints and uses explicit localized source names", () => {
    const { layer, labels } = mountLabels()
    labels.setModelAnchors([
      { id: "way/1", x: -100, y: 0, height: 20, name: "Library", nameTh: "ห้องสมุด" },
      { id: "way/2", x: 100, y: 0, height: 25 },
      { id: "way/3", x: 0, y: 100, height: 10 },
    ])
    labels.setInput(
      [{ id: "way/2", code: "PHOTO", x: 100, y: 0, label: "Photographic Science" }],
      "en",
      ["PHOTO"],
    )
    expect(layer.querySelectorAll("[data-building-id]")).toHaveLength(2)
    expect(layer.textContent).toContain("Library")
    expect(layer.querySelector('[data-building-id="way/2"]')).toHaveAttribute("data-active", "true")
    expect(layer.querySelector('[data-building-id="way/2"]')?.textContent).toBe(
      "PHOTO · Photographic Science",
    )
    labels.setInput([], "th", [])
    expect(layer.textContent).toBe("ห้องสมุด")
    expect(layer.querySelector('[data-building-id="way/3"]')).toBeNull()
  })

  it("reuses text measurements while panning and remeasures after fonts or scale change", () => {
    const { layer, labels } = mountLabels()
    labels.setModelAnchors([
      { id: "way/1", x: -100, y: 0, height: 20, name: "Library" },
      { id: "way/2", x: 100, y: 0, height: 25, name: "Science" },
    ])
    const elements = [...layer.querySelectorAll<HTMLElement>("[data-building-id]")]
    const measurements = elements.map((element) =>
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 80, 24)),
    )
    const camera = new PerspectiveCamera()
    applyNorthUpCamera(camera, { x: 0, y: 0, spanY: 500 }, 1, { min: 0, max: 40 })
    labels.render(camera, 400, 400, [])
    expect(elements.every((element) => !element.hidden)).toBe(true)
    applyNorthUpCamera(camera, { x: 10, y: 0, spanY: 500 }, 1, { min: 0, max: 40 })
    labels.render(camera, 400, 400, [])
    for (const measure of measurements) expect(measure).toHaveBeenCalledOnce()
    labels.invalidateMeasurements()
    labels.render(camera, 400, 400, [])
    for (const measure of measurements) expect(measure).toHaveBeenCalledTimes(2)
    labels.dispose()
    expect(layer.childElementCount).toBe(0)
  })
})
