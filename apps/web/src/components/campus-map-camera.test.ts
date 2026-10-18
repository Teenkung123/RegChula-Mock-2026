import { OrthographicCamera, Vector3 } from "three"
import { describe, expect, it } from "vitest"
import {
  applyNorthUpCamera,
  clampMapView,
  fitMapView,
  interiorBounds,
  type MapView,
  panMapView,
  zoomMapView,
} from "./campus-map-camera"

const ground = { minX: -1310, maxX: 1190, minY: -1185, maxY: 1154 }
const aspects = [0.25, 0.65, 1, 1.8, 3.5, 6]

function expectInside(view: MapView, aspect: number) {
  const bounds = interiorBounds(ground)
  const halfX = (view.spanY * aspect) / 2
  const halfY = view.spanY / 2
  expect(view.x - halfX).toBeGreaterThanOrEqual(bounds.minX - 1e-8)
  expect(view.x + halfX).toBeLessThanOrEqual(bounds.maxX + 1e-8)
  expect(view.y - halfY).toBeGreaterThanOrEqual(bounds.minY - 1e-8)
  expect(view.y + halfY).toBeLessThanOrEqual(bounds.maxY + 1e-8)
  expect(view.x - halfX).toBeGreaterThan(ground.minX)
  expect(view.x + halfX).toBeLessThan(ground.maxX)
}

describe("campus map camera invariants", () => {
  it.each(aspects)(
    "keeps the whole viewport inside ground after extreme pan/zoom at aspect %s",
    (aspect) => {
      let view = fitMapView([], ground, aspect)
      for (let index = 0; index < 50; index++) {
        view = zoomMapView(view, index % 2 ? 100 : 0.001, ground, aspect, { x: 0, y: 1 })
        view = panMapView(view, index % 3 ? 1e6 : -1e6, index % 5 ? -1e6 : 1e6, ground, aspect)
        expectInside(view, aspect)
      }
    },
  )

  it("reclamps an already panned view through portrait/ultrawide resizes", () => {
    let view = { x: 1100, y: 1100, spanY: 1700 }
    for (const aspect of [...aspects, ...aspects.toReversed()]) {
      view = clampMapView(view, ground, aspect)
      expectInside(view, aspect)
    }
  })

  it.each([0.65, 1, 1.8, 3.5])(
    "fits all route endpoints with padding when feasible at aspect %s",
    (aspect) => {
      const route = [
        { x: -260, y: -100 },
        { x: 280, y: 390 },
      ]
      const view = fitMapView(route, ground, aspect)
      for (const point of route) {
        expect(Math.abs(point.x - view.x)).toBeLessThan((view.spanY * aspect) / 2)
        expect(Math.abs(point.y - view.y)).toBeLessThan(view.spanY / 2)
      }
      expectInside(view, aspect)
      const changed = panMapView(zoomMapView(view, 0.5, ground, aspect), 500, 300, ground, aspect)
      expect(changed).not.toEqual(view)
      expect(fitMapView(route, ground, aspect)).toEqual(view)
    },
  )

  it("prioritizes the ground boundary if an extremely tall viewport cannot fit a wide route", () => {
    const view = fitMapView(
      [
        { x: -1000, y: 0 },
        { x: 1000, y: 0 },
      ],
      ground,
      0.25,
    )
    expectInside(view, 0.25)
  })

  it("keeps zoom anchored at the pointer when no boundary clamp is needed", () => {
    const view = { x: 0, y: 0, spanY: 600 }
    const anchor = { x: 0.7, y: 0.3 }
    const next = zoomMapView(view, 0.5, ground, 1.5, anchor)
    expect(next.x + (anchor.x - 0.5) * next.spanY * 1.5).toBeCloseTo((anchor.x - 0.5) * 600 * 1.5)
    expect(next.y + (0.5 - anchor.y) * next.spanY).toBeCloseTo((0.5 - anchor.y) * 600)
  })

  it("enforces exact nadir/north after every camera update and preserves orthographic scale", () => {
    const camera = new OrthographicCamera()
    for (const aspect of aspects) {
      camera.rotation.set(0.5, 0.8, 1.2)
      const view = fitMapView([{ x: 0, y: 0 }], ground, aspect)
      applyNorthUpCamera(camera, view, aspect, { min: -8, max: 275 })
      const direction = camera.getWorldDirection(new Vector3())
      expect(direction.x).toBeCloseTo(0, 14)
      expect(direction.y).toBeCloseTo(-1, 14)
      expect(direction.z).toBeCloseTo(0, 14)
      const origin = new Vector3(view.x, 0, -view.y).project(camera)
      const north = new Vector3(view.x, 0, -view.y - 50).project(camera)
      const east = new Vector3(view.x + 50, 0, -view.y).project(camera)
      expect(north.y).toBeGreaterThan(origin.y)
      expect(north.x).toBeCloseTo(origin.x)
      expect(east.x).toBeGreaterThan(origin.x)
      expect(east.y).toBeCloseTo(origin.y)
      const roof = new Vector3(view.x + 50, 200, -view.y).project(camera)
      expect(roof.x).toBeCloseTo(east.x)
      // Demonstrated GLB road/path separation is 1 cm; depth precision must be much finer.
      expect((camera.far - camera.near) / 2 ** 24).toBeLessThan(0.0001)
    }
  })

  it("ignores non-finite route points and safely constrains a single-point route", () => {
    const view = fitMapView(
      [
        { x: NaN, y: 0 },
        { x: 100, y: 100 },
      ],
      ground,
      1,
    )
    expect(view).toEqual({ x: 100, y: 100, spanY: 240 })
    expectInside(view, 1)
  })
})
