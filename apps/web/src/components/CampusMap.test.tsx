import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  type Scene,
  Vector3,
} from "three"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CampusMap } from "./CampusMap"

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  loseContext: vi.fn(),
  resizeDisconnect: vi.fn(),
  resize: null as (() => void) | null,
  requests: [] as AbortSignal[],
}))

vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  WebGLRenderer: class {
    domElement = document.createElement("canvas")
    constructor() {
      this.domElement.hasPointerCapture = () => false
      this.domElement.setPointerCapture = () => {}
      this.domElement.releasePointerCapture = () => {}
    }
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    render = mocks.render
    dispose = mocks.dispose
    forceContextLoss = mocks.loseContext
  },
}))
vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    parseAsync = mocks.parse
  },
}))
vi.mock("./ui", () => ({
  Button: ({
    onPress,
    children,
    variant: _variant,
    ...props
  }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
    onPress?: () => void
    variant?: string
    children?: ReactNode
  }) => (
    <button {...props} onClick={onPress}>
      {children}
    </button>
  ),
}))

function model() {
  const scene = new Group()
  const ground = new Mesh(new BoxGeometry(2500, 1, 2300), new MeshBasicMaterial())
  ground.userData.role = "presentation_ground"
  ground.position.y = -1
  scene.add(ground)
  const pathMaterial = new MeshBasicMaterial()
  const path = new Mesh(new BoxGeometry(200, 0.001, 10), pathMaterial)
  path.userData.role = "path"
  path.position.y = 6
  scene.add(path)
  return { scene, ground, pathMaterial }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requests.length = 0
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        mocks.resize = callback
      }
      observe() {}
      disconnect = mocks.resizeDisconnect
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500)
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, options: RequestInit) => {
      mocks.requests.push(options.signal as AbortSignal)
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })
    }),
  )
  mocks.parse.mockImplementation(() => Promise.resolve(model()))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("campus map lifecycle and controls", () => {
  it("supports drag, pinch, wheel and resize without tilting or exposing ground edges", async () => {
    render(<CampusMap route={[{ x: 0, y: 0 }]} endpoints={[]} />)
    await screen.findByRole("button", { name: "Zoom in" })
    expect(screen.queryByRole("button", { name: "Move map" })).toBeNull()
    expect(screen.getByRole("application")).toHaveAttribute("tabindex", "0")
    expect(screen.getByRole("application")).not.toHaveFocus()
    const canvas = document.querySelector("canvas")
    if (!canvas) throw new Error("Canvas was not mounted")
    const pointer = (type: string, id: number, x: number, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        pointerId: { value: id },
        clientX: { value: x },
        clientY: { value: y },
        button: { value: 0 },
      })
      fireEvent(canvas, event)
    }
    pointer("pointerdown", 1, 300, 200)
    pointer("pointermove", 1, 8000, -5000)
    pointer("pointerdown", 2, 400, 250)
    pointer("pointermove", 2, 405, 255)
    pointer("pointerup", 1, 8000, -5000)
    pointer("pointercancel", 2, 405, 255)
    fireEvent.wheel(canvas, { deltaY: 20000, clientX: 400, clientY: 250 })
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(350)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500)
    act(() => {
      mocks.resize?.()
    })
    await waitFor(() => expect(mocks.render).toHaveBeenCalled())
    const camera = mocks.render.mock.lastCall?.[1] as PerspectiveCamera
    expect(camera.rotation.x).toBeCloseTo(-Math.PI / 2, 14)
    expect(camera.rotation.y).toBeCloseTo(0, 14)
    expect(camera.rotation.z).toBeCloseTo(0, 14)
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        const ray = new Vector3(x, y, 0.5).unproject(camera).sub(camera.position).normalize()
        const groundPoint = camera.position
          .clone()
          .addScaledVector(ray, (-0.5 - camera.position.y) / ray.y)
        expect(groundPoint.x).toBeGreaterThan(-1250)
        expect(groundPoint.x).toBeLessThan(1250)
        expect(groundPoint.z).toBeGreaterThan(-1150)
        expect(groundPoint.z).toBeLessThan(1150)
      }
    }
  })

  it("preserves exact north-up after keyboard movement, zoom, reset and Escape", async () => {
    render(
      <CampusMap
        route={[
          { x: 0, y: 0 },
          { x: 100, y: 200 },
        ]}
        endpoints={[]}
      />,
    )
    await screen.findByRole("button", { name: "Zoom in" })
    const viewport = screen.getByRole("application")
    viewport.focus()
    fireEvent.keyDown(viewport, { key: "ArrowLeft" })
    fireEvent.keyDown(viewport, { key: "ArrowUp" })
    fireEvent.keyDown(viewport, { key: "+" })
    fireEvent.click(screen.getByRole("button", { name: "Fit route / reset view" }))
    await waitFor(() => expect(mocks.render).toHaveBeenCalled())
    for (const [, camera] of mocks.render.mock.calls as [Scene, PerspectiveCamera][]) {
      expect(camera.isPerspectiveCamera).toBe(true)
      expect(camera.rotation.x).toBeCloseTo(-Math.PI / 2, 14)
      expect(camera.rotation.y).toBeCloseTo(0, 14)
      expect(camera.rotation.z).toBeCloseTo(0, 14)
    }
    fireEvent.keyDown(viewport, { key: "Escape" })
    expect(viewport).toHaveFocus()
    expect(document.querySelector("canvas")?.style.touchAction).toBe("none")
    expect(viewport).toHaveAttribute("tabindex", "0")
  })

  it("renders directional chevrons and distinct endpoints with optional building occlusion", async () => {
    const endpoints = [
      { x: 0, y: 0, label: "Engineering" },
      { x: 0, y: 150, label: "Library" },
    ]
    const route = endpoints.map(({ x, y }) => ({ x, y }))
    const { rerender } = render(<CampusMap route={route} endpoints={endpoints} />)
    await screen.findByRole("button", { name: "Zoom in" })
    await waitFor(() => expect(mocks.render).toHaveBeenCalled())
    const scene = mocks.render.mock.lastCall?.[0] as Scene
    let direction: InstancedMesh | undefined
    scene.traverse((object) => {
      if (object instanceof InstancedMesh && object.userData.role === "route_direction")
        direction = object
    })
    expect(direction).toBeDefined()
    if (!direction) throw new Error("Route arrows were not created")
    expect(direction.count).toBeGreaterThan(0)
    const matrix = new Matrix4()
    direction.getMatrixAt(0, matrix)
    const tail = new Vector3(0, 0, -4).applyMatrix4(matrix)
    const tip = new Vector3(0, 0, 8).applyMatrix4(matrix)
    expect(tip.z).toBeLessThan(tail.z)
    expect(tip.y).toBeCloseTo(8.7)
    expect((direction.material as MeshBasicMaterial).depthTest).toBe(false)
    expect(screen.getByText("Origin: Engineering", { selector: "li > span" })).toBeInTheDocument()
    expect(screen.getByText("Destination: Library", { selector: "li > span" })).toBeInTheDocument()
    expect(document.querySelector('[data-endpoint="origin"]')?.textContent).toContain("A")
    expect(document.querySelector('[data-endpoint="destination"]')?.textContent).toContain("B")
    const setting = screen.getByRole("switch", { name: "Buildings hide the route" })
    expect(setting).not.toBeChecked()
    fireEvent.click(setting)
    expect(setting).toBeChecked()
    expect((direction.material as MeshBasicMaterial).depthTest).toBe(true)
    rerender(<CampusMap route={[...route, { x: 100, y: 180 }]} endpoints={endpoints} />)
    expect(mocks.parse).toHaveBeenCalledOnce()
    scene.traverse((object) => {
      if (object instanceof InstancedMesh && object.userData.role === "route_direction") {
        expect((object.material as MeshBasicMaterial).depthTest).toBe(true)
      }
    })
  })

  it("keeps every arrow inside a forward-facing route segment, including near short sharp turns", async () => {
    const route = [
      { x: 400, y: 400 },
      { x: 400, y: 422 },
      { x: 404, y: 422 },
      { x: 404, y: 492 },
    ]
    render(<CampusMap route={route} endpoints={[]} />)
    await screen.findByRole("button", { name: "Zoom in" })
    await waitFor(() => expect(mocks.render).toHaveBeenCalled())
    const scene = mocks.render.mock.lastCall?.[0] as Scene
    let arrows: InstancedMesh | undefined
    let ribbon: InstancedMesh | undefined
    scene.traverse((object) => {
      if (!(object instanceof InstancedMesh)) return
      if (object.userData.role === "route_direction") arrows = object
      if (object.userData.role === "route_ribbon") ribbon = object
    })
    if (!arrows || !ribbon) throw new Error("Expected a route ribbon with direction cues")
    expect(arrows.count).toBeGreaterThan(0)
    const matrix = new Matrix4()
    ribbon.getMatrixAt(0, matrix)
    const halfWidth = new Vector3().setFromMatrixScale(matrix).x / 2
    const vertices = arrows.geometry.getAttribute("position")
    for (let index = 0; index < arrows.count; index++) {
      arrows.getMatrixAt(index, matrix)
      const points = Array.from({ length: vertices.count }, (_, vertex) =>
        new Vector3().fromBufferAttribute(vertices, vertex).applyMatrix4(matrix),
      )
      const forward = new Vector3(0, 0, 1).transformDirection(matrix)
      const contained = route.slice(1).some((end, segmentIndex) => {
        const start = route[segmentIndex]
        if (!start) return false
        const direction = new Vector3(end.x - start.x, 0, start.y - end.y)
        const length = direction.length()
        direction.normalize()
        if (forward.dot(direction) < 0.99) return false
        return points.every((point) => {
          const x = point.x - start.x
          const z = point.z + start.y
          const along = x * direction.x + z * direction.z
          const across = Math.abs(x * direction.z - z * direction.x)
          return along >= 0 && along <= length && across <= halfWidth
        })
      })
      expect(contained).toBe(true)
    }
  })

  it("follows tunnel and bridge grades and keeps underground legs visible through the ground", async () => {
    const route = [
      { x: 0, y: 0, elevationM: 0 },
      { x: 50, y: 0, elevationM: 0 },
      { x: 100, y: 0, elevationM: -3 },
      { x: 200, y: 0, elevationM: -3 },
      { x: 250, y: 0, elevationM: 0 },
      { x: 300, y: 0, elevationM: 5 },
      { x: 400, y: 0, elevationM: 5 },
    ]
    const { rerender } = render(<CampusMap route={route} endpoints={[]} />)
    await screen.findByRole("button", { name: "Zoom in" })
    await waitFor(() => expect(mocks.render).toHaveBeenCalled())
    const scene = mocks.render.mock.lastCall?.[0] as Scene
    const segments = route.slice(1).map((end, index) => {
      const start = route[index]
      if (!start) throw new Error("Missing route point")
      return {
        start: new Vector3(start.x, 8 + start.elevationM, -start.y),
        end: new Vector3(end.x, 8 + end.elevationM, -end.y),
      }
    })
    const ribbons: InstancedMesh[] = []
    const arrows: InstancedMesh[] = []
    scene.traverse((object) => {
      if (!(object instanceof InstancedMesh)) return
      if (object.userData.role === "route_ribbon") ribbons.push(object)
      if (object.userData.role === "route_direction") arrows.push(object)
    })
    expect(ribbons).toHaveLength(2)
    expect(arrows).toHaveLength(2)
    expect(ribbons.reduce((count, ribbon) => count + ribbon.count, 0)).toBe(segments.length)
    const matrix = new Matrix4()
    for (const ribbon of ribbons) {
      for (let index = 0; index < ribbon.count; index++) {
        ribbon.getMatrixAt(index, matrix)
        const start = new Vector3(0, 0, -0.5).applyMatrix4(matrix)
        const end = new Vector3(0, 0, 0.5).applyMatrix4(matrix)
        expect(
          segments.some(
            (segment) =>
              start.distanceTo(segment.start) < 0.0001 && end.distanceTo(segment.end) < 0.0001,
          ),
        ).toBe(true)
      }
    }
    const arrowHeights: number[] = []
    for (const group of arrows) {
      const vertices = group.geometry.getAttribute("position")
      for (let index = 0; index < group.count; index++) {
        group.getMatrixAt(index, matrix)
        const center = new Vector3().setFromMatrixPosition(matrix)
        arrowHeights.push(center.y)
        const forward = new Vector3(0, 0, 1).transformDirection(matrix)
        expect(
          segments.some(({ start, end }) => {
            const direction = end.clone().sub(start)
            const length = direction.length()
            direction.normalize()
            if (forward.dot(direction) < 0.999) return false
            const right = new Vector3(0, 1, 0).cross(direction).normalize()
            const normal = direction.clone().cross(right)
            return Array.from({ length: vertices.count }, (_, vertex) =>
              new Vector3().fromBufferAttribute(vertices, vertex).applyMatrix4(matrix).sub(start),
            ).every((point) => {
              const along = point.dot(direction)
              return along >= 0 && along <= length && Math.abs(point.dot(normal) - 0.7) < 0.0001
            })
          }),
        ).toBe(true)
      }
    }
    expect(Math.min(...arrowHeights)).toBeCloseTo(5.7)
    expect(Math.max(...arrowHeights)).toBeCloseTo(13.7)
    fireEvent.click(screen.getByRole("switch", { name: "Buildings hide the route" }))
    for (const mesh of [...ribbons, ...arrows]) {
      expect((mesh.material as MeshBasicMaterial).depthTest).toBe(!mesh.userData.underground)
    }
    rerender(<CampusMap route={[...route]} endpoints={[]} />)
    scene.traverse((object) => {
      if (object instanceof InstancedMesh && object.userData.role?.startsWith("route_"))
        expect((object.material as MeshBasicMaterial).depthTest).toBe(!object.userData.underground)
    })
    expect(mocks.parse).toHaveBeenCalledOnce()
  })

  it.each([328, 356])(
    "fits initial and reset endpoints in a %spx-wide portrait viewport",
    async (width) => {
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width)
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(432)
      const asset = model()
      const tower = new Mesh(new BoxGeometry(25, 235, 25), new MeshBasicMaterial())
      tower.position.set(600, 117.5, 600)
      asset.scene.add(tower)
      mocks.parse.mockResolvedValue(asset)
      const endpoints = [
        { x: 45.96, y: -298.466, label: "MHMK" },
        { x: 22.97, y: -231.92, label: "TAB" },
      ]
      render(
        <CampusMap
          route={[
            { x: 76.142757, y: -297.160292 },
            { x: 11.746052, y: -208.000882 },
          ]}
          endpoints={endpoints}
        />,
      )
      await screen.findByRole("button", { name: "Zoom in" })
      const viewport = screen.getByRole("application")
      const markers = [...viewport.querySelectorAll<HTMLElement>("[data-endpoint]")]
      await waitFor(() => {
        expect(markers).toHaveLength(2)
        for (const marker of markers) {
          expect(marker.hidden).toBe(false)
          expect(Number.parseFloat(marker.style.left)).toBeGreaterThan(48)
          expect(Number.parseFloat(marker.style.left)).toBeLessThan(width - 48)
          expect(Number.parseFloat(marker.style.top)).toBeGreaterThan(48)
          expect(Number.parseFloat(marker.style.top)).toBeLessThan(432 - 24)
        }
      })
      const initialPositions = markers.map((marker) => [marker.style.left, marker.style.top])
      const camera = mocks.render.mock.lastCall?.[1] as PerspectiveCamera
      expect(camera.aspect).toBeCloseTo(width / 432)
      viewport.focus()
      fireEvent.keyDown(viewport, { key: "ArrowLeft" })
      await waitFor(() => {
        expect(markers.map((marker) => [marker.style.left, marker.style.top])).not.toEqual(
          initialPositions,
        )
      })
      fireEvent.click(screen.getByRole("button", { name: "Fit route / reset view" }))
      await waitFor(() => {
        expect(markers.map((marker) => [marker.style.left, marker.style.top])).toEqual(
          initialPositions,
        )
      })
    },
  )

  it("biases the audited coplanar path, disposes GPU resources, aborts and disconnects on unmount", async () => {
    const asset = model()
    mocks.parse.mockResolvedValue(asset)
    const geometryDispose = vi.spyOn(asset.ground.geometry, "dispose")
    const pathDispose = vi.spyOn(asset.pathMaterial, "dispose")
    const { unmount } = render(<CampusMap route={[]} endpoints={[]} />)
    await screen.findByRole("button", { name: "Zoom in" })
    expect(asset.pathMaterial.polygonOffset).toBe(true)
    expect(asset.pathMaterial.polygonOffsetFactor).toBe(0)
    expect(asset.pathMaterial.polygonOffsetUnits).toBe(-2)
    unmount()
    expect(mocks.requests[0]?.aborted).toBe(true)
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(pathDispose).toHaveBeenCalledOnce()
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(mocks.loseContext).toHaveBeenCalledOnce()
    expect(mocks.resizeDisconnect).toHaveBeenCalledOnce()
    expect(document.querySelector("canvas")).toBeNull()
  })

  it("disposes a model whose parse finishes after the view unmounts", async () => {
    const asset = model()
    const geometryDispose = vi.spyOn(asset.ground.geometry, "dispose")
    let resolve: ((value: { scene: Group }) => void) | undefined
    mocks.parse.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const { unmount } = render(<CampusMap route={[]} endpoints={[]} />)
    await waitFor(() => expect(mocks.parse).toHaveBeenCalledOnce())
    unmount()
    await act(async () => {
      resolve?.(asset)
    })
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(document.querySelector("canvas")).toBeNull()
  })

  it("retries model failures with a fresh renderer and context", async () => {
    mocks.parse.mockRejectedValueOnce(new Error("Model unavailable"))
    const { unmount } = render(<CampusMap route={[]} endpoints={[]} />)
    fireEvent.click(await screen.findByRole("button", { name: "Try loading the map again" }))
    await screen.findByRole("button", { name: "Zoom in" })
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(mocks.requests[0]?.aborted).toBe(true)
    expect(document.querySelectorAll("canvas")).toHaveLength(1)
    unmount()
    expect(mocks.dispose).toHaveBeenCalledTimes(2)
  })

  it("handles context loss, retries cleanly and preserves external route data", async () => {
    const route = [
      { x: 0, y: 0 },
      { x: 50, y: 100 },
    ]
    const { rerender } = render(<CampusMap route={route} endpoints={[]} />)
    await screen.findByRole("button", { name: "Zoom in" })
    rerender(<CampusMap route={[...route, { x: 80, y: 150 }]} endpoints={[]} />)
    expect(mocks.parse).toHaveBeenCalledOnce()
    const canvas = document.querySelector("canvas")
    if (!canvas) throw new Error("Canvas was not mounted")
    fireEvent(canvas, new Event("webglcontextlost", { cancelable: true }))
    expect(mocks.requests[0]?.aborted).toBe(true)
    fireEvent.click(await screen.findByRole("button", { name: "Try loading the map again" }))
    await screen.findByRole("button", { name: "Zoom in" })
    expect(mocks.parse).toHaveBeenCalledTimes(2)
    expect(document.querySelectorAll("canvas")).toHaveLength(1)
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 100 },
    ])
  })
})
