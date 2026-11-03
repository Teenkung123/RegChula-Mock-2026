import { Box3, type Color, type Material, Matrix4, Mesh, type Object3D, Vector3 } from "three"

export interface ModelBuildingAnchor {
  /** Explicit OSM footprint identity, also used by CampusBuilding.footprintId. */
  id: string
  x: number
  y: number
  /** Roof-top elevation in the model's local glTF Y axis, not building storeys. */
  height: number
  name?: string
  nameTh?: string
  code?: string
}

const footprintRoles = new Set(["building", "building_part", "canopy"])
const detailRoles = new Set([
  "campus_roof_detail",
  "campus_gable_detail",
  "campus_floor_articulation",
  "campus_portico_detail",
])
const metadataText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined
const footprintId = (value: unknown) => {
  const id = metadataText(value)
  return id && /^(?:way|relation)\/\d+$/.test(id) ? id : undefined
}

/** Read explicit model metadata; object names and nearby buildings never imply identity. */
export function collectCampusBuildingAnchors(scene: Object3D): ModelBuildingAnchor[] {
  scene.updateWorldMatrix(true, true)
  const toLocal = new Matrix4().copy(scene.matrixWorld).invert()
  const transform = new Matrix4()
  const footprints: { id: string; bounds: Box3; metadata: Record<string, unknown> }[] = []
  const details: { parentId: string; bounds: Box3 }[] = []
  const parents = new Map<string, string>()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const metadata: Record<string, unknown> = object.userData
    const role = metadataText(metadata.role)
    if (!role || (!footprintRoles.has(role) && !detailRoles.has(role))) return
    const id = footprintId(metadata.osm_id)
    const parentId = footprintId(metadata.parent_osm_id)
    if (footprintRoles.has(role) ? !id : !parentId) return
    object.geometry.computeBoundingBox()
    if (!object.geometry.boundingBox) return
    transform.multiplyMatrices(toLocal, object.matrixWorld)
    const bounds = object.geometry.boundingBox.clone().applyMatrix4(transform)
    if (bounds.isEmpty() || ![...bounds.min, ...bounds.max].every(Number.isFinite)) return
    if (id && footprintRoles.has(role)) {
      footprints.push({ id, bounds, metadata })
      if (role === "building_part") {
        const owner = parentId ?? footprintId(metadata.landmark_parent_osm_id)
        if (owner && owner !== id) parents.set(id, owner)
      }
    } else if (parentId) {
      details.push({ parentId, bounds })
    }
  })
  const ownerOf = (id: string) => {
    let owner = id
    const visited = new Set<string>()
    while (parents.has(owner)) {
      if (visited.has(owner)) return id
      visited.add(owner)
      owner = parents.get(owner) ?? owner
    }
    return owner
  }
  const groups = new Map<
    string,
    { footprint: Box3; total: Box3; metadata: Record<string, unknown> }
  >()
  for (const footprint of footprints) {
    const id = ownerOf(footprint.id)
    let group = groups.get(id)
    if (!group) {
      group = { footprint: new Box3(), total: new Box3(), metadata: {} }
      groups.set(id, group)
    }
    group.footprint.union(footprint.bounds)
    group.total.union(footprint.bounds)
    // A part's own name does not establish the name of its enclosing landmark.
    if (id === footprint.id) group.metadata = { ...group.metadata, ...footprint.metadata }
  }
  for (const detail of details) groups.get(ownerOf(detail.parentId))?.total.union(detail.bounds)
  const center = new Vector3()
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, group]) => {
      group.footprint.getCenter(center)
      const name = metadataText(group.metadata.name_en)
      const nameTh = metadataText(group.metadata.name_th)
      const code = metadataText(group.metadata.code)
      return {
        id,
        x: center.x,
        y: -center.z,
        height: group.total.max.y,
        ...(name ? { name } : {}),
        ...(nameTh ? { nameTh } : {}),
        ...(code ? { code } : {}),
      }
    })
}

type ColoredMaterial = Material & { color: Color }
const isColored = (material: Material): material is ColoredMaterial =>
  "color" in material &&
  typeof material.color === "object" &&
  material.color !== null &&
  "isColor" in material.color &&
  material.color.isColor === true

/**
 * The audited vivid orange is roof_tile_historic on campus_roof_detail meshes.
 * Preserve the existing pale roof_tile, glass roofs, gables, and all facade materials.
 * Returns the number of affected mesh material slots (11 in the detailed v3 GLB).
 */
export function softenCampusRoofs(scene: Object3D, color: Color): number {
  const meshes: { mesh: Mesh; materials: Material[]; targets: boolean[] }[] = []
  const protectedMaterials = new Set<Material>()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const targets = materials.map(
      (material) =>
        object.userData.role === "campus_roof_detail" &&
        material.name === "roof_tile_historic" &&
        isColored(material),
    )
    materials.forEach((material, index) => {
      if (!targets[index]) protectedMaterials.add(material)
    })
    if (targets.some(Boolean)) meshes.push({ mesh: object, materials, targets })
  })
  const clones = new Map<Material, Material>()
  let count = 0
  for (const { mesh, materials, targets } of meshes) {
    const updated = materials.map((original, index) => {
      if (!targets[index]) return original
      let material = original
      if (protectedMaterials.has(original)) {
        material = clones.get(original) ?? original.clone()
        clones.set(original, material)
      }
      if (isColored(material)) material.color.copy(color)
      count++
      return material
    })
    // Do not mutate a material array that another non-roof mesh may share.
    mesh.material = Array.isArray(mesh.material) ? updated : (updated[0] ?? mesh.material)
  }
  return count
}
