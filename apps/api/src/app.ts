import { openapi } from "@elysia/openapi"
import { Elysia, problem, t } from "elysia"
import { config } from "./config"
import { databaseFailureKind, pool } from "./db/client"
import { authModule } from "./modules/auth"
import { catalogModule } from "./modules/catalog"
import { examsModule } from "./modules/exams"
import { preferencesModule } from "./modules/preferences"
import { registrationModule } from "./modules/registration"
import { scheduleColorsModule } from "./modules/schedule-colors"
import { personalPlanningModule } from "./modules/personal-planning"
import { appProblem } from "./shared/problem"
import { pingSharedState, SharedStateUnavailableError } from "./shared/redis"

const success = <T>(data: T) => ({ data })
const livePath = "/api/v1/health/live"
const databaseFailureDescriptions = {
  overloaded: {
    code: "DATABASE_OVERLOADED",
    detail: "ฐานข้อมูลกำลังมีคำขอจำนวนมาก กรุณารอสักครู่แล้วลองใหม่",
  },
  timeout: {
    code: "DATABASE_TIMEOUT",
    detail: "ฐานข้อมูลตอบสนองไม่ทันเวลา กรุณาลองใหม่อีกครั้ง",
  },
  unavailable: {
    code: "DATABASE_UNAVAILABLE",
    detail: "ฐานข้อมูลกำลังเริ่มทำงาน ลองใหม่อีกครั้งในครู่เดียว",
  },
} as const

export type AdmissionDecision = "accepted" | "draining" | "overloaded"

export class AdmissionController {
  readonly #activeRequests = new WeakSet<Request>()
  #activeCount = 0
  #draining = false

  constructor(readonly limit: number) {}

  admit(request: Request): AdmissionDecision {
    if (this.#draining) return "draining"
    if (this.#activeCount >= this.limit) return "overloaded"
    this.#activeRequests.add(request)
    this.#activeCount += 1
    return "accepted"
  }

  release(request: Request): void {
    if (!this.#activeRequests.delete(request)) return
    this.#activeCount -= 1
  }

  beginDrain(): void {
    this.#draining = true
  }

  get draining(): boolean {
    return this.#draining
  }

  get activeCount(): number {
    return this.#activeCount
  }
}

export const runtimeAdmission = new AdmissionController(config.apiMaxInFlightRequests)

const retryLater = (set: { headers: Record<string, string | number | string[] | undefined> }) => {
  set.headers["retry-after"] = "1"
}

export const app = new Elysia({
  name: "regchula-api",
  cookie: {
    secrets: config.cookieSecret,
    sign: ["regchula_session_v2", "regchula_session", "regchula_remember"],
  },
})
  .request(({ request, set }) => {
    const path = new URL(request.url).pathname
    if (path === livePath) return

    const contentLength = request.headers.get("content-length")
    if (contentLength !== null && Number(contentLength) > config.apiMaxRequestBodyBytes) {
      return appProblem(
        request,
        413,
        "REQUEST_TOO_LARGE",
        "คำขอมีขนาดใหญ่เกินไป",
        `ขนาดคำขอต้องไม่เกิน ${config.apiMaxRequestBodyBytes} ไบต์`,
      )
    }

    const decision = runtimeAdmission.admit(request)
    if (decision === "accepted") return
    retryLater(set)
    return appProblem(
      request,
      503,
      decision === "draining" ? "SERVICE_DRAINING" : "SERVER_OVERLOADED",
      "ระบบกำลังมีผู้ใช้งานจำนวนมาก",
      decision === "draining"
        ? "ระบบกำลังปิดปรับปรุง กรุณาลองใหม่อีกครั้ง"
        : "คำขอพร้อมกันเกินขีดจำกัด กรุณารอสักครู่แล้วลองใหม่",
    )
  })
  .afterResponse(({ request }) => {
    runtimeAdmission.release(request)
  })
  .use(
    openapi({
      path: "/openapi",
      documentation: {
        info: {
          title: "RegChula Mock API",
          version: "1.0.0",
          description: "Clean-room course registration demonstration API",
        },
      },
    }),
  )
  .use(authModule)
  .use(catalogModule)
  .use(examsModule)
  .use(preferencesModule)
  .use(registrationModule)
  .use(scheduleColorsModule)
  .use(personalPlanningModule)
  .get(
    "/api/v1/health/live",
    {
      response: t.Object({
        data: t.Object({ status: t.Literal("ok") }),
      }),
      detail: { tags: ["Health"], summary: "Process liveness" },
    },
    () => success({ status: "ok" as const }),
  )
  .get(
    "/api/v1/health/ready",
    { detail: { tags: ["Health"], summary: "Database readiness" } },
    async ({ request, set }) => {
      try {
        await Promise.all([pool.query("SELECT 1"), pingSharedState()])
        return success({ status: "ready" as const })
      } catch (error) {
        retryLater(set)
        if (error instanceof SharedStateUnavailableError) {
          const causeCode =
            error.cause && typeof error.cause === "object" && "code" in error.cause
              ? String((error.cause as { code?: unknown }).code)
              : "unknown"
          console.warn(`[api] Shared state readiness failed (${causeCode})`)
          return appProblem(
            request,
            503,
            "SHARED_STATE_UNAVAILABLE",
            "ระบบยังไม่พร้อม",
            "ระบบเซสชันกำลังเริ่มทำงาน ลองใหม่อีกครั้งในครู่เดียว",
          )
        }
        const description = databaseFailureDescriptions[databaseFailureKind(error) ?? "unavailable"]
        return appProblem(request, 503, description.code, "ระบบยังไม่พร้อม", description.detail)
      }
    },
  )
  .post(
    "/api/v1/compat/echo",
    {
      body: t.Object({ value: t.String({ minLength: 1, maxLength: 40 }) }),
      response: t.Object({ data: t.Object({ value: t.String() }) }),
      detail: { hide: true },
    },
    ({ body }) => success(body),
  )
  .get("/api/v1/compat/problem", { detail: { hide: true } }, ({ request }) =>
    problem(418, {
      type: "https://regchula.local/problems/compatibility",
      title: "Compatibility check",
      detail: "Elysia 2 problem responses are available.",
      instance: new URL(request.url).pathname,
      code: "COMPATIBILITY_CHECK",
    }),
  )
  .error(({ error, request, set }) => {
    const frameworkCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : null
    const frameworkStatus =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status)
        : null
    const errorName = error instanceof Error ? error.name : ""
    if (
      frameworkCode === "VALIDATION" ||
      frameworkStatus === 422 ||
      errorName === "ValidationError"
    ) {
      return appProblem(
        request,
        400,
        "VALIDATION_FAILED",
        "ข้อมูลไม่ถูกต้อง",
        "ตรวจสอบรูปแบบข้อมูลแล้วลองอีกครั้ง",
        { message: error.message },
      )
    }
    if (frameworkCode === "invalid-cookie") {
      return appProblem(request, 401, "SESSION_INVALID", "เซสชันไม่ถูกต้อง", "เข้าสู่ระบบใหม่อีกครั้ง")
    }
    if (error instanceof SharedStateUnavailableError) {
      retryLater(set)
      return appProblem(
        request,
        503,
        "SHARED_STATE_UNAVAILABLE",
        "ระบบยังไม่พร้อม",
        "ระบบเซสชันกำลังเริ่มทำงาน ลองใหม่อีกครั้งในครู่เดียว",
      )
    }
    const databaseFailure = databaseFailureKind(error)
    if (databaseFailure) {
      retryLater(set)
      const description = databaseFailureDescriptions[databaseFailure]
      return appProblem(request, 503, description.code, "ระบบยังไม่พร้อม", description.detail)
    }
    if (frameworkCode === "not-found" || frameworkStatus === 404) {
      return appProblem(request, 404, "ROUTE_NOT_FOUND", "ไม่พบเส้นทาง", "ตรวจสอบที่อยู่ API แล้วลองอีกครั้ง")
    }
    if (frameworkStatus && frameworkStatus >= 400 && frameworkStatus < 500) {
      return appProblem(
        request,
        frameworkStatus,
        "REQUEST_REJECTED",
        "คำขอไม่ถูกต้อง",
        "ตรวจสอบข้อมูลและลองอีกครั้ง",
      )
    }
    console.error("[api] Unhandled request error", error)
    return appProblem(
      request,
      500,
      "INTERNAL_ERROR",
      "ระบบดำเนินการไม่สำเร็จ",
      "ลองใหม่อีกครั้ง หากยังพบปัญหาให้ตรวจสอบบันทึกของ API",
    )
  })

export type App = typeof app
