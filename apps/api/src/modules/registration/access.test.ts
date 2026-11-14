import { describe, expect, it } from "bun:test"
import type { PoolConnection } from "mysql2/promise"
import { grantRegistrationAccess, registrationAccess, registrationCycle } from "./access"
import { encryptRegistrationCode } from "./code-crypto"

function connectionFor(options: {
  open?: boolean
  firstTermId?: number | null
  advisor?: string | null
  level?: "undergraduate" | "graduate" | null
  codeVersion?: number
  grantVersion?: number
  encryptedCode?: string
  writes?: unknown[][]
}): PoolConnection {
  return {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM app_settings")) return [[{ id: 10, academic_year: 2569, semester: 2, label: "2/2569" }]]
      if (sql.includes("FROM academic_terms t")) return [[{
        academic_year: 2569, semester: 2, is_open: options.open !== false ? 1 : 0,
        first_term_id: options.firstTermId === undefined ? 1 : options.firstTermId,
        academic_level: options.level === undefined ? "undergraduate" : options.level,
        staff_id: options.advisor === undefined ? "advisor" : options.advisor,
      }]]
      if (sql.includes("FROM registration_access_codes")) return [options.codeVersion ? [{ version: options.codeVersion, encrypted_code: options.encryptedCode }] : []]
      if (sql.includes("FROM registration_access_grants")) return [options.grantVersion ? [{ code_version: options.grantVersion }] : []]
      if (sql.includes("INSERT INTO registration_access_grants")) { options.writes?.push(params ?? []); return [[]] }
      throw new Error(`Unexpected query: ${sql}`)
    },
  } as unknown as PoolConnection
}

describe("registration access", () => {
  it("shares the summer code with the following first semester", () => {
    expect(registrationCycle(2569, 3)).toEqual(registrationCycle(2570, 1))
    expect(registrationCycle(2569, 2)).not.toEqual(registrationCycle(2569, 3))
  })

  it("requires an open window and a complete profile even for new students", async () => {
    expect((await registrationAccess(connectionFor({ open: false }), "student")).status).toBe("closed")
    expect((await registrationAccess(connectionFor({ firstTermId: null }), "student")).status).toBe("profile_required")
    expect((await registrationAccess(connectionFor({ advisor: null, firstTermId: 10 }), "student")).status).toBe("profile_required")
    expect((await registrationAccess(connectionFor({ firstTermId: 10 }), "student")).authorized).toBe(true)
    expect((await registrationAccess(connectionFor({ level: "graduate" }), "student")).authorized).toBe(true)
  })

  it("rejects absent and rotated codes until the current version is granted", async () => {
    expect((await registrationAccess(connectionFor({}), "student")).status).toBe("code_required")
    expect((await registrationAccess(connectionFor({ codeVersion: 2, grantVersion: 1 }), "student")).status).toBe("code_required")
    expect((await registrationAccess(connectionFor({ codeVersion: 2, grantVersion: 2 }), "student")).authorized).toBe(true)
  })

  it("grants only the matching code for the current term and version", async () => {
    const writes: unknown[][] = []
    const connection = connectionFor({ codeVersion: 3, encryptedCode: encryptRegistrationCode("secret-code"), writes })
    expect(await grantRegistrationAccess(connection, "student", "wrong-code")).toBeNull()
    expect(writes).toHaveLength(0)
    expect((await grantRegistrationAccess(connection, "student", "secret-code"))?.authorized).toBe(true)
    expect(writes).toEqual([["student", 10, 2569, "second", 3]])
  })
})
