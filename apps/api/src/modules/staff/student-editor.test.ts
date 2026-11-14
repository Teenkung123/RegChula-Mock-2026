import { describe, expect, it } from "bun:test"
import type { PoolConnection } from "mysql2/promise"
import { runTransaction, type TransactionRuntime } from "../../db/transaction"
import {
  type StudentEditorInput,
  staffStudentEditorModule,
  writeStudentEditor,
} from "./student-editor"

const studentId = "6730000021"
const advisorId = "00000000-0000-4000-8000-000000000001"
const input: StudentEditorInput = { advisorId, firstTermId: 2, academicLevel: "graduate" }

function fixture(
  options: {
    studentExists?: boolean
    credentialExists?: boolean
    termExists?: boolean
    advisorActive?: boolean
    advisorRole?: "admin" | "advisor"
    failAudit?: boolean
  } = {},
) {
  let state = {
    active: true,
    profile: { first_term_id: 1, academic_level: "undergraduate" },
    advisorId: "00000000-0000-4000-8000-000000000002" as string | null,
    codes: true,
    grants: true,
    sessions: true,
    audits: [] as { action: string; details: Record<string, unknown> }[],
  }
  let snapshot = structuredClone(state)
  const events: string[] = []
  const writes: string[] = []
  const query = async (sql: string) => {
    events.push(sql)
    if (sql.includes("FROM student_credentials"))
      return [options.credentialExists === false ? [] : [{ active: Number(state.active) }]]
    if (sql.includes("FROM students"))
      return [options.studentExists === false ? [] : [{ student_id: studentId }]]
    if (sql.includes("FROM academic_terms"))
      return [options.termExists === false ? [] : [{ id: 2 }]]
    if (sql.includes("FROM student_registration_profiles")) return [[state.profile]]
    if (sql.includes("FROM student_advisors"))
      return [state.advisorId ? [{ staff_id: state.advisorId }] : []]
    if (sql.includes("FROM staff_users"))
      return [
        options.advisorActive === false || options.advisorRole === "admin"
          ? []
          : [{ id: advisorId }],
      ]
    if (sql.includes("FROM student_sessions")) return [[]]
    throw new Error(`Unexpected query: ${sql}`)
  }
  const execute = async (sql: string, params: unknown[]) => {
    events.push(sql)
    writes.push(sql)
    if (sql.startsWith("DELETE FROM registration_access_codes")) state.codes = false
    else if (sql.startsWith("DELETE FROM registration_access_grants")) state.grants = false
    else if (sql.startsWith("INSERT INTO student_registration_profiles"))
      state.profile = { first_term_id: Number(params[1]), academic_level: String(params[2]) }
    else if (sql.startsWith("INSERT INTO student_advisors")) state.advisorId = String(params[1])
    else if (sql.startsWith("DELETE FROM student_advisors")) state.advisorId = null
    else if (sql.startsWith("UPDATE student_credentials")) state.active = Boolean(params[0])
    else if (sql.startsWith("DELETE FROM student_sessions")) state.sessions = false
    else if (sql.startsWith("INSERT INTO staff_audit_events")) {
      if (options.failAudit) throw new Error("Audit unavailable")
      state.audits.push({ action: String(params[1]), details: JSON.parse(String(params[3])) })
    } else throw new Error(`Unexpected mutation: ${sql}`)
    return [{}]
  }
  const connection = {
    query,
    execute,
    beginTransaction: async () => {
      snapshot = structuredClone(state)
      events.push("begin")
    },
    commit: async () => {
      events.push("commit")
    },
    rollback: async () => {
      state = structuredClone(snapshot)
      events.push("rollback")
    },
    release: () => {
      events.push("release")
    },
  } as unknown as PoolConnection
  const runtime: TransactionRuntime = {
    getConnection: async () => connection,
    sleep: async () => {},
    random: () => 0,
  }
  return {
    state: () => state,
    events,
    writes,
    save: (body: StudentEditorInput = input) =>
      runTransaction((tx) => writeStudentEditor(tx, studentId, body, "admin-id"), runtime),
  }
}

describe("atomic student editor", () => {
  it("rejects absent students, terms, inactive advisors, and non-advisors before any mutation", async () => {
    const cases = [
      { options: { studentExists: false }, code: "STUDENT_NOT_FOUND" },
      { options: { termExists: false }, code: "TERM_NOT_FOUND" },
      { options: { advisorActive: false }, code: "ADVISOR_NOT_FOUND" },
      { options: { advisorRole: "admin" as const }, code: "ADVISOR_NOT_FOUND" },
    ] as const
    for (const { options, code } of cases) {
      const f = fixture(options)
      const before = structuredClone(f.state())
      expect(await f.save({ ...input, active: false })).toEqual({ ok: false, code })
      expect(f.state()).toEqual(before)
      expect(f.writes).toEqual([])
      expect(f.events.at(-2)).toBe("rollback")
    }
  })

  it("commits advisor, education and status together, invalidating access and student sessions", async () => {
    const f = fixture()
    expect(await f.save({ ...input, active: false })).toEqual({
      ok: true,
      data: { studentId, ...input, active: false },
    })
    expect(f.state()).toEqual({
      active: false,
      profile: { first_term_id: 2, academic_level: "graduate" },
      advisorId,
      codes: false,
      grants: false,
      sessions: false,
      audits: [
        { action: "advisor.assigned", details: { advisorId } },
        {
          action: "registration_profile_updated",
          details: { firstTermId: 2, academicLevel: "graduate" },
        },
        { action: "student.updated", details: { active: false, passwordReset: false } },
      ],
    })
    expect(f.events.at(-2)).toBe("commit")
    const credentialLock = f.events.findIndex((sql) => sql.includes("FROM student_credentials"))
    const sessionLock = f.events.findIndex((sql) => sql.includes("FROM student_sessions"))
    expect(credentialLock).toBeLessThan(sessionLock)
  })

  it("rolls back every database change if a later audit insert fails", async () => {
    const f = fixture({ failAudit: true })
    const before = structuredClone(f.state())
    await expect(f.save({ ...input, active: false })).rejects.toThrow("Audit unavailable")
    expect(f.writes.length).toBeGreaterThan(3)
    expect(f.state()).toEqual(before)
    expect(f.events).not.toContain("commit")
    expect(f.events.some((sql) => sql.includes("FROM student_sessions"))).toBe(false)
    expect(f.events.at(-2)).toBe("rollback")
  })

  it("invalidates only grants for an education change and preserves an omitted account status", async () => {
    const f = fixture()
    const result = await f.save({ ...input, advisorId: f.state().advisorId })
    expect(result.ok && result.data.active).toBe(true)
    expect(f.state().codes).toBe(true)
    expect(f.state().grants).toBe(false)
    expect(f.state().sessions).toBe(true)
    expect(f.state().audits.map((audit) => audit.action)).toEqual(["registration_profile_updated"])
  })

  it("clears the advisor and invalidates issued codes and grants", async () => {
    const f = fixture()
    await f.save({ advisorId: null, firstTermId: 1, academicLevel: "undergraduate" })
    expect(f.state().advisorId).toBeNull()
    expect(f.state().codes).toBe(false)
    expect(f.state().grants).toBe(false)
    expect(f.state().audits).toEqual([{ action: "advisor.assigned", details: { advisorId: null } }])
  })

  it("keeps access codes, grants, sessions and audit history intact for an unchanged save", async () => {
    const f = fixture()
    await f.save({
      advisorId: f.state().advisorId,
      firstTermId: 1,
      academicLevel: "undergraduate",
      active: true,
    })
    expect(f.writes).toEqual([])
  })

  it("can update a student without credentials only when account status is omitted", async () => {
    const f = fixture({ credentialExists: false })
    expect(await f.save({ ...input, active: false })).toEqual({
      ok: false,
      code: "STUDENT_NOT_FOUND",
    })
    expect(f.writes).toEqual([])
    const saved = await f.save()
    expect(saved.ok && saved.data.active).toBeNull()
  })
})

describe("student editor route guards", () => {
  const request = (origin?: string) =>
    new Request(`http://localhost/api/v1/staff/students/${studentId}/editor`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
      body: JSON.stringify(input),
    })

  it("requires a signed staff session", async () => {
    const response = await staffStudentEditorModule.handle(request())
    expect(response.status).toBe(401)
    expect((await response.json()).code).toBe("STAFF_AUTH_REQUIRED")
  })

  it("rejects an untrusted origin before touching the database", async () => {
    const response = await staffStudentEditorModule.handle(request("https://untrusted.invalid"))
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe("ORIGIN_NOT_ALLOWED")
  })
})
