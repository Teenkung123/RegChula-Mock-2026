import { describe, expect, it } from "bun:test"
import { isDuplicateStaffUsername } from "./accounts"

describe("staff account duplicate handling", () => {
  it("recognizes a duplicate rejected inside the Drizzle transaction wrapper", () => {
    const databaseError = Object.assign(new Error("Duplicate username"), { code: "ER_DUP_ENTRY" })
    expect(isDuplicateStaffUsername(databaseError)).toBe(true)
    expect(isDuplicateStaffUsername(new Error("Failed query", { cause: databaseError }))).toBe(true)
  })

  it("preserves unrelated database and programming failures", () => {
    expect(isDuplicateStaffUsername(new Error("Connection failed", {
      cause: Object.assign(new Error("Offline"), { code: "ECONNREFUSED" }),
    }))).toBe(false)
    expect(isDuplicateStaffUsername(new TypeError("Invalid account state"))).toBe(false)
    expect(isDuplicateStaffUsername(null)).toBe(false)
  })
})
