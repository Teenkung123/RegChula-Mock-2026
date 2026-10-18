import { Expand, Hand, Map as MapIcon, Minus, Plus, RotateCcw } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import {
  ACESFilmicToneMapping,
  Box3,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Spherical,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import styles from "./CampusMap.module.css"
import { Button } from "./ui"

export interface CampusMapPoint {
  /** Metres east / north of the campus model's local origin. */
  x: number
  y: number
}

export interface CampusMapLabels {
  map: string
  loading: string
  unavailable: string
  retry: string
  explore: string
  stopExploring: string
  reset: string
  zoomIn: string
  zoomOut: string
  instructions: string
  activeInstructions: string
}

export interface CampusMapProps {
  route: readonly CampusMapPoint[]
  endpoints: readonly (CampusMapPoint & { label: string })[]
  labels?: Partial<CampusMapLabels>
  className?: string
}

const defaultLabels: CampusMapLabels = {
  map: "3D campus route map",
  loading: "Loading the campus model…",
  unavailable: "The 3D map is unavailable. You can still use the route details on this page.",
  retry: "Try loading the map again",
  explore: "Explore map",
  stopExploring: "Done exploring",
  reset: "Fit route / reset view",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  instructions: "Choose Explore map to rotate and pan. Zoom and reset buttons work at any time.",
  activeInstructions:
    "Drag to rotate; use two fingers or right-drag to pan. Arrow keys rotate, +/− zoom, and Escape exits.",
}

type MapInput = Pick<CampusMapProps, "route" | "endpoints">
type MapController = {
  setRoute: (input: MapInput) => void
  setInteractive: (active: boolean) => void
  reset: () => void
  zoom: (factor: number) => void
}

const modelUrl = `${import.meta.env.BASE_URL}campus/chula_detailed_v3_web.glb`
const isFinitePoint = (point: CampusMapPoint) =>
  Number.isFinite(point.x) && Number.isFinite(point.y)
const toWorld = (point: CampusMapPoint, height = 1.8) => new Vector3(point.x, height, -point.y)

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

export function CampusMap({ route, endpoints, labels, className }: CampusMapProps) {
  const text = { ...defaultLabels, ...labels }
  const hintId = useId()
  const viewportRef = useRef<HTMLDivElement>(null)
  const markerLayerRef = useRef<HTMLDivElement>(null)
  const exploreButtonRef = useRef<HTMLButtonElement>(null)
  const controllerRef = useRef<MapController | null>(null)
  const latestInput = useRef<MapInput>({ route, endpoints })
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading")
  const [interactive, setInteractive] = useState(false)

  useEffect(() => {
    latestInput.current = { route, endpoints }
    controllerRef.current?.setRoute(latestInput.current)
  }, [route, endpoints])

  useEffect(() => {
    const viewportNode = viewportRef.current
    const markerLayerNode = markerLayerRef.current
    if (!viewportNode || !markerLayerNode) return
    const viewport: HTMLDivElement = viewportNode
    const markerLayer: HTMLDivElement = markerLayerNode
    // A new attempt always owns a fresh context, controls and model request.
    void attempt
    setStatus("loading")
    setInteractive(false)
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
    const camera = new PerspectiveCamera(38, 1, 0.5, 40000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.screenSpacePanning = false
    controls.minDistance = 65
    controls.maxDistance = 20000
    controls.minPolarAngle = 0.12
    controls.maxPolarAngle = Math.PI / 2.8
    controls.rotateSpeed = 0.65
    controls.maxTargetRadius = 2500
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
    let haloMaterial: MeshBasicMaterial | null = null
    let input = latestInput.current
    let defaultBounds = new Box3(new Vector3(-850, 0, -750), new Vector3(850, 60, 750))
    let markers: { element: HTMLElement; position: Vector3 }[] = []
    const projected = new Vector3()

    function render() {
      frame = 0
      if (disposed || contextLost) return
      try {
        renderer.render(scene, camera)
      } catch {
        contextLost = true
        setStatus("unavailable")
        return
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
      }
    }

    function invalidate() {
      if (!frame && !disposed && !contextLost) frame = requestAnimationFrame(render)
    }

    function refreshTheme() {
      renderer.setClearColor(tokenColor(viewport, "--color-paper"), 1)
      routeMaterial?.color.copy(tokenColor(viewport, "--color-accent"))
      haloMaterial?.color.copy(tokenColor(viewport, "--color-surface"))
      invalidate()
    }

    function fitView() {
      const points = [...input.route, ...input.endpoints]
        .filter(isFinitePoint)
        .map((point) => toWorld(point))
      const bounds = points.length ? new Box3().setFromPoints(points) : defaultBounds
      const center = bounds.getCenter(new Vector3())
      center.y = 0
      const radius = Math.max(110, bounds.getSize(new Vector3()).length() / 2)
      const halfVertical = (camera.fov * Math.PI) / 360
      const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect)
      const distance = Math.min(
        controls.maxDistance,
        (radius / Math.sin(Math.min(halfVertical, halfHorizontal))) * 1.2,
      )
      controls.target.copy(center)
      camera.position
        .copy(center)
        .add(new Vector3(0.5, 1.25, 0.85).normalize().multiplyScalar(distance))
      controls.update()
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
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
      const haloPaint = new MeshBasicMaterial({
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
      routeMaterial = routePaint
      haloMaterial = haloPaint
      const points = next.route.filter(isFinitePoint).map((point) => toWorld(point))
      const segments: { start: Vector3; end: Vector3 }[] = []
      for (let index = 1; index < points.length; index++) {
        const start = points[index - 1]
        const end = points[index]
        if (start && end && start.distanceToSquared(end) > 0.001) segments.push({ start, end })
      }
      const transform = new Object3D()
      const up = new Vector3(0, 1, 0)
      for (const [material, radius, order] of [
        [haloPaint, 4.2, 10],
        [routePaint, 2.5, 11],
      ] as const) {
        if (segments.length) {
          const lines = new InstancedMesh(
            new CylinderGeometry(1, 1, 1, 8),
            material,
            segments.length,
          )
          lines.renderOrder = order
          segments.forEach(({ start, end }, index) => {
            const direction = end.clone().sub(start)
            transform.position.copy(start).add(end).multiplyScalar(0.5)
            transform.quaternion.setFromUnitVectors(up, direction.clone().normalize())
            transform.scale.set(radius, direction.length(), radius)
            transform.updateMatrix()
            lines.setMatrixAt(index, transform.matrix)
          })
          lines.computeBoundingSphere()
          routeGroup.add(lines)
        }
        if (points.length) {
          const joins = new InstancedMesh(new SphereGeometry(radius, 8, 6), material, points.length)
          joins.renderOrder = order
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
      }
      next.endpoints.filter(isFinitePoint).forEach((endpoint, index) => {
        const position = toWorld(endpoint, 4)
        const ring = new Mesh(new CylinderGeometry(9, 9, 1, 24), haloPaint)
        ring.position.copy(position)
        ring.renderOrder = 12
        routeGroup.add(ring)
        const dot = new Mesh(new CylinderGeometry(6.5, 6.5, 1.5, 24), routePaint)
        dot.position.copy(position)
        dot.renderOrder = 13
        routeGroup.add(dot)
        const element = document.createElement("span")
        element.className = styles.marker ?? ""
        const number = document.createElement("span")
        number.className = styles.markerNumber ?? ""
        number.textContent = String(index + 1)
        const label = document.createElement("span")
        label.textContent = endpoint.label
        element.append(number, label)
        markerLayer.append(element)
        markers.push({ element, position: toWorld(endpoint, 12) })
      })
      // Empty overlays have no meshes to release their materials during cleanup.
      if (!routeGroup.children.length) {
        routeMaterial.dispose()
        haloMaterial.dispose()
        routeMaterial = null
        haloMaterial = null
      }
      refreshTheme()
      manualView = false
      fitView()
    }

    function zoom(factor: number) {
      manualView = true
      const offset = camera.position.clone().sub(controls.target)
      offset.setLength(
        Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * factor)),
      )
      camera.position.copy(controls.target).add(offset)
      controls.update()
      invalidate()
    }

    function setMapInteractive(active: boolean) {
      controls.enabled = active
      renderer.domElement.style.pointerEvents = active ? "auto" : "none"
      renderer.domElement.style.touchAction = active ? "none" : "pan-y pinch-zoom"
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!controls.enabled || event.target !== viewport) return
      if (event.key === "Escape") {
        setInteractive(false)
        exploreButtonRef.current?.focus()
        return
      }
      if (event.key === "+" || event.key === "=" || event.key === "-") {
        event.preventDefault()
        zoom(event.key === "-" ? 1.25 : 0.8)
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault()
        manualView = true
        const spherical = new Spherical().setFromVector3(
          camera.position.clone().sub(controls.target),
        )
        spherical.theta += event.key === "ArrowLeft" ? -0.12 : event.key === "ArrowRight" ? 0.12 : 0
        spherical.phi = Math.max(
          controls.minPolarAngle,
          Math.min(
            controls.maxPolarAngle,
            spherical.phi +
              (event.key === "ArrowUp" ? -0.12 : event.key === "ArrowDown" ? 0.12 : 0),
          ),
        )
        camera.position.copy(controls.target).add(new Vector3().setFromSpherical(spherical))
        controls.update()
        invalidate()
      }
    }

    function resize() {
      width = Math.max(viewport.clientWidth, 1)
      height = Math.max(viewport.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      if (!manualView) fitView()
      invalidate()
    }

    function onContextLost(event: Event) {
      event.preventDefault()
      contextLost = true
      request.abort()
      setStatus("unavailable")
      setInteractive(false)
    }

    const onInteraction = () => {
      manualView = true
    }
    controls.addEventListener("change", invalidate)
    controls.addEventListener("start", onInteraction)
    viewport.addEventListener("keydown", onKeyDown)
    renderer.domElement.addEventListener("webglcontextlost", onContextLost)
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(viewport)
    const themeObserver = new MutationObserver(refreshTheme)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class", "data-theme"],
    })
    controllerRef.current = {
      setRoute,
      setInteractive: setMapInteractive,
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
        scene.add(gltf.scene)
        // The supplied asset already uses glTF (east, up, south) axes and metres.
        // Keep the surrounding city visible, but default to the central campus.
        const modelBounds = new Box3().setFromObject(gltf.scene)
        if (!modelBounds.isEmpty()) {
          const size = modelBounds.getSize(new Vector3()).multiplyScalar(0.65)
          const center = modelBounds.getCenter(new Vector3())
          center.y = 0
          defaultBounds = new Box3().setFromCenterAndSize(center, size)
        }
        if (!manualView) fitView()
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
      viewport.removeEventListener("keydown", onKeyDown)
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost)
      controls.removeEventListener("change", invalidate)
      controls.removeEventListener("start", onInteraction)
      controls.dispose()
      disposeObject(scene)
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      markerLayer.replaceChildren()
    }
  }, [attempt])

  useEffect(() => {
    controllerRef.current?.setInteractive(interactive)
    if (interactive) viewportRef.current?.focus({ preventScroll: true })
  }, [interactive])

  return (
    <figure
      className={`${styles.map ?? ""} ${className ?? ""}`.trim()}
      data-interactive={interactive}
    >
      <div className={styles.stage}>
        <div
          aria-label={text.map}
          aria-describedby={hintId}
          aria-busy={status === "loading"}
          className={styles.viewport}
          ref={viewportRef}
          role="application"
          tabIndex={interactive ? 0 : -1}
        >
          <div className={styles.markers} ref={markerLayerRef} aria-hidden="true" />
        </div>
        {status === "ready" ? (
          <div className={styles.toolbar}>
            <Button
              aria-pressed={interactive}
              onPress={() => setInteractive((active) => !active)}
              ref={exploreButtonRef}
              variant={interactive ? "primary" : "outline"}
            >
              <Hand size={16} aria-hidden="true" />
              {interactive ? text.stopExploring : text.explore}
            </Button>
            <div className={styles.viewControls}>
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
        <p id={hintId}>{interactive ? text.activeInstructions : text.instructions}</p>
        {endpoints.length > 0 ? (
          <ol className={styles.endpointList}>
            {endpoints.map((endpoint, index) => (
              <li key={`${endpoint.x}-${endpoint.y}-${endpoint.label}`}>
                <span aria-hidden="true">{index + 1}</span>
                {endpoint.label}
              </li>
            ))}
          </ol>
        ) : null}
      </figcaption>
    </figure>
  )
}
