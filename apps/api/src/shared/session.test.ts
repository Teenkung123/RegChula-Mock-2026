import { describe, expect, it } from "bun:test"
import {
  REMEMBER_SESSION_SECONDS,
  revokeCurrentStudentSession,
  SESSION_IDLE_SECONDS,
  setStudentSession,
  touchStudentSession,
  type SessionCookieJar,
} from "./session"
import type { SessionStore } from "./session-store"

const token = "a".repeat(43)

function cookieJar(): { jar: SessionCookieJar; state: Record<string, unknown> } {
  const state: Record<string, unknown> = {}
  const cell = (name: string) => ({
    get value() {
      return state[name]
    },
    set(value: Record<string, unknown>) {
      state[name] = value.value
      state[`${name}:maxAge`] = value.maxAge
    },
    remove() {
      delete state[name]
    },
  })
  return {
    jar: {
      regchula_session_v2: cell("session-v2"),
      regchula_session: cell("legacy-session"),
      regchula_remember: cell("remember"),
    } as unknown as SessionCookieJar,
    state,
  }
}

describe("server-backed session lifetime", () => {
  it("stores an opaque token and resolves the student through the shared store", async () => {
    const { jar, state } = cookieJar()
    setStudentSession(jar, token, false)
    let resolved = ""
    const store: SessionStore = {
      resolve: async (value) => {
        resolved = value
        return { studentId: "student-a", rememberMe: false }
      },
      revoke: async () => {},
    }

    expect(state["session-v2"]).toBe(token)
    expect(state["session-v2:maxAge"]).toBe(SESSION_IDLE_SECONDS)
    expect(await touchStudentSession(jar, store)).toEqual({
      studentId: "student-a",
      rememberMe: false,
    })
    expect(resolved).toBe(token)
  })

  it("binds Remember Me to the server record instead of trusting the second cookie", async () => {
    const { jar, state } = cookieJar()
    setStudentSession(jar, token, false)
    const store: SessionStore = {
      resolve: async () => ({ studentId: "student-b", rememberMe: true }),
      revoke: async () => {},
    }

    await touchStudentSession(jar, store)
    expect(state.remember).toBe("1")
    expect(state["session-v2:maxAge"]).toBe(REMEMBER_SESSION_SECONDS)
  })

  it("rejects legacy or malformed cookies without querying the store", async () => {
    const { jar, state } = cookieJar()
    state["legacy-session"] = "student-a"
    let calls = 0
    const store: SessionStore = {
      resolve: async () => {
        calls += 1
        return null
      },
      revoke: async () => {},
    }

    expect(await touchStudentSession(jar, store)).toBeNull()
    expect(calls).toBe(0)
    expect(state["legacy-session"]).toBeUndefined()
  })

  it("revokes the shared session before clearing browser cookies", async () => {
    const { jar, state } = cookieJar()
    setStudentSession(jar, token, true)
    const events: string[] = []
    const store: SessionStore = {
      resolve: async () => null,
      revoke: async (value) => {
        events.push(value)
      },
    }

    await revokeCurrentStudentSession(jar, store)
    expect(events).toEqual([token])
    expect(state["session-v2"]).toBeUndefined()
    expect(state.remember).toBeUndefined()
  })

  it("keeps the browser cookie when shared revocation fails so logout can be retried", async () => {
    const { jar, state } = cookieJar()
    setStudentSession(jar, token, false)
    const store: SessionStore = {
      resolve: async () => null,
      revoke: async () => {
        throw new Error("shared state unavailable")
      },
    }

    await expect(revokeCurrentStudentSession(jar, store)).rejects.toThrow("shared state unavailable")
    expect(state["session-v2"]).toBe(token)
  })
})
