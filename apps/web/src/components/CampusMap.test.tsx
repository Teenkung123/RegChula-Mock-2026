import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type OrthographicCamera,
  type Scene,
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
    fireEvent.click(await screen.findByRole("button", { name: "Move map" }))
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
    const camera = mocks.render.mock.lastCall?.[1] as OrthographicCamera
    expect(camera.rotation.x).toBeCloseTo(-Math.PI / 2, 14)
    expect(camera.rotation.y).toBeCloseTo(0, 14)
    expect(camera.rotation.z).toBeCloseTo(0, 14)
    expect(camera.position.x + camera.left).toBeGreaterThan(-1250)
    expect(camera.position.x + camera.right).toBeLessThan(1250)
    expect(-camera.position.z + camera.bottom).toBeGreaterThan(-1150)
    expect(-camera.position.z + camera.top).toBeLessThan(1150)
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
    await screen.findByRole("button", { name: "Move map" })
    fireEvent.click(screen.getByRole("button", { name: "Move map" }))
    const viewport = screen.getByRole("application")
    fireEvent.keyDown(viewport, { key: "ArrowLeft" })
    fireEvent.keyDown(viewport, { key: "ArrowUp" })
    fireEvent.keyDown(viewport, { key: "+" })
    fireEvent.click(screen.getByRole("button", { name: "Fit route / reset view" }))
    await waitFor(() => expect(mocks.render).toHaveBeenCalled())
    for (const [, camera] of mocks.render.mock.calls as [Scene, OrthographicCamera][]) {
      expect(camera.isOrthographicCamera).toBe(true)
      expect(camera.rotation.x).toBeCloseTo(-Math.PI / 2, 14)
      expect(camera.rotation.y).toBeCloseTo(0, 14)
      expect(camera.rotation.z).toBeCloseTo(0, 14)
    }
    fireEvent.keyDown(viewport, { key: "Escape" })
    expect(screen.getByRole("button", { name: "Move map" })).toHaveFocus()
    expect(document.querySelector("canvas")?.style.touchAction).toBe("pan-y pinch-zoom")
  })

  it("biases the audited coplanar path, disposes GPU resources, aborts and disconnects on unmount", async () => {
    const asset = model()
    mocks.parse.mockResolvedValue(asset)
    const geometryDispose = vi.spyOn(asset.ground.geometry, "dispose")
    const pathDispose = vi.spyOn(asset.pathMaterial, "dispose")
    const { unmount } = render(<CampusMap route={[]} endpoints={[]} />)
    await screen.findByRole("button", { name: "Move map" })
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
    await screen.findByRole("button", { name: "Move map" })
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
    await screen.findByRole("button", { name: "Move map" })
    rerender(<CampusMap route={[...route, { x: 80, y: 150 }]} endpoints={[]} />)
    expect(mocks.parse).toHaveBeenCalledOnce()
    const canvas = document.querySelector("canvas")
    if (!canvas) throw new Error("Canvas was not mounted")
    fireEvent(canvas, new Event("webglcontextlost", { cancelable: true }))
    expect(mocks.requests[0]?.aborted).toBe(true)
    fireEvent.click(await screen.findByRole("button", { name: "Try loading the map again" }))
    await screen.findByRole("button", { name: "Move map" })
    expect(mocks.parse).toHaveBeenCalledTimes(2)
    expect(document.querySelectorAll("canvas")).toHaveLength(1)
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 100 },
    ])
  })
})
