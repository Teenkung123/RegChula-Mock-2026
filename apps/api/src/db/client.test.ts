import { describe, expect, it } from "bun:test"
import { databaseFailureKind, isDatabaseUnavailable, waitForDatabase } from "./client"

describe("database startup readiness", () => {
  it("recognizes direct and wrapped transient connection failures", () => {
    expect(isDatabaseUnavailable({ code: "ECONNREFUSED" })).toBe(true)
    expect(isDatabaseUnavailable({ cause: { code: "PROTOCOL_CONNECTION_LOST" } })).toBe(true)
    expect(isDatabaseUnavailable({ code: "ER_ACCESS_DENIED_ERROR" })).toBe(false)
  })

  it("classifies pool exhaustion and timeouts for 503 responses", () => {
    expect(databaseFailureKind(new Error("Queue limit reached."))).toBe("overloaded")
    expect(databaseFailureKind({ cause: { code: "ER_CON_COUNT_ERROR" } })).toBe("overloaded")
    expect(databaseFailureKind({ code: "ETIMEDOUT" })).toBe("timeout")
    expect(databaseFailureKind({ code: "ER_ACCESS_DENIED_ERROR" })).toBeNull()
  })

  it("retries a transient connection failure until MySQL is ready", async () => {
    let attempts = 0
    await waitForDatabase({
      timeoutMs: 50,
      retryMs: 0,
      probe: async () => {
        attempts += 1
        if (attempts < 3) throw { code: "ECONNREFUSED" }
      },
    })
    expect(attempts).toBe(3)
  })
})
