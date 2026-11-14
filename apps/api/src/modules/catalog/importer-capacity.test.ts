import { describe, expect, it } from "bun:test"
import { importedSectionRow } from "./importer"

describe("imported section capacity", () => {
  it("retains source capacity and overfull baseline without inventing seats or overwriting local enrollment", () => {
    const row = importedSectionRow(1, { sectionNo: "1", closed: false, capacity: 30, baselineEnrolled: 35, note: null, genEdType: null, meetings: [] })
    expect(row.capacity).toBe(30)
    expect(row.baselineEnrolled).toBe(35)
    expect(row).not.toHaveProperty("localActive")
  })
})
