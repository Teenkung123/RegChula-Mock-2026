import { describe, expect, it } from "bun:test"
import { Elysia, t } from "elysia"
import { AdmissionController, app, runtimeAdmission } from "./app"
import { config } from "./config"

describe("Elysia 2 compatibility", () => {
  it("bounds request admission and supports draining", () => {
    const admission = new AdmissionController(1)
    const first = new Request("http://localhost/first")
    const second = new Request("http://localhost/second")

    expect(admission.admit(first)).toBe("accepted")
    expect(admission.admit(second)).toBe("overloaded")
    admission.release(first)
    expect(admission.admit(second)).toBe("accepted")
    admission.release(second)
    admission.beginDrain()
    expect(admission.admit(first)).toBe("draining")
    expect(admission.activeCount).toBe(0)
  })

  it("rejects oversized requests with RFC 9457 details", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/v1/compat/echo", {
        method: "POST",
        headers: {
          "content-length": String(config.apiMaxRequestBodyBytes + 1),
          "content-type": "application/json",
        },
        body: JSON.stringify({ value: "ready" }),
      }),
    )
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(413)
    expect(body.code).toBe("REQUEST_TOO_LARGE")
  })

  it("validates the new route hook order", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/v1/compat/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "ready" }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { value: "ready" } })
    expect(runtimeAdmission.activeCount).toBe(0)
  })

  it("requires the specification password field for mock login", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:5173" },
        body: JSON.stringify({
          studentId: "password-required-test",
          challengeCode: "0000",
          challengeToken: "x".repeat(40),
        }),
      }),
    )
    const body = (await response.json()) as Record<string, unknown>
    expect(response.status).toBe(400)
    expect(body.code).toBe("VALIDATION_FAILED")
  })

  it("returns RFC 9457 problem details", async () => {
    const response = await app.handle(new Request("http://localhost/api/v1/compat/problem"))
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(418)
    expect(body.code).toBe("COMPATIBILITY_CHECK")
  })

  it("maps validation failures through the Elysia 2 error hook", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/v1/compat/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "" }),
      }),
    )
    const body = (await response.json()) as Record<string, unknown>
    expect(response.status).toBe(400)
    expect(body.code).toBe("VALIDATION_FAILED")
    expect(runtimeAdmission.activeCount).toBe(0)
  })

  it("maps unknown routes to a quiet 404 problem", async () => {
    const response = await app.handle(new Request("http://localhost/api/v1/does-not-exist"))
    const body = (await response.json()) as Record<string, unknown>
    expect(response.status).toBe(404)
    expect(body.code).toBe("ROUTE_NOT_FOUND")
  })

  it("publishes OpenAPI JSON", async () => {
    const response = await app.handle(new Request("http://localhost/openapi/json"))
    expect(response.status).toBe(200)
    const spec = (await response.json()) as {
      openapi?: string
      paths?: Record<string, unknown>
    }
    expect(spec).toHaveProperty("openapi")
    expect(spec.paths).toHaveProperty("/api/v1/courses")
    expect(spec.paths).toHaveProperty("/api/v1/registrations")
    expect(spec.paths).toHaveProperty("/api/v1/withdrawals/{id}/pdf")
    expect(spec.paths).toHaveProperty("/api/v1/exams")
    expect(spec.paths).toHaveProperty("/api/v1/schedule/colors")
    expect(spec.paths).toHaveProperty("/api/v1/schedule/colors/{courseCode}")
  })

  it("protects the exam timetable with the signed student session", async () => {
    const response = await app.handle(new Request("http://localhost/api/v1/exams"))
    const body = (await response.json()) as Record<string, unknown>
    expect(response.status).toBe(401)
    expect(body.code).toBe("AUTH_REQUIRED")
  })

  it("signs and rejects tampered cookies lazily", async () => {
    const cookieSchema = t.Cookie({ session: t.Optional(t.String()) })
    const cookieApp = new Elysia({
      cookie: { secrets: "compatibility-cookie-secret-32-bytes", sign: ["session"] },
    })
      .get("/set", { cookie: cookieSchema }, ({ cookie }) => {
        cookie.session.set({ value: "student", httpOnly: true, path: "/" })
        return "set"
      })
      .get("/read", { cookie: cookieSchema }, ({ cookie }) => cookie.session.value ?? "missing")
    const setResponse = await cookieApp.handle(new Request("http://localhost/set"))
    const cookie = setResponse.headers.get("set-cookie")
    expect(cookie).toContain("session=")
    const valid = await cookieApp.handle(
      new Request("http://localhost/read", { headers: { cookie: cookie ?? "" } }),
    )
    expect(await valid.text()).toBe("student")
    const tampered = await cookieApp.handle(
      new Request("http://localhost/read", {
        headers: { cookie: (cookie ?? "").replace("student", "attacker") },
      }),
    )
    expect(tampered.status).toBe(400)
    expect(await tampered.text()).toContain("invalid-cookie")
  })
})
