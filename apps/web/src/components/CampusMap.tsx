import { Label, Switch } from "@heroui/react"
import { Expand, Map as MapIcon, Minus, Plus, RotateCcw } from "lucide-react"
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import {
  ACESFilmicToneMapping,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import styles from "./CampusMap.module.css"
import {
  type CampusMapBuildingLabel,
  createCampusBuildingLabelLayer,
} from "./campus-building-label-layer"
import {
  applyNorthUpCamera,
  clampMapView,
  fitMapView,
  type MapBounds,
  type MapView,
  panMapView,
  zoomMapView,
} from "./campus-map-camera"
import type { MapLabelRect } from "./campus-map-labels"
import { collectCampusBuildingAnchors, softenCampusRoofs } from "./campus-model"
import { Button } from "./ui"

export interface CampusMapPoint {
  /** Metres east / north of the campus model's local origin. */
  x: number
  y: number
}

export interface CampusMapLabels {
  map: string
  north: string
  loading: string
  unavailable: string
  retry: string
  occlusion: string
  origin: string
  destination: string
  buildings: string
  reset: string
  zoomIn: string
  zoomOut: string
  instructions: string
}

export interface CampusMapProps {
  route: readonly CampusMapPoint[]
  endpoints: readonly (CampusMapPoint & { label: string })[]
  buildings?: readonly CampusMapBuildingLabel[]
  language?: string
  labels?: Partial<CampusMapLabels>
  className?: string
}

const defaultLabels: CampusMapLabels = {
  map: "North-up campus route map",
  north: "North",
  loading: "Loading the campus model…",
  unavailable: "The 3D map is unavailable. You can still use the route details on this page.",
  retry: "Try loading the map again",
  occlusion: "Buildings hide the route",
  origin: "Origin",
  destination: "Destination",
  buildings: "Building names",
  reset: "Fit route / reset view",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  instructions:
    "Drag or use arrow keys to move. Pinch, scroll or use +/− to zoom. North stays at the top.",
}

type MapInput = Pick<CampusMapProps, "route" | "endpoints"> & {
  originLabel: string
  destinationLabel: string
  buildings: readonly CampusMapBuildingLabel[]
  language: string
}
type MapController = {
  refresh: () => void
  setRoute: (input: MapInput) => void
  setOcclusion: (active: boolean) => void
  reset: () => void
  zoom: (factor: number) => void
}

const modelUrl = `${import.meta.env.BASE_URL}campus/chula_detailed_v3_web.glb`
const emptyBuildings: readonly CampusMapBuildingLabel[] = []
const isFinitePoint = (point: CampusMapPoint) =>
  Number.isFinite(point.x) && Number.isFinite(point.y)
// The audited roads and paths are at grade y=6. Keep flat overlays just above them,
// below building roofs, so the optional depth test can reveal actual obstructions.
const toWorld = (point: CampusMapPoint, height = 8) => new Vector3(point.x, height, -point.y)

/** The GLB is owned by this view, including its shared geometry / materials. */
function disposeObject(root: Object3D) {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value)
      }
    }
    if (object instanceof InstancedMesh) object.dispose()
  })
  for (const texture of textures) {
    const image: unknown = texture.source.data
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close()
    texture.dispose()
  }
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
  root.clear()
}

/** Resolve tokens through the browser, including color-mix / oklch custom accents. */
function tokenColor(element: HTMLElement, token: string) {
  const probe = document.createElement("span")
  probe.style.color = `var(${token})`
  element.append(probe)
  const cssColor = getComputedStyle(probe).color
  probe.remove()
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return new Color(cssColor)
  context.fillStyle = cssColor
  context.fillRect(0, 0, 1, 1)
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data
  return new Color().setRGB(red / 255, green / 255, blue / 255, SRGBColorSpace)
}

export function CampusMap({
  route,
  endpoints,
  buildings = emptyBuildings,
  language = "en",
  labels,
  className,
}: CampusMapProps) {
  const text = { ...defaultLabels, ...labels }
  const hintId = useId()
  const viewportRef = useRef<HTMLDivElement>(null)
  const markerLayerRef = useRef<HTMLDivElement>(null)
  const buildingLayerRef = useRef<HTMLUListElement>(null)
  const controllerRef = useRef<MapController | null>(null)
  const latestInput = useRef<MapInput>({
    route,
    endpoints,
    originLabel: text.origin,
    destinationLabel: text.destination,
    buildings,
    language,
  })
  const latestOcclusion = useRef(false)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading")
  const [occlusion, setOcclusion] = useState(false)

  useLayoutEffect(() => {
    // Model readiness mounts the controls; label placement needs their committed bounds.
    if (status === "ready") controllerRef.current?.refresh()
  }, [status])

  useEffect(() => {
    latestInput.current = {
      route,
      endpoints,
      originLabel: text.origin,
      destinationLabel: text.destination,
      buildings,
      language,
    }
    controllerRef.current?.setRoute(latestInput.current)
  }, [route, endpoints, buildings, language, text.origin, text.destination])

  useEffect(() => {
    latestOcclusion.current = occlusion
    controllerRef.current?.setOcclusion(occlusion)
  }, [occlusion])

  useEffect(() => {
    const viewportNode = viewportRef.current
    const markerLayerNode = markerLayerRef.current
    const buildingLayerNode = buildingLayerRef.current
    if (!viewportNode || !markerLayerNode || !buildingLayerNode) return
    const viewport: HTMLDivElement = viewportNode
    const markerLayer: HTMLDivElement = markerLayerNode
    // A new attempt always owns a fresh context, controls and model request.
    void attempt
    setStatus("loading")
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" })
    } catch {
      setStatus("unavailable")
      return
    }

    let disposed = false
    let contextLost = false
    let frame = 0
    let manualView = false
    let width = 1
    let height = 1
    const request = new AbortController()
    const scene = new Scene()
    const camera = new PerspectiveCamera()
    const buildingLabels = createCampusBuildingLabelLayer(buildingLayerNode)
    let inputEnabled = false
    let groundBounds: MapBounds = { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 }
    let modelHeights = { min: -10, max: 400 }
    let view: MapView = { x: 0, y: 0, spanY: 1500 }
    let defaultPoints = [
      { x: -700, y: -600 },
      { x: 700, y: 600 },
    ]
    const pointers = new Map<number, { x: number; y: number }>()
    let gesture: { x: number; y: number; distance: number } | null = null
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.setAttribute("aria-hidden", "true")
    renderer.domElement.className = styles.canvas ?? ""
    viewport.prepend(renderer.domElement)
    scene.add(new HemisphereLight(0xffffff, 0xffffff, 2.2))
    const sunlight = new DirectionalLight(0xffffff, 2.5)
    sunlight.position.set(-700, 1200, 500)
    scene.add(sunlight)

    let routeGroup = new Group()
    scene.add(routeGroup)
    let routeMaterial: MeshBasicMaterial | null = null
    let markerBackingMaterial: MeshBasicMaterial | null = null
    let originMaterial: MeshBasicMaterial | null = null
    let arrowMaterial: MeshBasicMaterial | null = null
    let occluded = latestOcclusion.current
    let input = latestInput.current
    let markers: { element: HTMLElement; position: Vector3; width: number; height: number }[] = []
    const projected = new Vector3()

    function render() {
      frame = 0
      if (disposed || contextLost) return
      view = clampMapView(view, groundBounds, width / height)
      applyNorthUpCamera(camera, view, width / height, modelHeights)
      try {
        renderer.render(scene, camera)
      } catch {
        contextLost = true
        setMapInteractive(false)
        setStatus("unavailable")
        return
      }
      const blocked: MapLabelRect[] = []
      const viewportBounds = viewport.getBoundingClientRect()
      for (const control of viewport.parentElement?.querySelectorAll("[data-map-control]") ?? []) {
        const bounds = control.getBoundingClientRect()
        blocked.push({
          left: bounds.left - viewportBounds.left,
          top: bounds.top - viewportBounds.top,
          right: bounds.right - viewportBounds.left,
          bottom: bounds.bottom - viewportBounds.top,
        })
      }
      let previous: { x: number; y: number } | undefined
      for (const point of input.route.filter(isFinitePoint)) {
        projected.copy(toWorld(point)).project(camera)
        const current = {
          x: (projected.x * 0.5 + 0.5) * width,
          y: (-projected.y * 0.5 + 0.5) * height,
        }
        if (previous) {
          blocked.push({
            left: Math.min(previous.x, current.x) - 4,
            top: Math.min(previous.y, current.y) - 4,
            right: Math.max(previous.x, current.x) + 4,
            bottom: Math.max(previous.y, current.y) + 4,
          })
        }
        previous = current
      }
      for (const marker of markers) {
        projected.copy(marker.position).project(camera)
        const x = (projected.x * 0.5 + 0.5) * width
        const y = (-projected.y * 0.5 + 0.5) * height
        const visible =
          projected.z > -1 &&
          projected.z < 1 &&
          x > 16 &&
          x < width - 16 &&
          y > 25 &&
          y < height - 12
        marker.element.hidden = !visible
        marker.element.style.left = `${x}px`
        marker.element.style.top = `${y}px`
        if (visible) {
          marker.width ||= marker.element.offsetWidth || 120
          marker.height ||= marker.element.offsetHeight || 34
          blocked.push(
            {
              left: x - marker.width / 2,
              right: x + marker.width / 2,
              top: y - marker.height - 8,
              bottom: y - 8,
            },
            { left: x - 12, top: y - 12, right: x + 12, bottom: y + 12 },
          )
        }
      }
      buildingLabels.render(camera, width, height, blocked)
    }

    function invalidate() {
      if (!frame && !disposed && !contextLost) frame = requestAnimationFrame(render)
    }

    function refreshOverlayLayout() {
      buildingLabels.invalidateMeasurements()
      for (const marker of markers) {
        marker.width = 0
        marker.height = 0
      }
      invalidate()
    }

    function refreshTheme() {
      renderer.setClearColor(tokenColor(viewport, "--color-paper"), 1)
      routeMaterial?.color.copy(tokenColor(viewport, "--color-map-route"))
      markerBackingMaterial?.color.copy(tokenColor(viewport, "--color-map-marker-outline"))
      originMaterial?.color.copy(tokenColor(viewport, "--color-map-origin"))
      arrowMaterial?.color.copy(tokenColor(viewport, "--color-map-route-ink"))
      refreshOverlayLayout()
    }

    function fitView() {
      const points = [...input.route, ...input.endpoints].filter(isFinitePoint)
      view = fitMapView(points.length ? points : defaultPoints, groundBounds, width / height)
      invalidate()
    }

    function setRoute(next: MapInput) {
      input = next
      scene.remove(routeGroup)
      disposeObject(routeGroup)
      routeGroup = new Group()
      scene.add(routeGroup)
      markerLayer.replaceChildren()
      markers = []
      const routePaint = new MeshBasicMaterial({
        depthTest: occluded,
        depthWrite: false,
        toneMapped: false,
      })
      const markerBacking = new MeshBasicMaterial({
        depthTest: occluded,
        depthWrite: false,
        toneMapped: false,
      })
      routeMaterial = routePaint
      markerBackingMaterial = markerBacking
      const originPaint = routePaint.clone()
      originMaterial = originPaint
      arrowMaterial = routePaint.clone()
      arrowMaterial.side = DoubleSide
      const points = next.route.filter(isFinitePoint).map((point) => toWorld(point))
      const segments: { start: Vector3; end: Vector3 }[] = []
      for (let index = 1; index < points.length; index++) {
        const start = points[index - 1]
        const end = points[index]
        if (start && end && start.distanceToSquared(end) > 0.001) segments.push({ start, end })
      }
      const transform = new Object3D()
      const up = new Vector3(0, 1, 0)
      const halfWidth = 2
      if (segments.length) {
        const lines = new InstancedMesh(new BoxGeometry(1, 1, 1), routePaint, segments.length)
        lines.userData.role = "route_ribbon"
        lines.renderOrder = 11
        segments.forEach(({ start, end }, index) => {
          const direction = end.clone().sub(start)
          transform.position.copy(start).add(end).multiplyScalar(0.5)
          transform.quaternion.setFromAxisAngle(up, Math.atan2(direction.x, direction.z))
          transform.scale.set(halfWidth * 2, 0.7, direction.length())
          transform.updateMatrix()
          lines.setMatrixAt(index, transform.matrix)
        })
        lines.computeBoundingSphere()
        routeGroup.add(lines)
      }
      if (points.length) {
        const joins = new InstancedMesh(
          new CylinderGeometry(halfWidth, halfWidth, 0.7, 16),
          routePaint,
          points.length,
        )
        joins.renderOrder = 11
        points.forEach((point, index) => {
          transform.position.copy(point)
          transform.quaternion.identity()
          transform.scale.setScalar(1)
          transform.updateMatrix()
          joins.setMatrixAt(index, transform.matrix)
        })
        joins.computeBoundingSphere()
        routeGroup.add(joins)
      }
      // Compact chevrons sit within a straight segment's ribbon, clear of its bends.
      const totalLength = segments.reduce(
        (sum, segment) => sum + segment.start.distanceTo(segment.end),
        0,
      )
      const arrowCount = totalLength >= 16 ? Math.max(1, Math.floor(totalLength / 48)) : 0
      const placements: Array<{ position: Vector3; angle: number }> = []
      let segmentIndex = 0
      let covered = 0
      for (let index = 0; index < arrowCount; index++) {
        const distance = ((index + 0.5) * totalLength) / arrowCount
        let segment = segments[segmentIndex]
        while (segment && covered + segment.start.distanceTo(segment.end) < distance) {
          covered += segment.start.distanceTo(segment.end)
          segment = segments[++segmentIndex]
        }
        if (!segment) continue
        const direction = segment.end.clone().sub(segment.start)
        const length = direction.length()
        const clearance = 3.5
        if (length < clearance * 2) continue
        const offset = Math.max(clearance, Math.min(length - clearance, distance - covered))
        const position = segment.start.clone().addScaledVector(direction, offset / length)
        position.y = 8.7
        placements.push({ position, angle: Math.atan2(direction.x, direction.z) })
      }
      if (placements.length) {
        const geometry = new BufferGeometry()
        geometry.setAttribute(
          "position",
          new Float32BufferAttribute(
            [0, 0, 3, -1, 0, -2, 0, 0, -0.75, 0, 0, 3, 0, 0, -0.75, 1, 0, -2],
            3,
          ),
        )
        const arrows = new InstancedMesh(geometry, arrowMaterial, placements.length)
        arrows.userData.role = "route_direction"
        arrows.renderOrder = 12
        placements.forEach(({ position, angle }, index) => {
          transform.position.copy(position)
          transform.quaternion.setFromAxisAngle(up, angle)
          transform.scale.setScalar(1)
          transform.updateMatrix()
          arrows.setMatrixAt(index, transform.matrix)
        })
        arrows.computeBoundingSphere()
        routeGroup.add(arrows)
      } else {
        arrowMaterial.dispose()
        arrowMaterial = null
      }
      next.endpoints.filter(isFinitePoint).forEach((endpoint, index) => {
        const origin = index === 0
        const position = toWorld(endpoint, 9)
        const ring = new Mesh(
          origin ? new CylinderGeometry(7.5, 7.5, 0.8, 24) : new BoxGeometry(15, 0.8, 15),
          markerBacking,
        )
        ring.position.copy(position)
        ring.renderOrder = 12
        routeGroup.add(ring)
        const dot = new Mesh(
          origin ? new CylinderGeometry(6, 6, 1, 24) : new BoxGeometry(12, 1, 12),
          origin ? originPaint : routePaint,
        )
        dot.position.copy(position)
        dot.renderOrder = 13
        routeGroup.add(dot)
        const element = document.createElement("span")
        element.className = styles.marker ?? ""
        element.dataset.endpoint = origin ? "origin" : "destination"
        const number = document.createElement("span")
        number.className = styles.markerNumber ?? ""
        number.textContent = origin ? "A" : "B"
        const label = document.createElement("span")
        label.textContent = `${origin ? next.originLabel : next.destinationLabel}: ${endpoint.label}`
        element.append(number, label)
        markerLayer.append(element)
        // DOM labels remain readable location anchors even when geometry is obstructed.
        markers.push({ element, position: toWorld(endpoint, 12), width: 0, height: 0 })
      })
      if (!next.endpoints.some(isFinitePoint)) {
        markerBacking.dispose()
        markerBackingMaterial = null
        originMaterial.dispose()
        originMaterial = null
      }
      // Empty overlays have no meshes to release their materials during cleanup.
      if (!routeGroup.children.length) {
        routeMaterial.dispose()
        routeMaterial = null
      } else if (!points.length && next.endpoints.filter(isFinitePoint).length === 1) {
        routeMaterial.dispose()
        routeMaterial = null
      }
      buildingLabels.setInput(
        next.buildings,
        next.language,
        next.endpoints.map((point) => point.label),
      )
      refreshTheme()
      manualView = false
      fitView()
    }

    function zoom(factor: number, anchor = { x: 0.5, y: 0.5 }) {
      manualView = true
      view = zoomMapView(view, factor, groundBounds, width / height, anchor)
      invalidate()
    }

    function clearPointers() {
      for (const pointerId of pointers.keys()) {
        if (renderer.domElement.hasPointerCapture(pointerId))
          renderer.domElement.releasePointerCapture(pointerId)
      }
      pointers.clear()
      gesture = null
    }

    function setMapInteractive(active: boolean) {
      inputEnabled = active
      if (!active) clearPointers()
      renderer.domElement.style.pointerEvents = active ? "auto" : "none"
      renderer.domElement.style.touchAction = active ? "none" : "pan-y pinch-zoom"
    }

    function pan(deltaX: number, deltaY: number) {
      manualView = true
      view = panMapView(view, deltaX, deltaY, groundBounds, width / height)
      invalidate()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!inputEnabled || event.target !== viewport) return
      if (event.key === "Escape") {
        clearPointers()
        return
      }
      if (event.key === "+" || event.key === "=" || event.key === "-") {
        event.preventDefault()
        zoom(event.key === "-" ? 1.25 : 0.8)
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault()
        const step = view.spanY * 0.08
        pan(
          event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
          event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0,
        )
      }
    }

    function currentGesture() {
      const values = [...pointers.values()]
      const first = values[0]
      if (!first) return null
      const second = values[1]
      return second
        ? {
            x: (first.x + second.x) / 2,
            y: (first.y + second.y) / 2,
            distance: Math.hypot(second.x - first.x, second.y - first.y),
          }
        : { ...first, distance: 0 }
    }

    function onPointerDown(event: PointerEvent) {
      if (!inputEnabled || (event.button !== 0 && event.button !== 2)) return
      event.preventDefault()
      viewport.focus({ preventScroll: true })
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      renderer.domElement.setPointerCapture(event.pointerId)
      gesture = currentGesture()
    }

    function onPointerMove(event: PointerEvent) {
      if (!inputEnabled || !pointers.has(event.pointerId)) return
      event.preventDefault()
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const next = currentGesture()
      if (gesture && next) {
        const metresPerPixel = view.spanY / height
        pan(-(next.x - gesture.x) * metresPerPixel, (next.y - gesture.y) * metresPerPixel)
        if (gesture.distance > 0 && next.distance > 0) {
          const rect = renderer.domElement.getBoundingClientRect()
          zoom(gesture.distance / next.distance, {
            x: (next.x - rect.left) / width,
            y: (next.y - rect.top) / height,
          })
        }
      }
      gesture = next
    }

    function onPointerEnd(event: PointerEvent) {
      pointers.delete(event.pointerId)
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId)
      gesture = currentGesture()
    }

    function onWheel(event: WheelEvent) {
      if (!inputEnabled) return
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1
      const rect = renderer.domElement.getBoundingClientRect()
      zoom(Math.exp(Math.max(-0.7, Math.min(0.7, event.deltaY * unit * 0.0015))), {
        x: (event.clientX - rect.left) / width,
        y: (event.clientY - rect.top) / height,
      })
    }

    function onContextMenu(event: MouseEvent) {
      if (inputEnabled) event.preventDefault()
    }

    function resize() {
      width = Math.max(viewport.clientWidth, 1)
      height = Math.max(viewport.clientHeight, 1)
      renderer.setSize(width, height, false)
      refreshOverlayLayout()
      if (!manualView) fitView()
      else view = clampMapView(view, groundBounds, width / height)
      invalidate()
    }

    function onContextLost(event: Event) {
      event.preventDefault()
      contextLost = true
      request.abort()
      setStatus("unavailable")
      setMapInteractive(false)
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown)
    renderer.domElement.addEventListener("pointermove", onPointerMove)
    renderer.domElement.addEventListener("pointerup", onPointerEnd)
    renderer.domElement.addEventListener("pointercancel", onPointerEnd)
    renderer.domElement.addEventListener("lostpointercapture", onPointerEnd)
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false })
    renderer.domElement.addEventListener("contextmenu", onContextMenu)
    window.addEventListener("blur", clearPointers)
    viewport.addEventListener("keydown", onKeyDown)
    renderer.domElement.addEventListener("webglcontextlost", onContextLost)
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(viewport)
    const themeObserver = new MutationObserver(refreshTheme)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class", "data-theme"],
    })
    const onFontsLoaded = refreshOverlayLayout
    document.fonts?.addEventListener("loadingdone", onFontsLoaded)
    controllerRef.current = {
      refresh: refreshOverlayLayout,
      setRoute,
      setOcclusion: (active) => {
        occluded = active
        for (const material of [
          routeMaterial,
          markerBackingMaterial,
          originMaterial,
          arrowMaterial,
        ]) {
          if (material) material.depthTest = active
        }
        invalidate()
      },
      reset: () => {
        manualView = false
        fitView()
      },
      zoom,
    }
    setMapInteractive(false)
    resize()
    setRoute(latestInput.current)

    const timeout = window.setTimeout(() => request.abort(), 60000)
    void fetch(modelUrl, { signal: request.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Campus model HTTP ${response.status}`)
        return response.arrayBuffer()
      })
      .then((data) =>
        new GLTFLoader().parseAsync(data, modelUrl.slice(0, modelUrl.lastIndexOf("/") + 1)),
      )
      .then((gltf) => {
        if (disposed || contextLost) {
          disposeObject(gltf.scene)
          return
        }
        softenCampusRoofs(gltf.scene, tokenColor(viewport, "--color-map-roof"))
        buildingLabels.setModelAnchors(collectCampusBuildingAnchors(gltf.scene))
        scene.add(gltf.scene)
        // Use only the ground slab for the boundary: roads and buildings can protrude beyond it.
        const modelBounds = new Box3().setFromObject(gltf.scene)
        const campusBounds = new Box3()
        gltf.scene.traverse((object) => {
          if (!(object instanceof Mesh)) return
          if (object.userData.role === "presentation_ground") {
            const ground = new Box3().setFromObject(object)
            groundBounds = {
              minX: ground.min.x,
              maxX: ground.max.x,
              minY: -ground.max.z,
              maxY: -ground.min.z,
            }
          }
          if (object.userData.role === "campus_boundary")
            campusBounds.union(new Box3().setFromObject(object))
          // Audited GLB: road and path overlap at grade +1 (y=6 m). A two-unit
          // depth bias resolves that actual tie without moving roads or buildings.
          if (object.userData.role === "path") {
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material]) {
              material.polygonOffset = true
              material.polygonOffsetFactor = 0
              material.polygonOffsetUnits = -2
            }
          }
        })
        if (!modelBounds.isEmpty())
          modelHeights = { min: modelBounds.min.y, max: modelBounds.max.y }
        if (!campusBounds.isEmpty())
          defaultPoints = [
            { x: campusBounds.min.x, y: -campusBounds.max.z },
            { x: campusBounds.max.x, y: -campusBounds.min.z },
          ]
        view = clampMapView(view, groundBounds, width / height)
        if (!manualView) fitView()
        setMapInteractive(true)
        setStatus("ready")
        invalidate()
      })
      .catch(() => {
        if (!disposed) setStatus("unavailable")
      })
      .finally(() => window.clearTimeout(timeout))

    return () => {
      disposed = true
      request.abort()
      window.clearTimeout(timeout)
      cancelAnimationFrame(frame)
      controllerRef.current = null
      resizeObserver.disconnect()
      themeObserver.disconnect()
      document.fonts?.removeEventListener("loadingdone", onFontsLoaded)
      viewport.removeEventListener("keydown", onKeyDown)
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost)
      clearPointers()
      renderer.domElement.removeEventListener("pointerdown", onPointerDown)
      renderer.domElement.removeEventListener("pointermove", onPointerMove)
      renderer.domElement.removeEventListener("pointerup", onPointerEnd)
      renderer.domElement.removeEventListener("pointercancel", onPointerEnd)
      renderer.domElement.removeEventListener("lostpointercapture", onPointerEnd)
      renderer.domElement.removeEventListener("wheel", onWheel)
      renderer.domElement.removeEventListener("contextmenu", onContextMenu)
      window.removeEventListener("blur", clearPointers)
      disposeObject(scene)
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      markerLayer.replaceChildren()
      buildingLabels.dispose()
    }
  }, [attempt])

  return (
    <figure
      className={`${styles.map ?? ""} ${className ?? ""}`.trim()}
      data-interactive={status === "ready"}
      data-sidebar-swipe-ignore
    >
      <div className={styles.stage}>
        <div
          aria-label={text.map}
          aria-describedby={hintId}
          aria-busy={status === "loading"}
          className={styles.viewport}
          ref={viewportRef}
          role="application"
          tabIndex={status === "ready" ? 0 : -1}
        >
          <ul
            className={styles.buildingLabels}
            ref={buildingLayerRef}
            aria-label={text.buildings}
          />
          <div className={styles.markers} ref={markerLayerRef} aria-hidden="true" />
        </div>
        {status === "ready" ? (
          <>
            <span className={styles.north} role="img" aria-label={text.north} data-map-control>
              <span aria-hidden="true">
                ↑<br />N
              </span>
            </span>
            <div className={styles.toolbar}>
              <div className={styles.viewControls} data-map-control>
                <Button aria-label={text.zoomIn} onPress={() => controllerRef.current?.zoom(0.8)}>
                  <Plus size={18} aria-hidden="true" />
                </Button>
                <Button aria-label={text.zoomOut} onPress={() => controllerRef.current?.zoom(1.25)}>
                  <Minus size={18} aria-hidden="true" />
                </Button>
                <Button aria-label={text.reset} onPress={() => controllerRef.current?.reset()}>
                  <Expand size={18} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.message} role="status">
            <MapIcon size={30} aria-hidden="true" />
            <p>{status === "loading" ? text.loading : text.unavailable}</p>
            {status === "loading" ? (
              <span className={styles.loadingBar} />
            ) : (
              <Button onPress={() => setAttempt((value) => value + 1)}>
                <RotateCcw size={16} aria-hidden="true" />
                {text.retry}
              </Button>
            )}
          </div>
        )}
      </div>
      <figcaption className={styles.caption}>
        <p id={hintId}>{text.instructions}</p>
        {endpoints.length > 0 ? (
          <ol className={styles.endpointList}>
            {endpoints.map((endpoint, index) => (
              <li
                key={`${endpoint.x}-${endpoint.y}-${endpoint.label}`}
                data-endpoint={index === 0 ? "origin" : "destination"}
              >
                <span aria-hidden="true">{index === 0 ? "A" : "B"}</span>
                <span>
                  {index === 0 ? text.origin : text.destination}: {endpoint.label}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        <Switch
          className={styles.occlusion ?? ""}
          isSelected={occlusion}
          onChange={setOcclusion}
          isDisabled={status !== "ready"}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Label>{text.occlusion}</Label>
          </Switch.Content>
        </Switch>
      </figcaption>
    </figure>
  )
}
