import { PerspectiveCamera, Vector3 } from "three"
import { describe, expect, it } from "vitest"
import {
  applyMapCamera,
  clampMapView,
  fitMapView,
  interiorBounds,
  MAP_CAMERA_CLEARANCE,
  MAP_CLIP_MARGIN,
  MAP_MAX_TILT,
  MAP_VERTICAL_FOV,
  type MapView,
  mapOrientation,
  mapPointAtViewport,
  panMapView,
  panMapViewScreen,
  rotateMapView,
  zoomMapView,
} from "./campus-map-camera"

const ground = { minX: -1310, maxX: 1190, minY: -1185, maxY: 1154 }
const aspects = [0.25, 0.65, 1, 1.8, 3.5, 6]
const modelHeights = { min: -6, max: 235.14999389648438 }

function intersectDatum(camera: PerspectiveCamera, x: number, y: number, datum: number) {
  const direction = new Vector3(x, y, 0.5).unproject(camera).sub(camera.position).normalize()
  return camera.position
    .clone()
    .addScaledVector(direction, (datum - camera.position.y) / direction.y)
}

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
    "contains real terrain/roof corner rays across the full heading and tilt range at aspect %s",
    (aspect) => {
      const camera = new PerspectiveCamera()
      const bounds = interiorBounds(ground)
      for (const yaw of [0, 30, 90, 165, 230, 315, 359.9]) {
        for (const tilt of [0, 15, 30, MAP_MAX_TILT]) {
          for (const spanY of [90, 600, 100000]) {
            const view = clampMapView(
              { x: yaw % 2 ? 1e6 : -1e6, y: tilt % 2 ? 1e6 : -1e6, spanY, yaw, tilt },
              ground,
              aspect,
              modelHeights,
            )
            applyMapCamera(camera, view, aspect, modelHeights)
            expect(camera.position.y).toBeGreaterThanOrEqual(
              modelHeights.max + MAP_CAMERA_CLEARANCE - 1e-8,
            )
            for (const x of [-1, 1]) {
              for (const y of [-1, 1]) {
                for (const altitude of [modelHeights.min, 0, modelHeights.max]) {
                  const point = intersectDatum(camera, x, y, altitude)
                  expect(point.x).toBeGreaterThanOrEqual(bounds.minX - 1e-7)
                  expect(point.x).toBeLessThanOrEqual(bounds.maxX + 1e-7)
                  expect(-point.z).toBeGreaterThanOrEqual(bounds.minY - 1e-7)
                  expect(-point.z).toBeLessThanOrEqual(bounds.maxY + 1e-7)
                  const projected = point.clone().project(camera)
                  expect(projected.z).toBeGreaterThan(-1)
                  expect(projected.z).toBeLessThan(1)
                }
                const expected = mapPointAtViewport(
                  view,
                  aspect,
                  { x: (x + 1) / 2, y: (1 - y) / 2 },
                  modelHeights,
                )
                const actual = intersectDatum(camera, x, y, modelHeights.min)
                expect(actual.x).toBeCloseTo(expected.x, 7)
                expect(-actual.z).toBeCloseTo(expected.y, 7)
              }
            }
          }
        }
      }
    },
  )

  it("wraps heading continuously over multiple turns and clamps tilt at overhead and 45°", () => {
    const view = { x: 0, y: 0, spanY: 600, yaw: 350, tilt: 30 }
    expect(mapOrientation(rotateMapView(view, 30, 100, ground, 1))).toEqual({ yaw: 20, tilt: 45 })
    expect(mapOrientation(rotateMapView(view, -1080, -100, ground, 1))).toEqual({
      yaw: 350,
      tilt: 0,
    })
    expect(mapOrientation({ yaw: Infinity, tilt: NaN })).toEqual({ yaw: 0, tilt: 0 })
    const camera = new PerspectiveCamera()
    applyMapCamera(camera, view, 1, modelHeights)
    const before = camera.quaternion.clone()
    applyMapCamera(camera, { ...view, yaw: 350 + 360 * 10 }, 1, modelHeights)
    expect(Math.abs(before.dot(camera.quaternion))).toBeCloseTo(1, 14)
  })

  it.each([0, 45, 90, 180, 270, 350])(
    "pans along screen axes and keeps zoom anchored under tilt at heading %s",
    (yaw) => {
      const view = { x: 0, y: 0, spanY: 600, yaw, tilt: 40 }
      const camera = new PerspectiveCamera()
      const pannedRight = panMapViewScreen(view, 0.05, 0, ground, 1.5, modelHeights)
      applyMapCamera(camera, pannedRight, 1.5, modelHeights)
      const oldCenter = new Vector3(view.x, modelHeights.min, -view.y).project(camera)
      expect(oldCenter.x).toBeLessThan(0)
      expect(oldCenter.y).toBeCloseTo(0, 12)
      const pannedDown = panMapViewScreen(view, 0, 0.05, ground, 1.5, modelHeights)
      applyMapCamera(camera, pannedDown, 1.5, modelHeights)
      oldCenter.set(view.x, modelHeights.min, -view.y).project(camera)
      expect(oldCenter.x).toBeCloseTo(0, 12)
      expect(oldCenter.y).toBeGreaterThan(0)
      const anchor = { x: 0.65, y: 0.4 }
      const expected = mapPointAtViewport(view, 1.5, anchor, modelHeights)
      const next = zoomMapView(view, 0.5, ground, 1.5, anchor, modelHeights)
      const actual = mapPointAtViewport(next, 1.5, anchor, modelHeights)
      expect(actual.x).toBeCloseTo(expected.x, 10)
      expect(actual.y).toBeCloseTo(expected.y, 10)
    },
  )

  it.each([0.01, ...aspects, 100])(
    "contains actual perspective corner rays after pan/zoom at aspect %s",
    (aspect) => {
      const camera = new PerspectiveCamera()
      let view = fitMapView([], ground, aspect)
      for (let index = 0; index < 20; index++) {
        view = zoomMapView(view, index % 2 ? 100 : 0.001, ground, aspect, { x: 0, y: 1 })
        view = panMapView(view, index % 3 ? 1e6 : -1e6, index % 5 ? -1e6 : 1e6, ground, aspect)
        applyMapCamera(camera, view, aspect, modelHeights)
        expect(camera.position.y).toBeGreaterThanOrEqual(modelHeights.max + MAP_CAMERA_CLEARANCE)
        for (const x of [-1, 1]) {
          for (const y of [-1, 1]) {
            const lowest = intersectDatum(camera, x, y, modelHeights.min)
            expect(lowest.x).toBeCloseTo(view.x + (x * view.spanY * aspect) / 2, 7)
            expect(-lowest.z).toBeCloseTo(view.y + (y * view.spanY) / 2, 7)
            const actualGround = intersectDatum(camera, x, y, -0.12)
            expect(actualGround.x).toBeGreaterThan(ground.minX)
            expect(actualGround.x).toBeLessThan(ground.maxX)
            expect(-actualGround.z).toBeGreaterThan(ground.minY)
            expect(-actualGround.z).toBeLessThan(ground.maxY)
          }
        }
      }
    },
  )

  it("preserves close zoom with a narrower lens without crossing the roof-safe altitude", () => {
    const camera = new PerspectiveCamera()
    applyMapCamera(camera, { x: 0, y: 0, spanY: 90 }, 1, modelHeights)
    expect(camera.position.y).toBeCloseTo(modelHeights.max + MAP_CAMERA_CLEARANCE)
    expect(camera.fov).toBeGreaterThan(15)
    expect(camera.fov).toBeLessThan(17)
    expect(camera.near).toBeCloseTo(MAP_CAMERA_CLEARANCE - MAP_CLIP_MARGIN)
    applyMapCamera(camera, { x: 0, y: 0, spanY: 600 }, 1, modelHeights)
    expect(camera.fov).toBeCloseTo(MAP_VERTICAL_FOV)
    expect(camera.position.y).toBeGreaterThan(modelHeights.max + MAP_CAMERA_CLEARANCE)
  })

  it("transitions continuously between lens zoom and dolly zoom", () => {
    const camera = new PerspectiveCamera()
    const transition =
      2 *
      Math.tan((MAP_VERTICAL_FOV * Math.PI) / 360) *
      (modelHeights.max + MAP_CAMERA_CLEARANCE - modelHeights.min)
    applyMapCamera(camera, { x: 0, y: 0, spanY: transition - 0.0001 }, 1, modelHeights)
    const fov = camera.fov
    const altitude = camera.position.y
    applyMapCamera(camera, { x: 0, y: 0, spanY: transition + 0.0001 }, 1, modelHeights)
    expect(camera.fov - fov).toBeLessThan(0.001)
    expect(camera.position.y - altitude).toBeLessThan(0.001)
  })

  it.each([90, 240, 600, 2200])(
    "keeps roofs and terrain in the tight clip range, with centimetre precision at span %s",
    (spanY) => {
      const camera = new PerspectiveCamera()
      applyMapCamera(camera, { x: 0, y: 0, spanY }, 1, modelHeights)
      for (const altitude of [modelHeights.min, modelHeights.max]) {
        const point = new Vector3(0, altitude, 0).project(camera)
        expect(point.z).toBeGreaterThan(-1)
        expect(point.z).toBeLessThan(1)
      }
      const road = new Vector3(0, 0.065, 0).project(camera)
      const path = new Vector3(0, 0.075, 0).project(camera)
      const depthSteps = (Math.abs(road.z - path.z) / 2) * 2 ** 24
      expect(depthSteps).toBeGreaterThan(100)
      expect(camera.far - camera.near).toBeCloseTo(
        modelHeights.max - modelHeights.min + 2 * MAP_CLIP_MARGIN,
      )
    },
  )

  it.each([0.65, 1, 2])(
    "fits raised route endpoints and labels in the perspective viewport at aspect %s",
    (aspect) => {
      const camera = new PerspectiveCamera()
      const route = [
        { x: -650, y: -450 },
        { x: 600, y: 580 },
      ]
      const view = fitMapView(route, ground, aspect)
      applyMapCamera(camera, view, aspect, modelHeights)
      for (const point of route) {
        for (const altitude of [1.8, 12]) {
          const projected = new Vector3(point.x, altitude, -point.y).project(camera)
          expect(Math.abs(projected.x)).toBeLessThan(1)
          expect(Math.abs(projected.y)).toBeLessThan(1)
        }
      }
    },
  )

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

  it("enforces exact nadir/north and exposes elevated sides away from the center", () => {
    const camera = new PerspectiveCamera()
    for (const aspect of aspects) {
      camera.rotation.set(0.5, 0.8, 1.2)
      const view = fitMapView([{ x: 0, y: 0 }], ground, aspect)
      applyMapCamera(camera, view, aspect, { min: -8, max: 275 })
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
      expect(roof.x).toBeGreaterThan(east.x)
      expect(camera.position.y).toBeGreaterThanOrEqual(275 + MAP_CAMERA_CLEARANCE)
      expect(camera.position.y - camera.near).toBeGreaterThan(275)
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
