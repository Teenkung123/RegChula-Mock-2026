import { createHash, randomBytes, randomInt } from "node:crypto"
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises"
import { resolve } from "node:path"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { app } from "../apps/api/src/app"
import { config } from "../apps/api/src/config"
import { closeDatabase, pool } from "../apps/api/src/db/client"
import { closeSharedState } from "../apps/api/src/shared/redis"

// Only uniquely owned fixtures are changed; the selected term and existing catalogue stay intact.
const database = new URL(config.databaseUrl)
if (config.appEnv !== "development" || !["localhost", "127.0.0.1"].includes(database.hostname) || database.port !== "3307") {
  throw new Error("Staff API check requires the local development database on port 3307")
}
const credentialPath = resolve(import.meta.dir, "../tmp/staff-audit-credentials.json")
type FixtureStaff = { id: string; username: string; password: string }
type Credentials = { admin: FixtureStaff; advisor: FixtureStaff }
type CreatedAccount = { id: string; username: string }
type StaffAccount = { id: string; displayName: string; role: string }
type Term = { id: number; label: string; opensAt: string | null; isCurrent: boolean }
type Student = { studentId: string; advisorId: string | null }
type AdvisorCode = { studentId: string; code: string | null }
type Course = { nameEn: string; sections: Array<{ meetings: unknown[] }> }
type ExportedCatalog = { datasets?: Array<{ courses?: Array<{ courseNo: string }> }> }
type RegistrationAccess = { status: "open" | "code_required" | "profile_required" | "closed"; authorized: boolean; termId: number | null }
const staffIds: string[] = []
const studentIds: string[] = []
const termIds: number[] = []
const courseCodes: string[] = []
const importChecksums: string[] = []
const studentCookies = new Set<string>()
const challengeNonces: string[] = []
let passed = 0
const failures: string[] = []
const results: Array<{ name: string; passed: boolean; error?: string }> = []
let requestCount = 0
const keepStaff = process.argv.includes("--keep-staff")
const cleanupOnly = process.argv.includes("--cleanup-staff")
const reuseStaff = process.argv.includes("--reuse-staff")

async function cleanupStaff(credentials: Credentials) {
  for (const user of Object.values(credentials)) {
    if (!user.username.startsWith("audit-api-")) throw new Error("Unrecognized staff fixture")
    const [rows] = await pool.query<RowDataPacket[]>("SELECT username FROM staff_users WHERE id = ?", [user.id])
    if (rows[0] && rows[0].username !== user.username) throw new Error("Staff fixture ownership changed")
    await pool.query("DELETE FROM staff_audit_events WHERE staff_id = ?", [user.id])
    await pool.query("DELETE FROM staff_users WHERE id = ? AND username = ?", [user.id, user.username])
  }
  await unlink(credentialPath)
}

async function request<T = unknown>(path: string, cookie = "", method = "GET", body?: unknown, expected: number | number[] = 200, raw = false) {
  requestCount++
  const headers = new Headers({ origin: "http://localhost:5174" })
  if (cookie) headers.set("cookie", cookie)
  if (body !== undefined) headers.set("content-type", "application/json")
  const response = await app.handle(new Request(`http://localhost${path}`, {
    method, headers, ...(body === undefined ? {} : { body: raw ? String(body) : JSON.stringify(body) }),
  }))
  const value = await response.json() as { data?: T; code?: string; detail?: string }
  if (!(Array.isArray(expected) ? expected.includes(response.status) : response.status === expected)) {
    throw new Error(`${method} ${path.split("?")[0]} returned ${response.status} (${value.code ?? "unknown"}); expected ${expected}`)
  }
  return { data: value.data as T, value, response }
}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; results.push({ name, passed: true }); console.log(`[staff-check] PASS ${name}`) }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(name); results.push({ name, passed: false, error: message })
    console.error(`[staff-check] FAIL ${name}: ${message}`)
  }
}
async function login(user: FixtureStaff) {
  const { response } = await request("/api/v1/staff/auth/login", "", "POST", { username: user.username, password: user.password })
  const value = response.headers.get("set-cookie")?.split(";")[0]
  assert(value, "Staff login did not set a session cookie")
  return value
}

let credentials: Credentials | undefined
try {
  if (cleanupOnly) {
    await cleanupStaff(JSON.parse(await readFile(credentialPath, "utf8")))
    console.log("[staff-check] Staff audit accounts removed")
  } else {
    if (!reuseStaff) {
      try { await readFile(credentialPath); throw new Error("A previous staff audit fixture exists; clean it first") }
      catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error }
    }
    const suffix = randomBytes(5).toString("hex")
    const password = randomBytes(24).toString("base64url")
    credentials = reuseStaff ? JSON.parse(await readFile(credentialPath, "utf8")) as Credentials : {
      admin: { id: crypto.randomUUID(), username: `audit-api-${suffix}-admin`, password },
      advisor: { id: crypto.randomUUID(), username: `audit-api-${suffix}-advisor`, password },
    }
    const staff = credentials
    for (const [role, user] of Object.entries(credentials)) {
      if (!reuseStaff) await pool.query("INSERT INTO staff_users (id, username, display_name, role, password_hash) VALUES (?, ?, ?, ?, ?)",
        [user.id, user.username, `Audit ${role}`, role, await Bun.password.hash(password)])
      staffIds.push(user.id)
    }
    await mkdir(resolve(import.meta.dir, "../tmp"), { recursive: true })
    await writeFile(credentialPath, JSON.stringify(credentials), { mode: 0o600 })
    console.log("[staff-check] Isolated admin/advisor fixtures ready (credentials stored locally, not printed)")
    const admin = await login(credentials.admin)
    const advisor = await login(credentials.advisor)
    await check("login identity and unauthorized access", async () => {
      assert((await request<{ role: string }>("/api/v1/staff/auth/me", admin)).data.role === "admin", "Wrong administrator identity")
      await request("/api/v1/staff/accounts", "", "GET", undefined, 401)
      await request("/api/v1/staff/accounts", advisor, "GET", undefined, 403)
      await request("/api/v1/staff/catalog?termId=1", advisor, "GET", undefined, 403)
      await request("/api/v1/staff/enrollments?studentId=9900000000", advisor, "GET", undefined, 403)
    })
    let managedId = ""
    await check("staff account create, duplicate and update", async () => {
      await request("/api/v1/staff/accounts", admin, "POST", { username: " ", displayName: "Blank", role: "advisor", password }, 400)
      const data = (await request<CreatedAccount>("/api/v1/staff/accounts", admin, "POST", {
        username: `audit-api-${suffix}-managed`, displayName: "Audit Managed", role: "advisor", password,
      })).data
      managedId = data.id; staffIds.push(managedId)
      await request(`/api/v1/staff/accounts/${managedId}`, admin, "PATCH", { displayName: " " }, 400)
      const managedCookie = await login({ id: managedId, username: data.username, password })
      await request("/api/v1/staff/accounts", admin, "POST", { username: data.username, displayName: "Duplicate", role: "advisor", password }, 409)
      await request(`/api/v1/staff/accounts/${managedId}`, admin, "PATCH", { displayName: "Audit Updated", role: "admin" })
      await request("/api/v1/staff/auth/me", managedCookie, "GET", undefined, 401)
      const accounts = (await request<StaffAccount[]>("/api/v1/staff/accounts", admin)).data
      assert(accounts.some((row) => row.id === managedId && row.displayName === "Audit Updated" && row.role === "admin"), "Account update was not listed")
      await request(`/api/v1/staff/accounts/${managedId}`, admin, "PATCH", { active: false })
    })
    await check("concurrent duplicate staff creation returns a business rejection", async () => {
      const body = { username: `audit-api-${suffix}-race`, displayName: "Concurrent Audit", role: "advisor", password }
      const responses = await Promise.allSettled([
        request<CreatedAccount>("/api/v1/staff/accounts", admin, "POST", body, [200, 409]),
        request<CreatedAccount>("/api/v1/staff/accounts", admin, "POST", body, [200, 409]),
      ])
      const statuses: number[] = []
      for (const result of responses) {
        if (result.status === "fulfilled") {
          statuses.push(result.value.response.status)
          if (result.value.data?.id) staffIds.push(result.value.data.id)
        }
      }
      assert(statuses.sort().join(",") === "200,409", "Concurrent duplicate did not yield one account and one 409")
    })
    let termId = 0
    const year = randomInt(8000, 9000)
    await check("term creation, duplicate, window and label update", async () => {
      const [existing] = await pool.query<RowDataPacket[]>("SELECT id FROM academic_terms WHERE academic_year = ?", [year])
      assert(!existing.length, "Fixture academic year already exists")
      await request("/api/v1/staff/terms", admin, "POST", { academicYear: year, semester: 2, label: "   " }, 400)
      termId = (await request<{ id: number }>("/api/v1/staff/terms", admin, "POST", { academicYear: year, semester: 2, label: `Audit ${suffix}` })).data.id
      termIds.push(termId)
      await request(`/api/v1/staff/terms/${termId}`, admin, "PATCH", { label: "   " }, 400)
      await request("/api/v1/staff/terms", admin, "POST", { academicYear: year, semester: 2, label: "Duplicate" }, 409)
      await request(`/api/v1/staff/terms/${termId}`, admin, "PATCH", { label: "Audit Updated", opensAt: "2020-01-01T00:00:00Z", closesAt: "2099-12-31T00:00:00Z" })
      const terms = (await request<Term[]>("/api/v1/staff/terms", admin)).data
      assert(terms.some((row) => row.id === termId && row.label === "Audit Updated" && row.opensAt), "Term update was not listed")
      await request(`/api/v1/staff/terms/${termId}`, admin, "PATCH", { opensAt: "2099-01-01T00:00:00Z", closesAt: "2020-01-01T00:00:00Z" }, 422)
      await request("/api/v1/staff/terms/4294967295/current", admin, "POST", undefined, 404)
      const current = terms.find((row) => row.isCurrent)
      assert(current, "Current term not configured")
      await request(`/api/v1/staff/terms/${current.id}/current`, admin, "POST")
      await request(`/api/v1/staff/terms/${current.id}`, admin, "PATCH", { active: false }, 409)
    })
    assert(termId, "Term fixture was not created")
    const studentId = `98${randomInt(0, 100_000_000).toString().padStart(8, "0")}`
    const unassignedId = `97${randomInt(0, 100_000_000).toString().padStart(8, "0")}`
    for (const id of [studentId, unassignedId]) {
      await pool.query("INSERT INTO students (student_id) VALUES (?)", [id]); studentIds.push(id)
      await pool.query("INSERT INTO student_credentials (student_id, password_hash) VALUES (?, ?)", [id, await Bun.password.hash(password)])
    }
    await check("student search, account disable/enable/reset and advisor assignment", async () => {
      await request(`/api/v1/staff/students/${studentId}/advisor`, admin, "PUT", { advisorId: staff.advisor.id })
      const students = (await request<Student[]>(`/api/v1/staff/students?q=${studentId}`, admin)).data
      assert(students[0]?.studentId === studentId && students[0]?.advisorId === staff.advisor.id, "Student or advisor was not listed")
      assert((await request<Student[]>(`/api/v1/staff/students?q=${studentId}`, advisor)).data.length === 1, "Advisor cannot see assigned student")
      assert((await request<Student[]>(`/api/v1/staff/students?q=${unassignedId}`, advisor)).data.length === 0, "Advisor can see unassigned student")
      await request(`/api/v1/staff/students/${studentId}`, admin, "PATCH", { active: false })
      await request(`/api/v1/staff/students/${studentId}`, admin, "PATCH", { active: true, resetPassword: true })
      const [rows] = await pool.query<RowDataPacket[]>("SELECT password_hash, active FROM student_credentials WHERE student_id = ?", [studentId])
      assert(rows[0]?.active && await Bun.password.verify("12345678", rows[0].password_hash), "Student credential reset did not persist")
    })
    await check("registration profile and advisor code issue, reuse, rotate, scoping", async () => {
      await request(`/api/v1/staff/students/${studentId}/registration-profile`, admin, "PUT", { firstTermId: termId, academicLevel: "undergraduate" })
      await request(`/api/v1/staff/students/${unassignedId}/registration-profile`, admin, "PUT", { firstTermId: termId, academicLevel: "undergraduate" })
      const first = (await request<{ code: string }>(`/api/v1/staff/advisor-codes/${studentId}`, advisor, "POST", { termId, rotate: false })).data.code
      const again = (await request<{ code: string }>(`/api/v1/staff/advisor-codes/${studentId}`, advisor, "POST", { termId, rotate: false })).data.code
      const rotated = (await request<{ code: string }>(`/api/v1/staff/advisor-codes/${studentId}`, advisor, "POST", { termId, rotate: true })).data.code
      assert(first === again && first !== rotated, "Code reuse/rotation failed")
      const listed = (await request<{ students: AdvisorCode[] }>(`/api/v1/staff/advisor-codes?termId=${termId}`, advisor)).data.students
      assert(listed.some((row) => row.studentId === studentId && row.code === rotated), "Issued code was not listed")
      assert(!listed.some((row) => row.studentId === unassignedId), "Advisor code list leaks unassigned students")
      await request(`/api/v1/staff/advisor-codes/${unassignedId}`, advisor, "POST", { termId, rotate: false }, 404)
      await request(`/api/v1/staff/advisor-codes/${unassignedId}`, admin, "POST", { termId, rotate: false })
    })
    await check("continuing student code gate, grant, rotation and logout", async () => {
      const [currentTerms] = await pool.query<RowDataPacket[]>(`SELECT t.id, t.academic_year, t.semester
        FROM academic_terms t JOIN app_settings a ON a.\`key\` = 'current_term_id'
        WHERE t.id = CAST(a.value AS UNSIGNED)`)
      const current = currentTerms[0]
      assert(current, "Current term not configured")
      const [priorTerms] = await pool.query<RowDataPacket[]>(`SELECT id FROM academic_terms
        WHERE academic_year < ? OR (academic_year = ? AND semester < ?)
        ORDER BY academic_year DESC, semester DESC LIMIT 1`,
        [current.academic_year, current.academic_year, current.semester])
      assert(priorTerms[0], "A prior term is required for the continuing-student fixture")
      await request(`/api/v1/staff/students/${studentId}/registration-profile`, admin, "PUT", {
        firstTermId: priorTerms[0].id, academicLevel: "undergraduate",
      })
      const issued = (await request<{ code: string }>(`/api/v1/staff/advisor-codes/${studentId}`, advisor, "POST", {
        termId: current.id, rotate: true,
      })).data.code
      const challenge = (await request<{ code: string; token: string }>("/api/v1/auth/challenge")).data
      const payload = JSON.parse(Buffer.from(challenge.token.split(".")[0] ?? "", "base64url").toString("utf8")) as { nonce?: string }
      assert(payload.nonce, "Challenge nonce is missing")
      challengeNonces.push(payload.nonce)
      const loggedIn = await request<{ studentId: string }>("/api/v1/auth/login", "", "POST", {
        studentId, password: "12345678", rememberMe: false,
        challengeCode: challenge.code, challengeToken: challenge.token,
      })
      assert(loggedIn.data.studentId === studentId, "Student login resolved the wrong owner")
      const studentCookie = loggedIn.response.headers.getSetCookie()
        .map((value) => value.split(";")[0]).filter((value) => value?.startsWith("regchula_session_v2=")).join("; ")
      assert(studentCookie, "Student session cookie is missing")
      studentCookies.add(studentCookie)
      const beforeGrant = (await request<RegistrationAccess>("/api/v1/registration-access", studentCookie)).data
      assert(beforeGrant.status === "code_required" && !beforeGrant.authorized, "Continuing student did not require a code")
      await request("/api/v1/registration-access", studentCookie, "POST", { code: "invalid-audit-code" }, 409)
      const granted = (await request<RegistrationAccess>("/api/v1/registration-access", studentCookie, "POST", { code: issued })).data
      assert(granted.status === "open" && granted.authorized && granted.termId === current.id, "Valid code did not grant access")
      assert((await request<RegistrationAccess>("/api/v1/registration-access", studentCookie)).data.authorized, "Grant was not persisted")
      const rotated = (await request<{ code: string }>(`/api/v1/staff/advisor-codes/${studentId}`, advisor, "POST", {
        termId: current.id, rotate: true,
      })).data.code
      assert(rotated !== issued, "Rotation returned the previous code")
      const afterRotation = (await request<RegistrationAccess>("/api/v1/registration-access", studentCookie)).data
      assert(afterRotation.status === "code_required" && !afterRotation.authorized, "Rotation did not invalidate the old grant")
      await request("/api/v1/registration-access", studentCookie, "POST", { code: issued }, 409)
      assert((await request<RegistrationAccess>("/api/v1/registration-access", studentCookie, "POST", { code: rotated })).data.authorized,
        "Rotated code did not grant access")
      await request("/api/v1/auth/logout", studentCookie, "POST")
      studentCookies.delete(studentCookie)
      await request("/api/v1/registration-access", studentCookie, "GET", undefined, 401)
    })
    const courseCode = `audit-api-${suffix}`
    courseCodes.push(courseCode)
    let offeringId = 0, sectionId = 0
    await check("course and section creation, details, capacity and export", async () => {
      const body = { termId, courseCode, nameTh: "Audit Course", nameEn: "Audit Course", faculty: "Audit", department: "Audit", credits: 3 }
      await request("/api/v1/staff/catalog/offerings", admin, "POST", { ...body, nameTh: " " }, 400)
      offeringId = (await request<{ id: number }>("/api/v1/staff/catalog/offerings", admin, "POST", body)).data.id
      await request(`/api/v1/staff/catalog/offerings/${offeringId}`, admin, "PATCH", { nameEn: " " }, 400)
      await request("/api/v1/staff/catalog/offerings", admin, "POST", body, 409)
      await request("/api/v1/staff/catalog/sections", admin, "POST", { offeringId, sectionNo: " ", capacity: 10 }, 400)
      sectionId = (await request<{ id: number }>("/api/v1/staff/catalog/sections", admin, "POST", { offeringId, sectionNo: "1", capacity: 10 })).data.id
      await request("/api/v1/staff/catalog/sections", admin, "POST", { offeringId, sectionNo: "1", capacity: 10 }, 409)
      await request(`/api/v1/staff/catalog/offerings/${offeringId}`, admin, "PATCH", { nameEn: "Updated Course", shortName: "AUDIT", midtermDate: "2099-01-01", midtermStartMinute: 540, midtermEndMinute: 600 })
      await request(`/api/v1/staff/catalog/sections/${sectionId}`, admin, "PATCH", { capacity: 12, note: "Audit note", meetings: [{ classType: "LECT", dayCode: "MO", startMinute: 540, endMinute: 600, building: "Audit", room: "101", teachers: ["Audit Lecturer"] }] })
      const courses = (await request<Course[]>(`/api/v1/staff/catalog?termId=${termId}&q=${courseCode}`, admin)).data
      assert(courses[0]?.nameEn === "Updated Course" && courses[0].sections[0]?.meetings.length === 1, "Course/section details did not persist")
      const exported = (await request(`/api/v1/staff/catalog/export?termId=${termId}`, admin)).value as ExportedCatalog
      assert(exported.datasets?.[0]?.courses?.[0]?.courseNo === courseCode, "Export missing course")
      await pool.query("UPDATE sections SET baseline_enrolled = 9 WHERE id = ?", [sectionId])
      await request(`/api/v1/staff/catalog/sections/${sectionId}`, admin, "PATCH", { capacity: 8 }, 409)
      await pool.query("UPDATE sections SET baseline_enrolled = 0 WHERE id = ?", [sectionId])
    })
    await check("enrollment search, withdrawal, removal and counted seats", async () => {
      assert(sectionId && offeringId, "Course fixture missing")
      const [result] = await pool.query<ResultSetHeader>("INSERT INTO registrations (student_id, term_id, offering_id, section_id, course_code, credits, status) VALUES (?, ?, ?, ?, ?, 3, 'active')", [studentId, termId, offeringId, sectionId, courseCode])
      await pool.query("UPDATE sections SET local_active = 1 WHERE id = ?", [sectionId])
      const registrations = (await request<{ registrations: Array<{ registrationId: number }> }>(`/api/v1/staff/enrollments?studentId=${studentId}`, admin)).data.registrations
      assert(registrations.some((r) => r.registrationId === result.insertId), "Enrollment search missing fixture")
      await request(`/api/v1/staff/enrollments/${result.insertId}/withdraw`, admin, "POST", { reason: "Approved audit withdrawal", approvalReference: "AUDIT" })
      let [rows] = await pool.query<RowDataPacket[]>("SELECT local_active FROM sections WHERE id = ?", [sectionId])
      assert(rows[0]?.local_active === 1, "Withdrawal incorrectly released its counted seat")
      await request(`/api/v1/staff/enrollments/${result.insertId}/withdraw`, admin, "POST", { reason: "Again", approvalReference: "AUDIT" }, 409)
      await request(`/api/v1/staff/enrollments/${result.insertId}/remove`, admin, "POST", { reason: "Audit cleanup" })
      ;[rows] = await pool.query<RowDataPacket[]>("SELECT local_active FROM sections WHERE id = ?", [sectionId])
      assert(rows[0]?.local_active === 0, "Removal failed to release the counted seat")
      await request(`/api/v1/staff/enrollments/${result.insertId}/remove`, admin, "POST", { reason: "Again" }, 409)
    })
    await check("catalog preview, changed bytes, stale preview, confirm and replay", async () => {
      const raw = JSON.stringify({ datasets: [{ academicYear: year, semester: 2, studyProgram: "S", courses: [{ courseNo: courseCode, courseNameEn: "Imported Audit", credit: 3, sections: [{ sectionNo: "1", capacity: 12 }] }] }] })
      const checksum = createHash("sha256").update(raw).digest("hex"); importChecksums.push(checksum)
      await request(`/api/v1/staff/catalog/import/confirm?checksum=${checksum}`, admin, "POST", raw, 409, true)
      const summary = (await request<{ courseCount: number; checksum: string }>("/api/v1/staff/catalog/import/preview", admin, "POST", raw, 200, true)).data
      assert(summary.courseCount === 1 && summary.checksum === checksum, "Preview failed")
      await request(`/api/v1/staff/catalog/import/confirm?checksum=${checksum}`, admin, "POST", ` ${raw}`, 409, true)
      await request(`/api/v1/staff/catalog/offerings/${offeringId}`, admin, "PATCH", { nameEn: "Concurrent Audit" })
      await request(`/api/v1/staff/catalog/import/confirm?checksum=${checksum}`, admin, "POST", raw, 409, true)
      await request("/api/v1/staff/catalog/import/preview", admin, "POST", raw, 200, true)
      const imported = (await request<{ courseCount: number }>(`/api/v1/staff/catalog/import/confirm?checksum=${checksum}`, admin, "POST", raw, 200, true)).data
      assert(imported.courseCount === 1, "Import did not persist")
      await request(`/api/v1/staff/catalog/import/confirm?checksum=${checksum}`, admin, "POST", raw, 409, true)
    })
    await check("audit records and logout revocation", async () => {
      const [events] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM staff_audit_events WHERE staff_id IN (?, ?)", [staff.admin.id, staff.advisor.id])
      assert(Number(events[0]?.total) >= 10, "Expected staff audit events were not persisted")
      await request("/api/v1/staff/auth/logout", advisor, "POST")
      await request("/api/v1/staff/auth/me", advisor, "GET", undefined, 401)
    })
    console.log(`[staff-check] ${passed} workflow groups passed; ${failures.length} failed`)
    await writeFile(resolve(import.meta.dir, "../tmp/staff-api-check-report.json"), JSON.stringify({
      checkedAt: new Date().toISOString(), requestCount, passed, failed: failures.length, results,
    }, null, 2))
    if (failures.length) process.exitCode = 1
  }
} finally {
  for (const cookie of studentCookies) await request("/api/v1/auth/logout", cookie, "POST")
  for (const nonce of challengeNonces) await pool.query("DELETE FROM auth_challenge_consumptions WHERE nonce = ?", [nonce])
  for (const id of studentIds) {
    await pool.query("DELETE e FROM registration_events e JOIN registrations r ON r.id = e.registration_id WHERE r.student_id = ?", [id])
    await pool.query("DELETE FROM registrations WHERE student_id = ?", [id])
    await pool.query("DELETE FROM student_term_states WHERE student_id = ?", [id])
    await pool.query("DELETE FROM student_preferences WHERE student_id = ?", [id])
    await pool.query("DELETE FROM students WHERE student_id = ?", [id])
  }
  for (const termId of termIds) {
    await pool.query("DELETE m FROM section_meetings m JOIN sections s ON s.id = m.section_id JOIN course_offerings o ON o.id = s.offering_id WHERE o.term_id = ?", [termId])
    await pool.query("DELETE s FROM sections s JOIN course_offerings o ON o.id = s.offering_id WHERE o.term_id = ?", [termId])
    await pool.query("DELETE FROM course_offerings WHERE term_id = ?", [termId])
    await pool.query("DELETE FROM academic_terms WHERE id = ?", [termId])
  }
  for (const code of courseCodes) await pool.query("DELETE FROM courses WHERE course_code = ?", [code])
  for (const checksum of importChecksums) await pool.query("DELETE FROM catalog_imports WHERE checksum = ?", [checksum])
  for (const id of staffIds) {
    await pool.query("DELETE FROM staff_audit_events WHERE staff_id = ?", [id])
    await pool.query("DELETE FROM staff_catalog_previews WHERE staff_id = ?", [id])
    if (!keepStaff || !credentials || ![credentials.admin.id, credentials.advisor.id].includes(id)) {
      await pool.query("DELETE FROM staff_users WHERE id = ?", [id])
    }
  }
  if (credentials && !keepStaff) await unlink(credentialPath)
  if (!cleanupOnly) {
    for (const id of studentIds) {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT student_id FROM students WHERE student_id = ?", [id])
      assert(!rows.length, "Student fixture remains after cleanup")
    }
    for (const id of termIds) {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM academic_terms WHERE id = ?", [id])
      assert(!rows.length, "Term fixture remains after cleanup")
    }
    for (const code of courseCodes) {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT course_code FROM courses WHERE course_code = ?", [code])
      assert(!rows.length, "Course fixture remains after cleanup")
    }
    console.log("[staff-check] Owned student, term, and course fixture cleanup verified")
  }
  closeSharedState()
  await closeDatabase()
}
