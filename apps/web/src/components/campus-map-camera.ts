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
  /** Vertical lens span at the target distance, in metres. */
  spanY: number
  /** Clockwise heading from north, in degrees. */
  yaw?: number
  /** Degrees away from overhead. */
  tilt?: number
}
export interface MapHeights {
  min: number
  max: number
}

export const MAP_VERTICAL_FOV = 46
export const MAP_CAMERA_CLEARANCE = 80
export const MAP_CLIP_MARGIN = 20
export const MAP_MAX_TILT = 45

const defaultHeights: MapHeights = { min: -10, max: 400 }
const radians = Math.PI / 180
const nominalTangent = Math.tan((MAP_VERTICAL_FOV * radians) / 2)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const validAspect = (aspect: number) => (Number.isFinite(aspect) && aspect > 0 ? aspect : 1)

export function mapOrientation(view: Pick<MapView, "yaw" | "tilt">) {
  const yaw = Number.isFinite(view.yaw) ? (view.yaw ?? 0) : 0
  return {
    yaw: ((yaw % 360) + 360) % 360,
    tilt: clamp(Number.isFinite(view.tilt) ? (view.tilt ?? 0) : 0, 0, MAP_MAX_TILT),
  }
}

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

function cameraGeometry(view: MapView, heights: MapHeights) {
  const orientation = mapOrientation(view)
  const yaw = orientation.yaw * radians
  const tilt = orientation.tilt * radians
  const cosine = Math.cos(tilt)
  const sine = Math.sin(tilt)
  // Dolly until the highest roof's clearance, then narrow the lens. Even at full
  // tilt the camera stays above every roof instead of orbiting through buildings.
  const distance = Math.max(
    view.spanY / (2 * nominalTangent),
    (heights.max + MAP_CAMERA_CLEARANCE - heights.min) / cosine,
  )
  return {
    cosine,
    sine,
    distance,
    tangent: view.spanY / (2 * distance),
    east: Math.sin(yaw),
    north: Math.cos(yaw),
  }
}

/** Ground ray intersection; anchor fractions are measured from the viewport's top-left. */
export function mapPointAtViewport(
  view: MapView,
  aspect: number,
  anchor: MapPoint,
  heights: MapHeights = defaultHeights,
): MapPoint {
  const { cosine, sine, distance, tangent, east, north } = cameraGeometry(view, heights)
  const x = (anchor.x * 2 - 1) * validAspect(aspect)
  const y = 1 - anchor.y * 2
  const denominator = cosine - y * tangent * sine
  const right = (distance * tangent * x * cosine) / denominator
  const forward = (distance * tangent * y) / denominator
  return { x: view.x + right * north + forward * east, y: view.y - right * east + forward * north }
}

/**
 * Bound the actual perspective footprint at both the lowest terrain and roof
 * planes. All intermediate surfaces are convex combinations of these corners.
 */
function footprint(view: MapView, aspect: number, heights: MapHeights): MapBounds {
  const { cosine, sine, distance, east, north } = cameraGeometry(view, heights)
  const cameraX = -east * sine * distance
  const cameraY = -north * sine * distance
  const roofFraction = 1 - (heights.max - heights.min) / (distance * cosine)
  const result = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  for (const x of [0, 1]) {
    for (const y of [0, 1]) {
      const ground = mapPointAtViewport({ ...view, x: 0, y: 0 }, aspect, { x, y }, heights)
      for (const fraction of [1, roofFraction]) {
        const pointX = cameraX + (ground.x - cameraX) * fraction
        const pointY = cameraY + (ground.y - cameraY) * fraction
        result.minX = Math.min(result.minX, pointX)
        result.maxX = Math.max(result.maxX, pointX)
        result.minY = Math.min(result.minY, pointY)
        result.maxY = Math.max(result.maxY, pointY)
      }
    }
  }
  return result
}

export function clampMapView(
  view: MapView,
  ground: MapBounds,
  aspect: number,
  heights: MapHeights = defaultHeights,
): MapView {
  const bounds = interiorBounds(ground)
  const orientation = mapOrientation(view)
  const oriented = {
    ...view,
    ...(view.yaw !== undefined ? { yaw: orientation.yaw } : {}),
    ...(view.tilt !== undefined ? { tilt: orientation.tilt } : {}),
  }
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  let maxSpan = Math.min(height, width / validAspect(aspect))
  if (orientation.yaw || orientation.tilt) {
    // Rotation and perspective couple the two ground axes. Solve the monotonic
    // footprint size rather than applying an axis-aligned north-up approximation.
    let low = 0
    let high = Math.max(width, height) * 2
    for (let iteration = 0; iteration < 36; iteration++) {
      const middle = (low + high) / 2
      const corners = footprint({ ...oriented, spanY: middle }, aspect, heights)
      if (corners.maxX - corners.minX <= width && corners.maxY - corners.minY <= height)
        low = middle
      else high = middle
    }
    maxSpan = low
  }
  const spanY = clamp(
    Number.isFinite(view.spanY) ? view.spanY : maxSpan,
    Math.min(90, maxSpan),
    maxSpan,
  )
  const corners = footprint({ ...oriented, spanY }, aspect, heights)
  return {
    ...oriented,
    x: clamp(
      Number.isFinite(view.x) ? view.x : 0,
      bounds.minX - corners.minX,
      bounds.maxX - corners.maxX,
    ),
    y: clamp(
      Number.isFinite(view.y) ? view.y : 0,
      bounds.minY - corners.minY,
      bounds.maxY - corners.maxY,
    ),
    spanY,
  }
}

export function fitMapView(
  points: readonly MapPoint[],
  ground: MapBounds,
  aspect: number,
  heights: MapHeights = defaultHeights,
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
    heights,
  )
}

export function panMapView(
  view: MapView,
  deltaX: number,
  deltaY: number,
  ground: MapBounds,
  aspect: number,
  heights: MapHeights = defaultHeights,
): MapView {
  return clampMapView({ ...view, x: view.x + deltaX, y: view.y + deltaY }, ground, aspect, heights)
}

/** Pan in viewport fractions, so dragging and arrows follow the rotated screen axes. */
export function panMapViewScreen(
  view: MapView,
  deltaX: number,
  deltaY: number,
  ground: MapBounds,
  aspect: number,
  heights: MapHeights = defaultHeights,
): MapView {
  const point = mapPointAtViewport(
    view,
    aspect,
    { x: 0.5 + clamp(deltaX, -0.5, 0.5), y: 0.5 + clamp(deltaY, -0.5, 0.5) },
    heights,
  )
  return panMapView(view, point.x - view.x, point.y - view.y, ground, aspect, heights)
}

export function rotateMapView(
  view: MapView,
  deltaYaw: number,
  deltaTilt: number,
  ground: MapBounds,
  aspect: number,
  heights: MapHeights = defaultHeights,
): MapView {
  const { yaw, tilt } = mapOrientation(view)
  return clampMapView(
    { ...view, yaw: yaw + deltaYaw, tilt: tilt + deltaTilt },
    ground,
    aspect,
    heights,
  )
}

/** Keep the same ground location under the pointer throughout lens and dolly zoom. */
export function zoomMapView(
  view: MapView,
  factor: number,
  ground: MapBounds,
  aspect: number,
  anchor = { x: 0.5, y: 0.5 },
  heights: MapHeights = defaultHeights,
): MapView {
  const before = mapPointAtViewport(view, aspect, anchor, heights)
  const next = clampMapView(
    { ...view, spanY: view.spanY * (Number.isFinite(factor) && factor > 0 ? factor : 1) },
    ground,
    aspect,
    heights,
  )
  const after = mapPointAtViewport(next, aspect, anchor, heights)
  return panMapView(next, before.x - after.x, before.y - after.y, ground, aspect, heights)
}

export function applyMapCamera(
  camera: PerspectiveCamera,
  view: MapView,
  aspect: number,
  heights: MapHeights = defaultHeights,
) {
  const { cosine, sine, distance, tangent, east, north } = cameraGeometry(view, heights)
  const altitude = heights.min + distance * cosine
  camera.fov = (Math.atan(tangent) * 2) / radians
  camera.aspect = validAspect(aspect)
  camera.zoom = 1
  // Every visible point lies between these plane/ray intersections. Tight depth
  // bounds preserve road/path depth precision without clipping the tilted scene.
  camera.near = Math.max(1, (altitude - heights.max) / (cosine + tangent * sine) - MAP_CLIP_MARGIN)
  camera.far = (altitude - heights.min) / (cosine - tangent * sine) + MAP_CLIP_MARGIN
  camera.position.set(view.x - east * sine * distance, altitude, -view.y + north * sine * distance)
  camera.up.set(east * cosine, sine, -north * cosine)
  camera.lookAt(new Vector3(view.x, heights.min, -view.y))
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
}
