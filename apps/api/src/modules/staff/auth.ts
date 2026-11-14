import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { and, eq, gt } from "drizzle-orm"
import { type Cookie, Elysia, t } from "elysia"
import { config } from "../../config"
import { db } from "../../db/client"
import { staffSessions, staffUsers } from "../../db/schema/staff"
import { originIsAllowed } from "../../shared/http"
import { appProblem } from "../../shared/problem"
import { consumeGlobalRate, sharedState } from "../../shared/redis"
import { TokenBucket } from "../auth/rate-limit"

export type StaffIdentity = {
  id: string
  username: string
  displayName: string
  role: "admin" | "advisor"
}
export const staffCookieSchema = t.Cookie({
  regchula_staff_session: t.Optional(t.String({ maxLength: 128 })),
})
export type StaffCookieJar = { regchula_staff_session: Cookie<string | undefined> }

const idleSeconds = 600
const absoluteSeconds = 7 * 24 * 60 * 60
const loginRate = new TokenBucket(5, 10)
let dummyHash: Promise<string> | undefined
const sign = (token: string) =>
  createHmac("sha256", config.cookieSecret).update(`staff:${token}`).digest("base64url")
const hash = (token: string) => createHash("sha256").update(token).digest("hex")

function parseToken(value: unknown): string | null {
  if (typeof value !== "string") return null
  const [token, signature, extra] = value.split(".")
  if (
    !token ||
    !signature ||
    extra !== undefined ||
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  )
    return null
  const expected = Buffer.from(sign(token))
  const actual = Buffer.from(signature)
  return timingSafeEqual(expected, actual) ? token : null
}

function setCookie(cookie: StaffCookieJar, token: string) {
  cookie.regchula_staff_session.set({
    value: `${token}.${sign(token)}`,
    httpOnly: true,
    sameSite: "strict",
    secure: config.appEnv === "production",
    path: "/",
    maxAge: idleSeconds,
  })
}

function guardProblem(
  request: Request,
  status: number,
  code: string,
  title: string,
  detail: string,
): Response {
  const result = appProblem(request, status, code, title, detail)
  return new Response(JSON.stringify(result.response), {
    status,
    headers: { "content-type": "application/problem+json" },
  })
}

export async function requireStaff(
  cookie: StaffCookieJar,
  request: Request,
  role?: StaffIdentity["role"],
): Promise<StaffIdentity | Response> {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !originIsAllowed(request)) {
    return guardProblem(
      request,
      400,
      "ORIGIN_NOT_ALLOWED",
      "Invalid origin",
      "The request origin is not allowed.",
    )
  }
  const token = parseToken(cookie.regchula_staff_session.value)
  if (!token)
    return guardProblem(
      request,
      401,
      "STAFF_AUTH_REQUIRED",
      "Sign in required",
      "Sign in to continue.",
    )
  const now = new Date()
  const rows = await db
    .select({
      id: staffUsers.id,
      username: staffUsers.username,
      displayName: staffUsers.displayName,
      role: staffUsers.role,
      absoluteExpiresAt: staffSessions.absoluteExpiresAt,
    })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.staffId))
    .where(
      and(
        eq(staffSessions.tokenHash, hash(token)),
        eq(staffUsers.active, true),
        gt(staffSessions.idleExpiresAt, now),
        gt(staffSessions.absoluteExpiresAt, now),
      ),
    )
    .limit(1)
  const user = rows[0]
  if (!user) {
    cookie.regchula_staff_session.remove()
    return guardProblem(
      request,
      401,
      "STAFF_AUTH_REQUIRED",
      "Sign in required",
      "Your session has expired.",
    )
  }
  if (role && user.role !== role)
    return guardProblem(
      request,
      403,
      "STAFF_FORBIDDEN",
      "Access denied",
      "You do not have permission to perform this action.",
    )
  const idleExpiry = new Date(
    Math.min(Date.now() + idleSeconds * 1000, user.absoluteExpiresAt.getTime()),
  )
  await db
    .update(staffSessions)
    .set({ idleExpiresAt: idleExpiry })
    .where(eq(staffSessions.tokenHash, hash(token)))
  setCookie(cookie, token)
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role }
}

export const staffAuthModule = new Elysia({ name: "staff-auth" })
  .post(
    "/api/v1/staff/auth/login",
    {
      cookie: staffCookieSchema,
      body: t.Object({
        username: t.String({ minLength: 1, maxLength: 100 }),
        password: t.String({ minLength: 1, maxLength: 128 }),
      }),
    },
    async ({ body, cookie, request }) => {
      if (!originIsAllowed(request))
        return appProblem(
          request,
          400,
          "ORIGIN_NOT_ALLOWED",
          "Invalid origin",
          "The request origin is not allowed.",
        )
      if (!loginRate.consume().allowed || !(await consumeGlobalRate("staff-login", 5)))
        return appProblem(
          request,
          429,
          "AUTH_RATE_LIMITED",
          "Too many attempts",
          "Wait before trying again.",
        )
      const username = body.username.trim().toLowerCase()
      const accountKey = hash(username)
      const attempts = await sharedState((redis) =>
        redis.send("EVAL", [
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
          "1",
          `regchula:rate:staff-account:${accountKey}`,
        ]),
      )
      if (Number(attempts) > 10)
        return appProblem(
          request,
          429,
          "AUTH_RATE_LIMITED",
          "Too many attempts",
          "Wait before trying again.",
        )
      const [user] = await db
        .select()
        .from(staffUsers)
        .where(eq(staffUsers.username, username))
        .limit(1)
      if (!user && !dummyHash) dummyHash = Bun.password.hash(randomBytes(32).toString("base64url"))
      const checkHash = user?.passwordHash ?? (await dummyHash)
      if (!checkHash) throw new Error("Staff password verifier is unavailable")
      const validPassword = await Bun.password.verify(body.password, checkHash)
      if (!user?.active || !validPassword) {
        return appProblem(
          request,
          401,
          "INVALID_CREDENTIALS",
          "Sign in failed",
          "Check your username and password.",
        )
      }
      const token = randomBytes(32).toString("base64url")
      const now = Date.now()
      const identity = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(staffUsers)
          .where(eq(staffUsers.id, user.id))
          .for("update")
        // Password verification intentionally happens outside the lock; compare the exact
        // credential again under lock so a reset or disable cannot race session creation.
        if (!current?.active || current.passwordHash !== user.passwordHash) return null
        await tx.insert(staffSessions).values({
          tokenHash: hash(token),
          staffId: user.id,
          idleExpiresAt: new Date(now + idleSeconds * 1000),
          absoluteExpiresAt: new Date(now + absoluteSeconds * 1000),
        })
        return {
          id: current.id,
          username: current.username,
          displayName: current.displayName,
          role: current.role,
        }
      })
      if (!identity)
        return appProblem(
          request,
          401,
          "INVALID_CREDENTIALS",
          "Sign in failed",
          "Check your username and password.",
        )
      setCookie(cookie as StaffCookieJar, token)
      return { data: identity }
    },
  )
  .post("/api/v1/staff/auth/logout", { cookie: staffCookieSchema }, async ({ cookie, request }) => {
    if (!originIsAllowed(request))
      return appProblem(
        request,
        400,
        "ORIGIN_NOT_ALLOWED",
        "Invalid origin",
        "The request origin is not allowed.",
      )
    const jar = cookie as StaffCookieJar
    const token = parseToken(jar.regchula_staff_session.value)
    if (token) await db.delete(staffSessions).where(eq(staffSessions.tokenHash, hash(token)))
    jar.regchula_staff_session.remove()
    return { data: { loggedOut: true } }
  })
  .get("/api/v1/staff/auth/me", { cookie: staffCookieSchema }, async ({ cookie, request }) => {
    const user = await requireStaff(cookie as StaffCookieJar, request)
    return user instanceof Response ? user : { data: user }
  })
