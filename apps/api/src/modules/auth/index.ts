import { Elysia, t } from "elysia"
import { config } from "../../config"
import { canonicalStudentId, originIsAllowed } from "../../shared/http"
import { appProblem } from "../../shared/problem"
import { consumeGlobalRate } from "../../shared/redis"
import {
  revokeCurrentStudentSession,
  type SessionCookieJar,
  sessionCookieSchema,
  setStudentSession,
  touchStudentSession,
} from "../../shared/session"
import { TokenBucket } from "./rate-limit"
import { changeStudentPassword, createChallenge, findStudent, loginWithChallenge } from "./service"

const challengeRate = new TokenBucket(config.authChallengeRatePerSecond, config.authChallengeBurst)
const loginRate = new TokenBucket(config.authLoginRatePerSecond, config.authLoginBurst)

const unavailable = (request: Request) =>
  appProblem(
    request,
    503,
    "AUTH_PROVIDER_UNAVAILABLE",
    "ยังไม่เปิดให้เข้าสู่ระบบ",
    "ระบบยืนยันตัวตนจริงยังไม่ได้รับการกำหนดค่า และโหมดตัวอย่างถูกปิดไว้",
  )

const rateLimited = (
  request: Request,
  set: { headers: Record<string, string | number | string[] | undefined> },
  retryAfterSeconds: number,
) => {
  set.headers["retry-after"] = String(retryAfterSeconds)
  return appProblem(
    request,
    429,
    "AUTH_RATE_LIMITED",
    "มีคำขอเข้าสู่ระบบมากเกินไป",
    "รอสักครู่แล้วลองใหม่อีกครั้ง",
  )
}

export const authModule = new Elysia({ name: "auth" })
  .get(
    "/api/v1/auth/challenge",
    {
      detail: { tags: ["Auth"], summary: "Create visible mock login challenge" },
    },
    async ({ request, set }) => {
      if (config.authMode !== "local-mock") return unavailable(request)
      const decision = challengeRate.consume()
      if (!decision.allowed) return rateLimited(request, set, decision.retryAfterSeconds)
      if (!(await consumeGlobalRate("auth-challenge", config.authGlobalChallengeRatePerSecond))) {
        return rateLimited(request, set, 1)
      }
      return { data: createChallenge() }
    },
  )
  .post(
    "/api/v1/auth/login",
    {
      body: t.Object({
        studentId: t.String({ minLength: 1, maxLength: 32 }),
        password: t.String({ minLength: 1, maxLength: 128 }),
        rememberMe: t.Optional(t.Boolean()),
        challengeCode: t.String({ pattern: "^\\d{4}$" }),
        challengeToken: t.String({ minLength: 20, maxLength: 512 }),
      }),
      cookie: sessionCookieSchema,
      detail: { tags: ["Auth"], summary: "Enter mock student session" },
    },
    async ({ body, cookie, request, set }) => {
      if (config.authMode !== "local-mock") return unavailable(request)
      if (!originIsAllowed(request)) {
        return appProblem(
          request,
          400,
          "ORIGIN_NOT_ALLOWED",
          "ไม่สามารถเข้าสู่ระบบได้",
          "คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต",
        )
      }
      const studentId = canonicalStudentId(body.studentId)
      if (!/^\d{10}$/.test(studentId)) {
        return appProblem(
          request,
          400,
          "STUDENT_ID_INVALID",
          "รหัสนิสิตไม่ถูกต้อง",
          "กรอกรหัสนิสิตเป็นตัวเลข 10 หลัก",
        )
      }
      const rateDecision = loginRate.consume()
      if (!rateDecision.allowed) return rateLimited(request, set, rateDecision.retryAfterSeconds)
      if (!(await consumeGlobalRate("auth-login", config.authGlobalLoginRatePerSecond))) {
        return rateLimited(request, set, 1)
      }
      const rememberMe = body.rememberMe === true
      const login = await loginWithChallenge(
        studentId,
        body.password,
        rememberMe,
        body.challengeToken,
        body.challengeCode,
      )
      if (!login.ok && login.reason === "capacity") {
        return appProblem(
          request,
          503,
          "MOCK_AUTH_CAPACITY_REACHED",
          "โปรไฟล์ทดลองเต็มแล้ว",
          "ใช้โปรไฟล์เดิมหรือล้างเฉพาะข้อมูลทดสอบที่ได้รับอนุญาตก่อนลองใหม่",
        )
      }
      if (!login.ok && login.reason === "credentials") {
        return appProblem(
          request,
          401,
          "INVALID_CREDENTIALS",
          "เข้าสู่ระบบไม่ได้",
          "รหัสนิสิตหรือรหัสผ่านไม่ถูกต้อง",
        )
      }
      if (!login.ok) {
        return appProblem(
          request,
          400,
          "CHALLENGE_INVALID",
          "รหัสยืนยันไม่ถูกต้อง",
          "ขอรหัสใหม่แล้วกรอกตัวเลข 4 หลักอีกครั้ง",
        )
      }
      setStudentSession(cookie as SessionCookieJar, login.sessionToken, rememberMe)
      return { data: { studentId } }
    },
  )
  .post(
    "/api/v1/auth/password",
    {
      cookie: sessionCookieSchema,
      body: t.Object({
        currentPassword: t.String({ minLength: 1, maxLength: 128 }),
        newPassword: t.String({ minLength: 8, maxLength: 128 }),
      }),
      detail: { tags: ["Auth"], summary: "Change student password" },
    },
    async ({ body, cookie, request, set }) => {
      if (!originIsAllowed(request)) {
        return appProblem(
          request,
          400,
          "ORIGIN_NOT_ALLOWED",
          "เปลี่ยนรหัสผ่านไม่ได้",
          "คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต",
        )
      }
      const session = await touchStudentSession(cookie as SessionCookieJar)
      if (!session)
        return appProblem(request, 401, "AUTH_REQUIRED", "ต้องเข้าสู่ระบบ", "เข้าสู่ระบบก่อนเปลี่ยนรหัสผ่าน")
      const rateDecision = loginRate.consume()
      if (!rateDecision.allowed) return rateLimited(request, set, rateDecision.retryAfterSeconds)
      if (!(await consumeGlobalRate("auth-login", config.authGlobalLoginRatePerSecond))) {
        return rateLimited(request, set, 1)
      }
      if (
        !(await changeStudentPassword(session.studentId, body.currentPassword, body.newPassword))
      ) {
        return appProblem(
          request,
          400,
          "INVALID_CREDENTIALS",
          "เปลี่ยนรหัสผ่านไม่ได้",
          "รหัสผ่านปัจจุบันไม่ถูกต้อง",
        )
      }
      return { data: { changed: true as const } }
    },
  )
  .post(
    "/api/v1/auth/logout",
    { cookie: sessionCookieSchema, detail: { tags: ["Auth"], summary: "Leave mock session" } },
    async ({ cookie, request }) => {
      if (!originIsAllowed(request)) {
        return appProblem(
          request,
          400,
          "ORIGIN_NOT_ALLOWED",
          "ออกจากระบบไม่ได้",
          "คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต",
        )
      }
      await revokeCurrentStudentSession(cookie as SessionCookieJar)
      return { data: { loggedOut: true as const } }
    },
  )
  .get(
    "/api/v1/me",
    { cookie: sessionCookieSchema, detail: { tags: ["Auth"], summary: "Current mock student" } },
    async ({ cookie, request }) => {
      const session = await touchStudentSession(cookie as SessionCookieJar)
      if (!session) {
        return appProblem(request, 401, "AUTH_REQUIRED", "ต้องเข้าสู่ระบบ", "เข้าสู่ระบบด้วยรหัสนิสิตก่อนใช้งาน")
      }
      const student = await findStudent(session.studentId)
      if (!student) {
        await revokeCurrentStudentSession(cookie as SessionCookieJar)
        return appProblem(request, 401, "SESSION_INVALID", "เซสชันไม่ถูกต้อง", "เข้าสู่ระบบใหม่อีกครั้ง")
      }
      return {
        data: {
          studentId: student.studentId,
          lastLoginAt: student.lastLoginAt.toISOString(),
          rememberMe: session.rememberMe,
        },
      }
    },
  )
