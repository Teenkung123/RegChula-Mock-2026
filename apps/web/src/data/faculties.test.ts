import { describe, expect, it } from "vitest"
import faculties from "./faculties.json"

describe("public faculty and department directory data", () => {
  it("keeps the imported official directory searchable and expandable", () => {
    expect(faculties.length).toBe(29)
    expect(faculties).toContainEqual(
      expect.objectContaining({
        code: "21",
        nameTh: "คณะวิศวกรรมศาสตร์",
        nameEn: "FACULTY OF ENGINEERING",
      }),
    )
    const engineering = faculties.find((faculty) => faculty.code === "21")
    expect(
      engineering?.departments.find((department) => department.code === "2100")?.fields,
    ).toContainEqual(
      expect.objectContaining({ code: "2100A", nameEn: "Smart Urban Systems Engineering" }),
    )
    expect(
      engineering?.departments.find((department) => department.code === "2101")?.fields,
    ).toContainEqual(
      expect.objectContaining({ code: "21011", nameEn: "Infrastructure in Civil Engineering" }),
    )
    expect(engineering?.departments).toContainEqual(
      expect.objectContaining({
        code: "2101",
        nameTh: "ภาควิชาวิศวกรรมโยธา",
        nameEn: "DEPARTMENT OF CIVIL ENGINEERING",
      }),
    )
  })
})
