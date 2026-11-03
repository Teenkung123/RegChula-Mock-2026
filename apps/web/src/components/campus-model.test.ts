// @vitest-environment node
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { describe, expect, it } from "vitest"
import { collectCampusBuildingAnchors, softenCampusRoofs } from "./campus-model"

function box(role: string, metadata: Record<string, unknown>, height = 10) {
  const mesh = new Mesh<BoxGeometry, MeshStandardMaterial | MeshStandardMaterial[]>(
    new BoxGeometry(10, height, 10),
    new MeshStandardMaterial(),
  )
  mesh.position.y = height / 2
  mesh.userData = { role, ...metadata }
  return mesh
}

describe("campus model building metadata", () => {
  it("uses explicit footprint names and actual roof tops in model-local coordinates", () => {
    const scene = new Group()
    scene.position.set(1000, 100, -2000)
    const building = box("building", {
      osm_id: "way/12",
      name_en: "Library",
      name_th: "หอสมุด",
      code: "LIB",
      height_m: 999,
    })
    building.position.set(30, 5, -40)
    const roof = box("campus_roof_detail", { parent_osm_id: "way/12" }, 4)
    roof.position.set(32, 13, -40)
    scene.add(building, roof)
    expect(collectCampusBuildingAnchors(scene)).toEqual([
      { id: "way/12", x: 30, y: 40, height: 15, name: "Library", nameTh: "หอสมุด", code: "LIB" },
    ])
  })

  it("joins explicitly owned parts and their roofs, retaining unowned unnamed footprints", () => {
    const scene = new Group()
    const base = box("building", { osm_id: "way/1", name_en: "Main Hall" })
    const part = box("building_part", { osm_id: "way/2", parent_osm_id: "way/1" }, 20)
    part.position.x = 10
    const roof = box("campus_roof_detail", { parent_osm_id: "way/2" }, 4)
    roof.position.set(10, 22, 0)
    const orphan = box("building_part", { osm_id: "way/3", name_en: "" })
    orphan.name = "Generated_Node_Name__Invented Hall"
    const landmarkPart = box("building_part", {
      osm_id: "way/4",
      landmark_parent_osm_id: "way/9",
      name_en: "Only a part's name",
    })
    const secondLandmarkPart = box(
      "building_part",
      {
        osm_id: "way/5",
        landmark_parent_osm_id: "way/9",
      },
      30,
    )
    scene.add(base, part, roof, orphan, landmarkPart, secondLandmarkPart)
    const anchors = collectCampusBuildingAnchors(scene)
    expect(anchors).toEqual([
      { id: "way/1", x: 5, y: -0, height: 24, name: "Main Hall" },
      { id: "way/3", x: 0, y: -0, height: 10 },
      { id: "way/9", x: 0, y: -0, height: 30 },
    ])
  })

  it("does not invent an identity for context batches or orphan details", () => {
    const scene = new Group()
    scene.add(
      box("batched_context", { source_osm_ids: '["way/12","way/13"]' }),
      box("campus_roof_detail", { parent_osm_id: "way/99" }),
      box("building", { osm_id: "not-an-osm-id", name_en: "Unknown" }),
      box("canopy", { osm_id: "relation/14", name_en: "Canteen" }),
    )
    expect(collectCampusBuildingAnchors(scene)).toEqual([
      { id: "relation/14", x: 0, y: -0, height: 10, name: "Canteen" },
    ])
  })
})

describe("campus roof appearance", () => {
  it("softens only audited historic roof slots and safely isolates shared facade materials", () => {
    const scene = new Group()
    const historic = new MeshStandardMaterial({
      color: new Color(0.43, 0.12, 0.055),
      roughness: 0.8,
    })
    historic.name = "roof_tile_historic"
    const pale = new MeshStandardMaterial({ color: new Color(0.48, 0.25, 0.16) })
    pale.name = "roof_tile"
    const glass = new MeshStandardMaterial()
    glass.name = "roof_glass"
    const sharedArray = [historic, pale, glass]
    const roof = box("campus_roof_detail", {})
    roof.material = sharedArray
    const facade = box("building", { osm_id: "way/1" })
    facade.material = sharedArray
    const gable = box("campus_gable_detail", { parent_osm_id: "way/1" })
    gable.material = historic
    const otherRoof = box("campus_roof_detail", {})
    otherRoof.material = historic
    scene.add(roof, facade, gable, otherRoof)
    const originalColor = historic.color.clone()
    const geometry = roof.geometry
    const vertices = Array.from(geometry.attributes.position?.array ?? [])
    const color = new Color(0.65, 0.45, 0.3)
    expect(softenCampusRoofs(scene, color)).toBe(2)
    expect(roof.material).not.toBe(sharedArray)
    expect(facade.material).toBe(sharedArray)
    expect(gable.material).toBe(historic)
    expect(historic.color).toEqual(originalColor)
    if (!Array.isArray(roof.material)) throw new Error("Roof material slots were not preserved")
    const adjusted = roof.material[0]
    expect(adjusted).toBe(otherRoof.material)
    expect(adjusted).not.toBe(historic)
    expect(adjusted?.color).toEqual(color)
    expect(adjusted?.roughness).toBe(0.8)
    expect(roof.material.slice(1)).toEqual([pale, glass])
    expect(roof.geometry).toBe(geometry)
    expect(Array.from(geometry.attributes.position?.array ?? [])).toEqual(vertices)
    const nextColor = new Color(0.7, 0.5, 0.4)
    expect(softenCampusRoofs(scene, nextColor)).toBe(2)
    expect(otherRoof.material).toBe(adjusted)
    expect(adjusted?.color).toEqual(nextColor)
  })

  it("reuses an exclusively owned roof material instead of leaving it orphaned", () => {
    const scene = new Group()
    const roof = box("campus_roof_detail", {})
    const material = roof.material
    if (Array.isArray(material)) throw new Error("Expected one roof material")
    material.name = "roof_tile_historic"
    scene.add(roof)
    expect(softenCampusRoofs(scene, new Color(0.7, 0.5, 0.4))).toBe(1)
    expect(roof.material).toBe(material)
  })

  it("matches the supplied detailed model's grouped identities and eleven vivid roof meshes", async () => {
    const source = readFileSync(resolve("public/campus/chula_detailed_v3_web.glb"))
    const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
    const { scene } = await new GLTFLoader().parseAsync(buffer, "")
    const anchors = collectCampusBuildingAnchors(scene)
    expect(anchors).toHaveLength(305)
    expect(anchors.filter((anchor) => anchor.name || anchor.nameTh)).toHaveLength(184)
    expect(anchors.find((anchor) => anchor.id === "way/31990343")?.name).toBe(
      "Engineering 3 Building",
    )
    expect(anchors.some((anchor) => anchor.id === "way/37870474")).toBe(true)
    expect(anchors.some((anchor) => anchor.id === "way/444942354")).toBe(false)
    expect(softenCampusRoofs(scene, new Color(0.65, 0.45, 0.3))).toBe(11)
  })
})
