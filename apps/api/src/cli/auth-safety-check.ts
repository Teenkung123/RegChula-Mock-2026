import type { RowDataPacket } from "mysql2/promise"
import { app } from "../app"
import { config } from "../config"
import { closeDatabase, pool } from "../db/client"

interface CountRow extends RowDataPacket {
  total: number
}

const database = new URL(config.databaseUrl)
if (
  config.appEnv !== "development" ||
  config.authMode !== "local-mock" ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  database.port !== "3307"
) {
  throw new Error("Auth safety check requires local mock mode and local MySQL port 3307")
}

const suffix = crypto.randomUUID().slice(0, 8)
const studentId = `auth-safety-${suffix}`
const alternateStudentId = `auth-safety-other-${suffix}`
let nonce = ""
let secondNonce = ""
let cookie = ""

const loginRequest = (challengeCode: string, challengeToken: string, owner = studentId) =>
  app.handle(
    new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: config.webOrigin },
      body: JSON.stringify({
        studentId: owner,
        password: "local-safety-check-only",
        rememberMe: false,
        challengeCode,
        challengeToken,
      }),
    }),
  )

try {
  const challengeResponse = await app.handle(new Request("http://localhost/api/v1/auth/challenge"))
  const challenge = (await challengeResponse.json()) as {
    data?: { code?: string; token?: string }
  }
  if (!challengeResponse.ok || !challenge.data?.code || !challenge.data.token) {
    throw new Error("Challenge creation failed")
  }
  const encodedPayload = challenge.data.token.split(".")[0]
  const payload = JSON.parse(Buffer.from(encodedPayload ?? "", "base64url").toString("utf8")) as {
    nonce?: unknown
  }
  if (typeof payload.nonce !== "string") throw new Error("Challenge nonce is missing")
  nonce = payload.nonce

  const firstLogin = await loginRequest(challenge.data.code, challenge.data.token)
  const setCookie = firstLogin.headers.get("set-cookie") ?? ""
  const encodedSession = /regchula_session_v2=([^;,]+)/.exec(setCookie)?.[1]
  if (!firstLogin.ok || !encodedSession) throw new Error("First login did not issue a v2 session")
  cookie = `regchula_session_v2=${encodedSession}`

  const replay = await loginRequest(challenge.data.code, challenge.data.token)
  if (!replay.ok) throw new Error("Identical login retry was not idempotent")
  const conflicting = await loginRequest(
    challenge.data.code,
    challenge.data.token,
    alternateStudentId,
  )
  if (conflicting.status !== 400) throw new Error("Cross-student challenge reuse was accepted")

  const oldCookie = cookie
  const secondChallengeResponse = await app.handle(
    new Request("http://localhost/api/v1/auth/challenge"),
  )
  const secondChallenge = (await secondChallengeResponse.json()) as {
    data?: { code?: string; token?: string }
  }
  if (!secondChallenge.data?.code || !secondChallenge.data.token) {
    throw new Error("Second challenge creation failed")
  }
  const secondPayload = JSON.parse(
    Buffer.from(secondChallenge.data.token.split(".")[0] ?? "", "base64url").toString("utf8"),
  ) as { nonce?: unknown }
  if (typeof secondPayload.nonce !== "string") throw new Error("Second nonce is missing")
  secondNonce = secondPayload.nonce
  const secondLogin = await loginRequest(secondChallenge.data.code, secondChallenge.data.token)
  const secondEncodedSession = /regchula_session_v2=([^;,]+)/.exec(
    secondLogin.headers.get("set-cookie") ?? "",
  )?.[1]
  if (!secondLogin.ok || !secondEncodedSession) throw new Error("Session rotation failed")
  cookie = `regchula_session_v2=${secondEncodedSession}`
  const oldSession = await app.handle(
    new Request("http://localhost/api/v1/me", { headers: { cookie: oldCookie } }),
  )
  if (oldSession.status !== 401) throw new Error("Previous session survived login rotation")

  const me = await app.handle(new Request("http://localhost/api/v1/me", { headers: { cookie } }))
  if (!me.ok) throw new Error("Shared session did not resolve")

  const logout = await app.handle(
    new Request("http://localhost/api/v1/auth/logout", {
      method: "POST",
      headers: { cookie, origin: config.webOrigin },
    }),
  )
  if (!logout.ok) throw new Error("Logout failed")
  const replayAfterLogout = await app.handle(
    new Request("http://localhost/api/v1/me", { headers: { cookie } }),
  )
  if (replayAfterLogout.status !== 401) throw new Error("Revoked session was replayable")

  const [challengeRows] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM auth_challenge_consumptions WHERE nonce IN (?, ?)",
    [nonce, secondNonce],
  )
  const [studentRows] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM students WHERE student_id = ?",
    [studentId],
  )
  const [sessionRows] = await pool.query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM student_sessions WHERE student_id = ?",
    [studentId],
  )
  if (
    Number(challengeRows[0]?.total) !== 2 ||
    Number(studentRows[0]?.total) !== 1 ||
    Number(sessionRows[0]?.total) !== 1
  ) {
    throw new Error("Login did not preserve bounded challenge, student, and session state")
  }
  console.log("[auth] Cross-replica ledger semantics and idempotent retry passed")
  console.log("[auth] A new login invalidated the previous session and kept one durable row")
  console.log("[auth] Captured-cookie replay failed after server-side logout revocation")
} finally {
  if (nonce) await pool.query("DELETE FROM auth_challenge_consumptions WHERE nonce = ?", [nonce])
  if (secondNonce)
    await pool.query("DELETE FROM auth_challenge_consumptions WHERE nonce = ?", [secondNonce])
  await pool.query("DELETE FROM student_sessions WHERE student_id IN (?, ?)", [
    studentId,
    alternateStudentId,
  ])
  await pool.query("DELETE FROM student_preferences WHERE student_id IN (?, ?)", [
    studentId,
    alternateStudentId,
  ])
  await pool.query("DELETE FROM students WHERE student_id IN (?, ?)", [
    studentId,
    alternateStudentId,
  ])
  await pool.query(
    "UPDATE mock_auth_state SET student_count = (SELECT COUNT(*) FROM students) WHERE id = 1",
  )
  await pool.query(
    [
      "UPDATE mock_auth_shards s SET student_count = (",
      "SELECT COUNT(*) FROM students",
      "WHERE CONV(SUBSTRING(SHA2(student_id, 256), 1, 2), 16, 10) = s.shard_id)",
    ].join(" "),
  )
  await closeDatabase()
}
