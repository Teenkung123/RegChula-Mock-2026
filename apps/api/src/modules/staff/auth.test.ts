import { describe, expect, it } from "bun:test"
import { requireStaff, type StaffCookieJar } from "./auth"

const cookie = (value?: string) =>
  ({
    regchula_staff_session: { value, remove() {}, set() {} },
  }) as unknown as StaffCookieJar

describe("staff authorization", () => {
  it("rejects requests without a valid signed staff session", async () => {
    for (const value of [undefined, "bad-token", `${"a".repeat(43)}.${"b".repeat(43)}`]) {
      const result = await requireStaff(
        cookie(value),
        new Request("http://localhost/api/v1/staff/auth/me"),
        "admin",
      )
      expect(result).toBeInstanceOf(Response)
      if (!(result instanceof Response)) throw new Error("Expected a problem response")
      expect(result.status).toBe(401)
      expect(result.headers.get("content-type")).toBe("application/problem+json")
    }
  })

  it("rejects mutations from disallowed origins before checking credentials", async () => {
    const request = new Request("http://localhost/api/v1/staff/accounts", {
      method: "POST",
      headers: { origin: "https://untrusted.invalid" },
    })
    const result = await requireStaff(cookie(), request, "admin")
    expect(result).toBeInstanceOf(Response)
    if (!(result instanceof Response)) throw new Error("Expected a problem response")
    expect(result.status).toBe(400)
    expect((await result.json()).code).toBe("ORIGIN_NOT_ALLOWED")
  })
})
