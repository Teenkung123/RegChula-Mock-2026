import { type PerspectiveCamera, Vector3 } from "three"
import styles from "./CampusMap.module.css"
import { layoutCampusBuildingLabels, type MapLabelRect } from "./campus-map-labels"
import type { ModelBuildingAnchor } from "./campus-model"

export interface CampusMapBuildingLabel {
  id: string
  code: string
  label: string
  x: number
  y: number
}

/** Project source-backed names without measuring every label during a pan gesture. */
export function createCampusBuildingLabelLayer(layer: HTMLUListElement) {
  let anchors: readonly ModelBuildingAnchor[] = []
  let buildings: readonly CampusMapBuildingLabel[] = []
  let language = "en"
  let activeCodes = new Set<string>()
  let needsMeasurement = true
  let entries: Array<{
    id: string
    position: Vector3
    element: HTMLLIElement
    width: number
    height: number
    priority: number
  }> = []
  const projected = new Vector3()

  function rebuild() {
    const positions = new Map(anchors.map((anchor) => [anchor.id, anchor]))
    const names = new Map<
      string,
      { x: number; y: number; height: number; label: string; code?: string; priority: number }
    >()
    for (const anchor of anchors) {
      const label = language === "th" ? anchor.nameTh || anchor.name : anchor.name || anchor.nameTh
      if (!label?.trim()) continue
      names.set(anchor.id, { ...anchor, label, priority: 0 })
    }
    for (const building of buildings) {
      if (!building.label.trim() || !Number.isFinite(building.x) || !Number.isFinite(building.y))
        continue
      names.set(building.id, {
        ...building,
        // A mapped footprint without an individual model mesh keeps its known ground
        // position. It does not acquire an invented roof height or classroom location.
        height: positions.get(building.id)?.height ?? 8,
        label:
          building.label === building.code
            ? building.label
            : `${building.code} · ${building.label}`,
        priority: activeCodes.has(building.code) ? 2 : 1,
      })
    }
    const fragment = document.createDocumentFragment()
    entries = [...names].flatMap(([id, building]) => {
      if (![building.x, building.y, building.height].every(Number.isFinite)) return []
      const element = document.createElement("li")
      element.className = styles.buildingLabel ?? ""
      element.dataset.buildingId = id
      element.dataset.active = String(building.priority === 2)
      element.textContent = building.label
      element.title = building.label
      element.hidden = true
      fragment.append(element)
      return [
        {
          id,
          position: new Vector3(building.x, building.height + 2, -building.y),
          element,
          width: 0,
          height: 0,
          priority: building.priority,
        },
      ]
    })
    layer.replaceChildren(fragment)
    needsMeasurement = true
  }

  return {
    setModelAnchors(value: readonly ModelBuildingAnchor[]) {
      anchors = value
      rebuild()
    },
    setInput(
      value: readonly CampusMapBuildingLabel[],
      nextLanguage: string,
      codes: readonly string[],
    ) {
      buildings = value
      language = nextLanguage
      activeCodes = new Set(codes)
      rebuild()
    },
    invalidateMeasurements() {
      needsMeasurement = true
    },
    render(
      camera: PerspectiveCamera,
      width: number,
      height: number,
      blocked: readonly MapLabelRect[],
    ) {
      if (needsMeasurement) {
        layer.style.visibility = "hidden"
        for (const entry of entries) entry.element.hidden = false
        for (const entry of entries) {
          const bounds = entry.element.getBoundingClientRect()
          entry.width = bounds.width || 160
          entry.height = bounds.height || 32
        }
        for (const entry of entries) entry.element.hidden = true
        layer.style.visibility = ""
        needsMeasurement = false
      }
      const candidates = entries.flatMap((entry) => {
        projected.copy(entry.position).project(camera)
        if (projected.z <= -1 || projected.z >= 1) return []
        return [
          {
            id: entry.id,
            x: (projected.x * 0.5 + 0.5) * width,
            y: (-projected.y * 0.5 + 0.5) * height,
            width: entry.width,
            height: entry.height,
            priority: entry.priority,
          },
        ]
      })
      const placed = new Map(
        layoutCampusBuildingLabels(
          candidates,
          { width, height },
          blocked,
          width < 600 ? 10 : 22,
        ).map((placement) => [placement.id, placement]),
      )
      for (const entry of entries) {
        const placement = placed.get(entry.id)
        if (entry.element.hidden !== !placement) entry.element.hidden = !placement
        if (!placement) continue
        entry.element.style.left = `${placement.left}px`
        entry.element.style.top = `${placement.top}px`
      }
    },
    dispose() {
      layer.replaceChildren()
      entries = []
      anchors = []
      buildings = []
    },
  }
}
