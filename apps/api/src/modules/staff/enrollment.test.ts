import { describe, expect, test } from "bun:test"
import { changeEnrollment, enrollmentTransition, staffEnrollmentModule } from "./enrollment"

describe("staff enrollment policy", () => {
  test("withdrawal preserves a seat and removal releases an occupied seat", () => {
    expect(enrollmentTransition("active", "withdraw")).toEqual({
      status: "withdrawn",
      releasesSeat: false,
    })
    expect(enrollmentTransition("active", "remove")).toEqual({
      status: "removed",
      releasesSeat: true,
    })
    expect(enrollmentTransition("withdrawn", "remove")).toEqual({
      status: "removed",
      releasesSeat: true,
    })
    expect(enrollmentTransition("dropped", "remove")).toEqual({
      status: "removed",
      releasesSeat: false,
    })
  })

  test("repeated or ineligible actions cannot release seats twice", () => {
    for (const status of ["dropped", "removed"] as const) {
      expect(enrollmentTransition(status, "withdraw")).toBeNull()
    }
    expect(enrollmentTransition("removed", "remove")).toBeNull()
    expect(enrollmentTransition("withdrawn", "withdraw")).toBeNull()
  })

  test("requires nonblank evidence before looking up a registration", async () => {
    const actor = { id: "actor", username: "administrator" }
    expect(await changeEnrollment(1, "withdraw", actor, "reason", "  ")).toMatchObject({
      ok: false,
      code: "ENROLLMENT_DETAILS_REQUIRED",
    })
    expect(await changeEnrollment(1, "remove", actor, " ")).toMatchObject({
      ok: false,
      code: "ENROLLMENT_DETAILS_REQUIRED",
    })
  })

  test("all staff enrollment routes reject unauthenticated requests", async () => {
    const requests = [
      new Request("http://localhost/api/v1/staff/enrollments?studentId=1234567890"),
      new Request("http://localhost/api/v1/staff/enrollments/1/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "reason", approvalReference: "CR48" }),
      }),
      new Request("http://localhost/api/v1/staff/enrollments/1/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "reason" }),
      }),
    ]
    for (const request of requests)
      expect((await staffEnrollmentModule.handle(request)).status).toBe(401)
  })
})
