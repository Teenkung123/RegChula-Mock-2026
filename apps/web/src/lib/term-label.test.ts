import { describe, expect, it } from "vitest"
import { termLabel } from "./term-label"

describe("term labels", () => {
  it("uses the imported label for regular terms", () => {
    expect(termLabel({ id: 1, academicYear: 2569, semester: 2, label: "2569/2" }, "th")).toBe(
      "2569/2",
    )
  })

  it("localizes the summer selector label", () => {
    const term = { id: 1, academicYear: 2569, semester: 3, label: "2569/ฤดูร้อน" }
    expect(termLabel(term, "th")).toBe("2569/ฤดูร้อน")
    expect(termLabel(term, "en")).toBe("2569/summer")
    expect(termLabel(term, "zh")).toBe("2569/暑期")
  })
})
