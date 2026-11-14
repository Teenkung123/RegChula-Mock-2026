import { and, eq, like, sql } from "drizzle-orm"
import { Elysia, t } from "elysia"
import type { RowDataPacket } from "mysql2/promise"
import { db } from "../../db/client"
import { studentCredentials, students } from "../../db/schema"
import { staffAuditEvents, staffSessions, staffUsers, studentAdvisors } from "../../db/schema/staff"
import { runTransaction } from "../../db/transaction"
import { appProblem } from "../../shared/problem"
import { revokeStudentSessions } from "../../shared/session-store"
import { requireStaff, type StaffCookieJar, staffCookieSchema } from "./auth"

const publicUser = {
  id: staffUsers.id,
  username: staffUsers.username,
  displayName: staffUsers.displayName,
  role: staffUsers.role,
  active: staffUsers.active,
}
const idParam = t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) })

export function isDuplicateStaffUsername(error: unknown): boolean {
  let current = error
  for (let depth = 0; depth < 4; depth++) {
    if (!current || typeof current !== "object") return false
    const candidate = current as { code?: unknown; cause?: unknown }
    if (candidate.code === "ER_DUP_ENTRY") return true
    current = candidate.cause
  }
  return false
}

export const staffAccountsModule = new Elysia({ name: "staff-accounts" })
  .get("/api/v1/staff/accounts", { cookie: staffCookieSchema }, async ({ cookie, request }) => {
    const user = await requireStaff(cookie as StaffCookieJar, request, "admin")
    if (user instanceof Response) return user
    return {
      data: await db
        .select(publicUser)
        .from(staffUsers)
        .orderBy(staffUsers.displayName)
        .limit(1000),
    }
  })
  .post(
    "/api/v1/staff/accounts",
    {
      cookie: staffCookieSchema,
      body: t.Object({
        username: t.String({ minLength: 1, maxLength: 100 }),
        displayName: t.String({ minLength: 1, maxLength: 200 }),
        password: t.String({ minLength: 8, maxLength: 128 }),
        role: t.Union([t.Literal("admin"), t.Literal("advisor")]),
      }),
    },
    async ({ cookie, body, request }) => {
      const user = await requireStaff(cookie as StaffCookieJar, request, "admin")
      if (user instanceof Response) return user
      const username = body.username.trim().toLowerCase()
      const displayName = body.displayName.trim()
      if (!username || !displayName)
        return appProblem(
          request,
          400,
          "INVALID_ACCOUNT",
          "Invalid account",
          "Enter a username and name.",
        )
      const [existing] = await db
        .select({ id: staffUsers.id })
        .from(staffUsers)
        .where(eq(staffUsers.username, username))
        .limit(1)
      if (existing)
        return appProblem(
          request,
          409,
          "USERNAME_IN_USE",
          "Username already in use",
          "Choose a different username.",
        )
      const id = crypto.randomUUID()
      try {
        const passwordHash = await Bun.password.hash(body.password)
        await db.transaction(async (tx) => {
          await tx
            .insert(staffUsers)
            .values({ id, username, displayName, role: body.role, passwordHash })
          await tx.insert(staffAuditEvents).values({
            staffId: user.id,
            action: "staff.created",
            target: id,
            details: { username, role: body.role },
          })
        })
      } catch (error) {
        if (isDuplicateStaffUsername(error))
          return appProblem(
            request,
            409,
            "USERNAME_IN_USE",
            "Username already in use",
            "Choose a different username.",
          )
        throw error
      }
      return { data: { id, username, displayName, role: body.role, active: true } }
    },
  )
  .patch(
    "/api/v1/staff/accounts/:id",
    {
      cookie: staffCookieSchema,
      params: idParam,
      body: t.Object({
        displayName: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        password: t.Optional(t.String({ minLength: 8, maxLength: 128 })),
        role: t.Optional(t.Union([t.Literal("admin"), t.Literal("advisor")])),
        active: t.Optional(t.Boolean()),
      }),
    },
    async ({ cookie, body, params, request }) => {
      const user = await requireStaff(cookie as StaffCookieJar, request, "admin")
      if (user instanceof Response) return user
      const [target] = await db
        .select()
        .from(staffUsers)
        .where(eq(staffUsers.id, params.id))
        .limit(1)
      if (!target)
        return appProblem(
          request,
          404,
          "STAFF_NOT_FOUND",
          "Account not found",
          "Select an existing account.",
        )
      if (target.username === "administrator" && (body.active === false || body.role === "advisor"))
        return appProblem(
          request,
          409,
          "ADMINISTRATOR_REQUIRED",
          "Administrator required",
          "The initial administrator account must remain active.",
        )
      const displayName = body.displayName?.trim()
      if (body.displayName !== undefined && !displayName)
        return appProblem(request, 400, "INVALID_ACCOUNT", "Invalid account", "Enter a name.")
      if (
        body.displayName === undefined &&
        body.password === undefined &&
        body.active === undefined &&
        body.role === undefined
      )
        return appProblem(
          request,
          400,
          "INVALID_ACCOUNT",
          "No changes",
          "Select a field to change.",
        )
      const passwordHash = body.password ? await Bun.password.hash(body.password) : undefined
      await db.transaction(async (tx) => {
        await tx
          .update(staffUsers)
          .set({
            ...(displayName !== undefined ? { displayName } : {}),
            ...(body.active !== undefined ? { active: body.active } : {}),
            ...(body.role !== undefined ? { role: body.role } : {}),
            ...(passwordHash ? { passwordHash } : {}),
          })
          .where(eq(staffUsers.id, params.id))
        if (
          passwordHash ||
          body.active === false ||
          (body.role !== undefined && body.role !== target.role)
        )
          await tx.delete(staffSessions).where(eq(staffSessions.staffId, params.id))
        await tx.insert(staffAuditEvents).values({
          staffId: user.id,
          action: "staff.updated",
          target: target.id,
          details: {
            ...(displayName !== undefined ? { displayName } : {}),
            ...(body.active !== undefined ? { active: body.active } : {}),
            ...(body.role !== undefined ? { role: body.role } : {}),
            passwordReset: Boolean(passwordHash),
          },
        })
      })
      return {
        data: {
          id: target.id,
          username: target.username,
          displayName: displayName ?? target.displayName,
          role: body.role ?? target.role,
          active: body.active ?? target.active,
        },
      }
    },
  )
  .get(
    "/api/v1/staff/students",
    {
      cookie: staffCookieSchema,
      query: t.Object({ q: t.Optional(t.String({ maxLength: 32 })) }),
    },
    async ({ cookie, query, request }) => {
      const user = await requireStaff(cookie as StaffCookieJar, request)
      if (user instanceof Response) return user
      const q = query.q?.trim() ?? ""
      const condition = and(
        q
          ? like(students.studentId, `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`)
          : undefined,
        user.role === "advisor" ? eq(studentAdvisors.staffId, user.id) : undefined,
      )
      return {
        data: await db
          .select({
            studentId: students.studentId,
            active: studentCredentials.active,
            advisorId: studentAdvisors.staffId,
            advisorName: staffUsers.displayName,
          })
          .from(students)
          .leftJoin(studentCredentials, eq(studentCredentials.studentId, students.studentId))
          .leftJoin(studentAdvisors, eq(studentAdvisors.studentId, students.studentId))
          .leftJoin(staffUsers, eq(staffUsers.id, studentAdvisors.staffId))
          .where(condition)
          .orderBy(students.studentId)
          .limit(100),
      }
    },
  )
  .patch(
    "/api/v1/staff/students/:studentId",
    {
      cookie: staffCookieSchema,
      params: t.Object({ studentId: t.String({ pattern: "^\\d{10}$" }) }),
      body: t.Object({
        active: t.Optional(t.Boolean()),
        resetPassword: t.Optional(t.Literal(true)),
      }),
    },
    async ({ cookie, body, params, request }) => {
      const user = await requireStaff(cookie as StaffCookieJar, request, "admin")
      if (user instanceof Response) return user
      if (body.active === undefined && !body.resetPassword)
        return appProblem(
          request,
          400,
          "INVALID_ACCOUNT",
          "No changes",
          "Select a field to change.",
        )
      const passwordHash = body.resetPassword ? await Bun.password.hash("12345678") : null
      const changed = await runTransaction(async (connection) => {
        const [rows] = await connection.query<RowDataPacket[]>(
          "SELECT student_id FROM student_credentials WHERE student_id = ? FOR UPDATE",
          [params.studentId],
        )
        if (!rows.length) return { commit: false, value: false }
        if (body.active !== undefined)
          await connection.execute(
            "UPDATE student_credentials SET active = ? WHERE student_id = ?",
            [body.active, params.studentId],
          )
        if (passwordHash)
          await connection.execute(
            "UPDATE student_credentials SET password_hash = ? WHERE student_id = ?",
            [passwordHash, params.studentId],
          )
        if (body.active === false || passwordHash)
          await revokeStudentSessions(connection, params.studentId)
        await connection.execute(
          "INSERT INTO staff_audit_events (staff_id, action, target, details) VALUES (?, ?, ?, ?)",
          [
            user.id,
            "student.updated",
            params.studentId,
            JSON.stringify({ active: body.active, passwordReset: Boolean(passwordHash) }),
          ],
        )
        return { commit: true, value: true }
      })
      if (!changed)
        return appProblem(
          request,
          404,
          "STUDENT_NOT_FOUND",
          "Student not found",
          "Select an existing student account.",
        )
      return {
        data: {
          studentId: params.studentId,
          active: body.active,
          passwordReset: Boolean(passwordHash),
        },
      }
    },
  )
  .put(
    "/api/v1/staff/students/:studentId/advisor",
    {
      cookie: staffCookieSchema,
      params: t.Object({ studentId: t.String({ pattern: "^\\d{10}$" }) }),
      body: t.Object({
        advisorId: t.Union([t.String({ minLength: 36, maxLength: 36 }), t.Null()]),
      }),
    },
    async ({ cookie, body, params, request }) => {
      const user = await requireStaff(cookie as StaffCookieJar, request, "admin")
      if (user instanceof Response) return user
      const [student] = await db
        .select({ studentId: students.studentId })
        .from(students)
        .where(eq(students.studentId, params.studentId))
        .limit(1)
      if (!student)
        return appProblem(
          request,
          404,
          "STUDENT_NOT_FOUND",
          "Student not found",
          "Select an existing student.",
        )
      if (body.advisorId) {
        const [advisor] = await db
          .select({ id: staffUsers.id })
          .from(staffUsers)
          .where(
            and(
              eq(staffUsers.id, body.advisorId),
              eq(staffUsers.role, "advisor"),
              eq(staffUsers.active, true),
            ),
          )
          .limit(1)
        if (!advisor)
          return appProblem(
            request,
            404,
            "ADVISOR_NOT_FOUND",
            "Advisor not found",
            "Select an active advisor.",
          )
      }
      await db.transaction(async (tx) => {
        const [previous] = await tx
          .select({ staffId: studentAdvisors.staffId })
          .from(studentAdvisors)
          .where(eq(studentAdvisors.studentId, student.studentId))
          .for("update")
        if ((previous?.staffId ?? null) === body.advisorId) return
        await tx.execute(
          sql`DELETE FROM registration_access_codes WHERE student_id = ${student.studentId}`,
        )
        await tx.execute(
          sql`DELETE FROM registration_access_grants WHERE student_id = ${student.studentId}`,
        )
        if (body.advisorId)
          await tx
            .insert(studentAdvisors)
            .values({ studentId: student.studentId, staffId: body.advisorId })
            .onDuplicateKeyUpdate({ set: { staffId: body.advisorId } })
        else
          await tx.delete(studentAdvisors).where(eq(studentAdvisors.studentId, student.studentId))
        await tx.insert(staffAuditEvents).values({
          staffId: user.id,
          action: "advisor.assigned",
          target: student.studentId,
          details: { advisorId: body.advisorId },
        })
      })
      return { data: { studentId: student.studentId, advisorId: body.advisorId } }
    },
  )
