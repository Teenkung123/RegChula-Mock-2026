import { type OrthographicCamera, Vector3 } from "three"

/** Local terrain coordinates: x east, y north; all distances in metres. */
export interface MapPoint {
  x: number
  y: number
}
export interface MapBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}
export interface MapView extends MapPoint {
  spanY: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const validAspect = (aspect: number) => (Number.isFinite(aspect) && aspect > 0 ? aspect : 1)

/** Keep a real ground margin outside every visible corner, including very wide screens. */
export function interiorBounds(bounds: MapBounds): MapBounds {
  const margin = Math.min(
    24,
    (bounds.maxX - bounds.minX) * 0.02,
    (bounds.maxY - bounds.minY) * 0.02,
  )
  return {
    minX: bounds.minX + margin,
    maxX: bounds.maxX - margin,
    minY: bounds.minY + margin,
    maxY: bounds.maxY - margin,
  }
}

export function clampMapView(view: MapView, ground: MapBounds, aspect: number): MapView {
  const bounds = interiorBounds(ground)
  const ratio = validAspect(aspect)
  const maxSpan = Math.min(bounds.maxY - bounds.minY, (bounds.maxX - bounds.minX) / ratio)
  const spanY = clamp(
    Number.isFinite(view.spanY) ? view.spanY : maxSpan,
    Math.min(90, maxSpan),
    maxSpan,
  )
  const halfX = (spanY * ratio) / 2
  const halfY = spanY / 2
  return {
    x: clamp(Number.isFinite(view.x) ? view.x : 0, bounds.minX + halfX, bounds.maxX - halfX),
    y: clamp(Number.isFinite(view.y) ? view.y : 0, bounds.minY + halfY, bounds.maxY - halfY),
    spanY,
  }
}

export function fitMapView(
  points: readonly MapPoint[],
  ground: MapBounds,
  aspect: number,
): MapView {
  const finite = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  const bounds = finite.length
    ? {
        minX: Math.min(...finite.map((point) => point.x)),
        maxX: Math.max(...finite.map((point) => point.x)),
        minY: Math.min(...finite.map((point) => point.y)),
        maxY: Math.max(...finite.map((point) => point.y)),
      }
    : interiorBounds(ground)
  return clampMapView(
    {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      spanY: Math.max(
        bounds.maxY - bounds.minY + 100,
        (bounds.maxX - bounds.minX + 100) / validAspect(aspect),
        240,
      ),
    },
    ground,
    aspect,
  )
}

export function panMapView(
  view: MapView,
  deltaX: number,
  deltaY: number,
  ground: MapBounds,
  aspect: number,
): MapView {
  return clampMapView({ ...view, x: view.x + deltaX, y: view.y + deltaY }, ground, aspect)
}

/** Anchor coordinates are normalized viewport fractions, measured from its top-left. */
export function zoomMapView(
  view: MapView,
  factor: number,
  ground: MapBounds,
  aspect: number,
  anchor = { x: 0.5, y: 0.5 },
): MapView {
  const next = clampMapView({ ...view, spanY: view.spanY * factor }, ground, aspect)
  return clampMapView(
    {
      ...next,
      x: view.x + (anchor.x - 0.5) * (view.spanY - next.spanY) * validAspect(aspect),
      y: view.y + (0.5 - anchor.y) * (view.spanY - next.spanY),
    },
    ground,
    aspect,
  )
}

/** No lookAt/spherical controller: the quaternion is reset to exact nadir on every update. */
export function applyNorthUpCamera(
  camera: OrthographicCamera,
  view: MapView,
  aspect: number,
  heights = { min: -10, max: 400 },
) {
  const halfY = view.spanY / 2
  const halfX = halfY * validAspect(aspect)
  camera.left = -halfX
  camera.right = halfX
  camera.top = halfY
  camera.bottom = -halfY
  camera.zoom = 1
  camera.near = 1
  camera.far = heights.max - heights.min + 200
  camera.position.set(view.x, heights.max + 100, -view.y)
  camera.up.set(0, 0, -1)
  camera.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
}
