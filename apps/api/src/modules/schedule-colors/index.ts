import {
  SCHEDULE_COLOR_IDS,
  type ScheduleColorId,
} from "../../../../../packages/appearance/src/index.ts"
import { and, eq } from "drizzle-orm"
import { Elysia, t } from "elysia"
import { db } from "../../db/client"
import { studentScheduleColors } from "../../db/schema"
import { originIsAllowed } from "../../shared/http"
import { appProblem } from "../../shared/problem"
import {
  sessionCookieSchema,
  touchStudentSession,
  type SessionCookieJar,
} from "../../shared/session"
import { listRegistrations } from "../registration/service"

const studentOrProblem = async (cookie: SessionCookieJar, request: Request) =>
  (await touchStudentSession(cookie))?.studentId ??
  appProblem(request, 401, "AUTH_REQUIRED", "ต้องเข้าสู่ระบบ", "เข้าสู่ระบบด้วยรหัสนิสิตก่อนใช้งาน")

const colorSchema = t.Union([
  t.Literal("rose"),
  t.Literal("orange"),
  t.Literal("amber"),
  t.Literal("green"),
  t.Literal("teal"),
  t.Literal("blue"),
  t.Literal("indigo"),
  t.Literal("violet"),
])

async function contextFor(studentId: string) {
  const registrations = await listRegistrations(studentId)
  const value = Number(registrations.term?.id)
  const termId = Number.isSafeInteger(value) && value > 0 ? value : null
  return {
    termId,
    courseCodes: new Set(
      registrations.registrations
        .filter((registration) => registration.status === "active")
        .map((registration) => registration.courseCode),
    ),
  }
}

const canonicalCourseCode = (value: string) => value.trim().toUpperCase()

export const scheduleColorsModule = new Elysia({ name: "schedule-colors" })
  .get(
    "/api/v1/schedule/colors",
    {
      cookie: sessionCookieSchema,
      detail: { tags: ["Schedule"], summary: "Student course colors for the current term" },
    },
    async ({ cookie, request }) => {
      const studentId = await studentOrProblem(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      const context = await contextFor(studentId)
      if (context.termId === null) return { data: { termId: null, colors: [] } }
      const rows = await db
        .select({
          courseCode: studentScheduleColors.courseCode,
          colorId: studentScheduleColors.colorId,
        })
        .from(studentScheduleColors)
        .where(
          and(
            eq(studentScheduleColors.studentId, studentId),
            eq(studentScheduleColors.termId, context.termId),
          ),
        )
      return {
        data: {
          termId: context.termId,
          colors: rows.filter((row) => context.courseCodes.has(row.courseCode)),
        },
      }
    },
  )
  .put(
    "/api/v1/schedule/colors/:courseCode",
    {
      cookie: sessionCookieSchema,
      params: t.Object({ courseCode: t.String({ minLength: 1, maxLength: 24 }) }),
      body: t.Object({ colorId: colorSchema }),
      detail: { tags: ["Schedule"], summary: "Set a current course color" },
    },
    async ({ body, cookie, params, request }) => {
      const studentId = await studentOrProblem(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      if (!originIsAllowed(request)) {
        return appProblem(
          request,
          400,
          "ORIGIN_NOT_ALLOWED",
          "บันทึกสีไม่ได้",
          "คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต",
        )
      }
      const courseCode = canonicalCourseCode(params.courseCode)
      const context = await contextFor(studentId)
      if (context.termId === null || !context.courseCodes.has(courseCode)) {
        return appProblem(
          request,
          404,
          "COURSE_NOT_FOUND",
          "ไม่พบรายวิชา",
          "เลือกสีได้เฉพาะรายวิชาที่ลงทะเบียนอยู่",
        )
      }
      const colorId = body.colorId as ScheduleColorId
      if (!SCHEDULE_COLOR_IDS.includes(colorId)) {
        return appProblem(request, 400, "INVALID_COLOR", "บันทึกสีไม่ได้", "เลือกสีจากชุดสีของตาราง")
      }
      const values = { studentId, termId: context.termId, courseCode, colorId }
      await db
        .insert(studentScheduleColors)
        .values(values)
        .onDuplicateKeyUpdate({ set: { colorId } })
      return { data: { courseCode, colorId } }
    },
  )
  .delete(
    "/api/v1/schedule/colors/:courseCode",
    {
      cookie: sessionCookieSchema,
      params: t.Object({ courseCode: t.String({ minLength: 1, maxLength: 24 }) }),
      detail: { tags: ["Schedule"], summary: "Reset a current course color" },
    },
    async ({ cookie, params, request }) => {
      const studentId = await studentOrProblem(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      if (!originIsAllowed(request)) {
        return appProblem(
          request,
          400,
          "ORIGIN_NOT_ALLOWED",
          "คืนค่าสีไม่ได้",
          "คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต",
        )
      }
      const courseCode = canonicalCourseCode(params.courseCode)
      const context = await contextFor(studentId)
      if (context.termId === null || !context.courseCodes.has(courseCode)) {
        return appProblem(
          request,
          404,
          "COURSE_NOT_FOUND",
          "ไม่พบรายวิชา",
          "คืนค่าสีได้เฉพาะรายวิชาที่ลงทะเบียนอยู่",
        )
      }
      await db
        .delete(studentScheduleColors)
        .where(
          and(
            eq(studentScheduleColors.studentId, studentId),
            eq(studentScheduleColors.termId, context.termId),
            eq(studentScheduleColors.courseCode, courseCode),
          ),
        )
      return { data: { courseCode } }
    },
  )
