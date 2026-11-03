import { type PerspectiveCamera, Vector3 } from "three"

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
  /** Visible north/south span at the scene's lowest datum, not at camera height. */
  spanY: number
}

export const MAP_VERTICAL_FOV = 46
export const MAP_CAMERA_CLEARANCE = 80
export const MAP_CLIP_MARGIN = 20

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

/**
 * Fixed-nadir perspective. Dolly at the nominal lens until the roof-safe altitude
 * floor, then narrow the lens so close zoom remains available without entering a
 * building. The footprint at the lowest datum is exactly view.spanY; every higher
 * ground surface has a smaller footprint, preserving the existing edge clamp.
 */
export function applyNorthUpCamera(
  camera: PerspectiveCamera,
  view: MapView,
  aspect: number,
  heights = { min: -10, max: 400 },
) {
  const nominalHalfFov = (MAP_VERTICAL_FOV * Math.PI) / 360
  const altitude = Math.max(
    heights.min + view.spanY / (2 * Math.tan(nominalHalfFov)),
    heights.max + MAP_CAMERA_CLEARANCE,
  )
  const datumDistance = altitude - heights.min
  camera.fov = (Math.atan(view.spanY / (2 * datumDistance)) * 360) / Math.PI
  camera.aspect = validAspect(aspect)
  camera.zoom = 1
  // Keep the depth buffer concentrated on the model, rather than a huge 0.5–40000m range.
  camera.near = Math.max(1, altitude - heights.max - MAP_CLIP_MARGIN)
  camera.far = datumDistance + MAP_CLIP_MARGIN
  camera.position.set(view.x, altitude, -view.y)
  camera.up.set(0, 0, -1)
  camera.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
}
