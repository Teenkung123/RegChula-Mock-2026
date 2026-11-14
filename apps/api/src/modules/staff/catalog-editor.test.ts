import { describe, expect, it } from "bun:test"
import type { PoolConnection } from "mysql2/promise"
import { runTransaction } from "../../db/transaction"
import { staffCatalogEditorModule, validateCatalogEditor, writeCatalogEditor, type CatalogEditorInput } from "./catalog-editor"

const input = (): CatalogEditorInput => ({
  nameTh: "แคลคูลัส", nameEn: "Calculus", faculty: "Science", department: "Mathematics", credits: 3,
  sections: [{ id: 2, sectionNo: "1", capacity: 10, closed: false, active: true }],
})

function fakeConnection(options: { failAudit?: boolean; missingSection?: boolean } = {}) {
  const calls: Array<{ sql: string; values: unknown[] | undefined }> = []
  let commits = 0
  let rollbacks = 0
  const connection = {
    async execute(sql: string, values?: unknown[]) {
      calls.push({ sql, values })
      if (sql.startsWith("SELECT revision")) return [[{ revision: 4 }], []]
      if (sql.startsWith("SELECT id, midterm_date")) return [[{
        id: 77, midterm_date: null, midterm_start_minute: null, midterm_end_minute: null,
        final_date: null, final_start_minute: null, final_end_minute: null,
      }], []]
      if (sql.startsWith("SELECT id, section_no")) return [options.missingSection ? [] : [
        { id: 2, section_no: "1", capacity: 10, baseline_enrolled: 5, local_active: 3 },
        { id: 3, section_no: "2", capacity: 15, baseline_enrolled: 2, local_active: 1 },
      ], []]
      if (sql.startsWith("SELECT id FROM section_meetings")) return [[{ id: 21 }], []]
      if (sql.startsWith("SELECT id, class_type")) return [[{ id: 21, class_type: "LECT", day_code: "MO", start_minute: 540, end_minute: 600, building: null, room: null, teachers: [] }], []]
      if (sql.startsWith("INSERT INTO staff_audit_events") && options.failAudit) throw new Error("Audit storage failed")
      if (sql.startsWith("INSERT INTO sections")) return [{ insertId: 4 }, []]
      if (sql.startsWith("INSERT INTO course_offerings")) return [{ insertId: 77 }, []]
      return [[], []]
    },
    async beginTransaction() {},
    async commit() { commits += 1 },
    async rollback() { rollbacks += 1 },
    release() {},
  } as unknown as PoolConnection
  return { connection, calls, get commits() { return commits }, get rollbacks() { return rollbacks } }
}

const mutations = (calls: ReturnType<typeof fakeConnection>["calls"]) => calls.filter(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql))

describe("atomic staff course editor", () => {
  it("rejects duplicate section IDs and section numbers in the full draft", () => {
    const draft = input()
    draft.sections.push({ ...draft.sections[0] as CatalogEditorInput["sections"][number] })
    expect(validateCatalogEditor(draft)).toContain("more than once")
    draft.sections[1] = { sectionNo: "1", capacity: 10 }
    expect(validateCatalogEditor(draft)).toContain("unique")
  })

  it("rejects an invalid final section before changing the course or earlier sections", async () => {
    const { connection, calls } = fakeConnection()
    const draft = input()
    draft.sections.push({ id: 3, sectionNo: "2", capacity: 2 })
    const result = await writeCatalogEditor(connection, "staff-1", 77, draft)
    expect(result).toMatchObject({ ok: false, code: "CAPACITY_BELOW_OCCUPANCY" })
    expect(mutations(calls)).toEqual([])
  })

  it("rejects foreign sections and foreign meeting IDs without any mutation", async () => {
    const first = fakeConnection()
    const foreignSection = input()
    foreignSection.sections[0] = { id: 99, sectionNo: "9", capacity: 10 }
    expect(await writeCatalogEditor(first.connection, "staff-1", 77, foreignSection)).toMatchObject({ ok: false, code: "SECTION_NOT_OWNED" })
    expect(mutations(first.calls)).toEqual([])
    const second = fakeConnection()
    const foreignMeeting = input()
    const section = foreignMeeting.sections[0]
    if (!section) throw new Error("Missing test section")
    section.meetings = [{ id: 99, classType: "LECT", dayCode: null, startMinute: null, endMinute: null, building: null, room: null, teachers: [] }]
    expect(await writeCatalogEditor(second.connection, "staff-1", 77, foreignMeeting)).toMatchObject({ ok: false, code: "INVALID_SECTION_MEETINGS" })
    expect(mutations(second.calls)).toEqual([])
  })

  it("saves metadata and sections together without rewriting seats or deleting omitted sections", async () => {
    const { connection, calls } = fakeConnection()
    const draft = input()
    draft.sections[0] = { id: 2, sectionNo: "1", capacity: 12, note: "Updated" }
    draft.sections.push({ sectionNo: "3", capacity: 30, closed: false, active: true })
    expect(await writeCatalogEditor(connection, "staff-1", 77, draft)).toEqual({ ok: true, data: { id: 77, updated: true } })
    expect(calls[0]?.sql).toContain("catalog_revision")
    const writes = mutations(calls)
    expect(writes.some(({ sql }) => sql.startsWith("UPDATE course_offerings"))).toBe(true)
    expect(writes.some(({ sql }) => sql.startsWith("INSERT INTO sections"))).toBe(true)
    expect(writes.filter(({ sql }) => sql.includes("staff_audit_events"))).toHaveLength(1)
    expect(writes.filter(({ sql }) => sql.includes("catalog_revision"))).toHaveLength(1)
    expect(writes.some(({ sql }) => sql.includes("local_active") || sql.includes("baseline_enrolled") || sql.startsWith("DELETE FROM sections"))).toBe(false)
    expect(writes.filter(({ sql }) => sql.startsWith("UPDATE sections")).some(({ values }) => values?.at(-1) === 3)).toBe(false)
  })

  it("rolls back the complete save when recording its audit fails", async () => {
    const fake = fakeConnection({ failAudit: true })
    const runtime = { getConnection: async () => fake.connection, sleep: async () => {}, random: () => 0 }
    await expect(runTransaction(async (connection) => {
      const result = await writeCatalogEditor(connection, "staff-1", 77, input())
      return { commit: result.ok, value: result }
    }, runtime)).rejects.toThrow("Audit storage failed")
    expect(fake.commits).toBe(0)
    expect(fake.rollbacks).toBe(1)
  })

  it("requires staff authorization on both editor routes", async () => {
    const payload = { ...input(), termId: 1, courseCode: "2301101" }
    for (const [method, route] of [["POST", "/api/v1/staff/catalog/offerings/editor"], ["PUT", "/api/v1/staff/catalog/offerings/77/editor"]] as const) {
      const response = await staffCatalogEditorModule.handle(new Request(`http://localhost${route}`, {
        method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      }))
      expect(response.status).toBe(401)
    }
  })
})
