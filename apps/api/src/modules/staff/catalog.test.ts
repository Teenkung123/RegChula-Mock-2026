import { describe, expect, it } from "bun:test"
import { readCatalogUpload } from "./catalog"
import { CatalogUploadBusyError, catalogUploadSummary, processCatalogUpload } from "./catalog-upload"

const catalog = {
  datasets: [{ academicYear: 2569, semester: 2, studyProgram: "S", courses: [
    { courseNo: "1234567", courseNameEn: "Systems", sections: [{ sectionNo: "1", capacity: 30 }] },
  ] }],
}
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

describe("staff catalog uploads", () => {
  it("summarizes a validated file and binds its preview to the exact bytes", () => {
    const first = catalogUploadSummary(bytes(catalog)).summary
    const second = catalogUploadSummary(new TextEncoder().encode(` ${JSON.stringify(catalog)}`)).summary
    expect(first).toMatchObject({ courseCount: 1, sectionCount: 1, terms: [{ academicYear: 2569, semester: 2 }] })
    expect(first.checksum).not.toBe(second.checksum)
  })

  it("rejects empty, malformed and conflicting catalogs", () => {
    expect(() => catalogUploadSummary(bytes({ datasets: [] }))).toThrow()
    expect(() => catalogUploadSummary(new TextEncoder().encode("{"))).toThrow()
    const conflict = { datasets: [...catalog.datasets, { academicYear: 2569, semester: 2, studyProgram: "I", courses: [
      { courseNo: "1234567", courseNameEn: "Different", sections: [{ sectionNo: "1", capacity: 30 }] },
    ] }] }
    expect(() => catalogUploadSummary(bytes(conflict))).toThrow()
  })

  it("enforces the upload limit even without a Content-Length header", async () => {
    const chunk = new Uint8Array(1024 * 1024)
    let count = 0
    const body = new ReadableStream<Uint8Array>({ pull(controller) {
      if (count++ < 65) controller.enqueue(chunk)
      else controller.close()
    } })
    const request = new Request("http://localhost/import", { method: "POST", body, duplex: "half" } as RequestInit)
    await expect(readCatalogUpload(request)).rejects.toThrow("64 MiB")
  })

  it("rejects excess uploads before reading another request", async () => {
    let release: (() => void) | undefined
    const gate = new Promise<Uint8Array>((_resolve, reject) => { release = () => reject(new Error("stopped")) })
    const first = processCatalogUpload(() => gate).catch(() => undefined)
    const second = processCatalogUpload(() => gate).catch(() => undefined)
    let read = false
    await expect(processCatalogUpload(async () => { read = true; return bytes(catalog) })).rejects.toBeInstanceOf(CatalogUploadBusyError)
    expect(read).toBe(false)
    release?.()
    await Promise.all([first, second])
  })
})
