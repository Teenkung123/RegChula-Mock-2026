import { describe, expect, it } from "vitest"
import buildings from "./buildings.json"

describe("public building directory data", () => {
  it("keeps the imported official building records searchable and complete", () => {
    expect(buildings.length).toBeGreaterThan(200)
    expect(buildings).toContainEqual({
      id: "ANAND-1",
      code: "ANAND",
      nameTh: "ตึกอานันทมหิดล",
      nameEn: "ANANDHAMAHIDOL",
    })
    expect(buildings.every((building) => building.id && building.code && building.nameTh)).toBe(
      true,
    )
  })
})
