import { type Cookie, t } from "elysia"
import { config } from "../config"
import {
  sharedSessionStore,
  REMEMBER_SESSION_SECONDS,
  SESSION_IDLE_SECONDS,
  type SessionStore,
} from "./session-store"

export { REMEMBER_SESSION_SECONDS, SESSION_IDLE_SECONDS } from "./session-store"

export const sessionCookieSchema = t.Cookie({
  regchula_session_v2: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
  regchula_session: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
  regchula_remember: t.Optional(t.Literal("1")),
})

export type SessionCookieJar = {
  regchula_session_v2: Cookie<string | undefined>
  regchula_session: Cookie<string | undefined>
  regchula_remember: Cookie<"1" | undefined>
}

const sessionToken = (value: unknown): string | null =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure: config.appEnv === "production",
  maxAge,
  path: "/",
})

const clearStudentSession = (cookie: SessionCookieJar): void => {
  cookie.regchula_session_v2.remove()
  cookie.regchula_session.remove()
  cookie.regchula_remember.remove()
}

export function setStudentSession(
  cookie: SessionCookieJar,
  token: string,
  rememberMe: boolean,
): void {
  cookie.regchula_session_v2.set({
    value: token,
    ...cookieOptions(rememberMe ? REMEMBER_SESSION_SECONDS : SESSION_IDLE_SECONDS),
  })
  cookie.regchula_session.remove()
  if (rememberMe) {
    cookie.regchula_remember.set({ value: "1", ...cookieOptions(REMEMBER_SESSION_SECONDS) })
  } else {
    cookie.regchula_remember.remove()
  }
}

export async function touchStudentSession(
  cookie: SessionCookieJar,
  store: SessionStore = sharedSessionStore,
): Promise<{ studentId: string; rememberMe: boolean } | null> {
  if (config.authMode === "disabled") {
    clearStudentSession(cookie)
    return null
  }
  const token = sessionToken(cookie.regchula_session_v2.value)
  if (!token) {
    clearStudentSession(cookie)
    return null
  }
  const session = await store.resolve(token)
  if (!session) {
    clearStudentSession(cookie)
    return null
  }
  setStudentSession(cookie, token, session.rememberMe)
  return session
}

export async function revokeCurrentStudentSession(
  cookie: SessionCookieJar,
  store: SessionStore = sharedSessionStore,
): Promise<void> {
  const token = sessionToken(cookie.regchula_session_v2.value)
  if (token) await store.revoke(token)
  clearStudentSession(cookie)
}
