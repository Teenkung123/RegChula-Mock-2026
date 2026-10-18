import { describe, expect, test } from "bun:test"
import { app } from "../../app"
import { validActivity } from "./index"

describe("personal planning boundaries", () => {
  const activity = { title: "Lunch", dayCode: "MO" as const, startMinute: 720, endMinute: 780 }
  test("accepts a same-day activity and midnight endpoints", () => {
    expect(validActivity(activity)).toBe(true)
    expect(validActivity({ ...activity, startMinute: 0, endMinute: 1440 })).toBe(true)
  })
  test("rejects blank titles, reversed and fractional times", () => {
    expect(validActivity({ ...activity, title: "  " })).toBe(false)
    expect(validActivity({ ...activity, startMinute: 780 })).toBe(false)
    expect(validActivity({ ...activity, startMinute: 1380, endMinute: 420 })).toBe(false)
    expect(validActivity({ ...activity, endMinute: 1441 })).toBe(false)
    expect(validActivity({ ...activity, startMinute: 1.5 })).toBe(false)
  })
  test("requires a signed session on every personal read and mutation", async () => {
    for (const [method, path, body] of [
      ["GET", "/schedule/activities?termId=1", undefined],
      ["POST", "/schedule/activities?termId=1", activity],
      ["PUT", "/schedule/activities/00000000-0000-4000-8000-000000000001?termId=1", activity],
      ["DELETE", "/schedule/activities/00000000-0000-4000-8000-000000000001?termId=1", undefined],
      ["GET", "/favorites?termId=1", undefined],
      ["PUT", "/favorites/2301101", undefined],
      ["DELETE", "/favorites/2301101", undefined],
    ] as const) {
      const response = await app.handle(
        new Request(`http://localhost/api/v1${path}`, {
          method,
          ...(body
            ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
            : {}),
        }),
      )
      expect(response.status).toBe(401)
      expect((await response.json()).code).toBe("AUTH_REQUIRED")
    }
  })
})
