import { and, asc, eq } from "drizzle-orm"
import { Elysia, t } from "elysia"
import { db } from "../../db/client"
import {
  academicTerms,
  courseOfferings,
  courses,
  studentActivities,
  studentFavorites,
} from "../../db/schema"
import { originIsAllowed } from "../../shared/http"
import { appProblem } from "../../shared/problem"
import {
  sessionCookieSchema,
  touchStudentSession,
  type SessionCookieJar,
} from "../../shared/session"
import type { ActivityInputDto } from "../../public-types"

const termQuery = t.Object({
  termId: t.Numeric({ minimum: 1, maximum: 4294967295, multipleOf: 1 }),
})
const activityParams = t.Object({ id: t.String({ format: "uuid" }) })
const courseParams = t.Object({ courseCode: t.String({ minLength: 1, maxLength: 24 }) })
const activityBody = t.Object({
  title: t.String({ minLength: 1, maxLength: 100 }),
  dayCode: t.Union([
    t.Literal("MO"),
    t.Literal("TU"),
    t.Literal("WE"),
    t.Literal("TH"),
    t.Literal("FR"),
    t.Literal("SA"),
    t.Literal("SU"),
  ]),
  startMinute: t.Integer({ minimum: 0, maximum: 1439 }),
  endMinute: t.Integer({ minimum: 1, maximum: 1440 }),
})

export function validActivity(input: ActivityInputDto) {
  return (
    input.title.trim().length > 0 &&
    input.title.length <= 100 &&
    ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].includes(input.dayCode) &&
    Number.isInteger(input.startMinute) &&
    Number.isInteger(input.endMinute) &&
    input.startMinute >= 0 &&
    input.endMinute <= 1440 &&
    input.startMinute < input.endMinute
  )
}

async function authorize(cookie: SessionCookieJar, request: Request) {
  const session = await touchStudentSession(cookie)
  if (!session) return appProblem(request, 401, "AUTH_REQUIRED", "ต้องเข้าสู่ระบบ", "เข้าสู่ระบบก่อนใช้งาน")
  if (request.method !== "GET" && !originIsAllowed(request)) {
    return appProblem(request, 400, "ORIGIN_NOT_ALLOWED", "บันทึกไม่ได้", "คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต")
  }
  return session.studentId
}

async function termExists(termId: number) {
  const [term] = await db
    .select({ id: academicTerms.id })
    .from(academicTerms)
    .where(eq(academicTerms.id, termId))
    .limit(1)
  return Boolean(term)
}
const missingTerm = (request: Request) =>
  appProblem(request, 404, "TERM_NOT_FOUND", "ไม่พบภาคการศึกษา", "เลือกภาคการศึกษาอีกครั้ง")
const missingActivity = (request: Request) =>
  appProblem(request, 404, "ACTIVITY_NOT_FOUND", "ไม่พบกิจกรรม", "กิจกรรมอาจถูกลบแล้ว กรุณาโหลดใหม่")
const activityOwner = (studentId: string, termId: number, id?: string) =>
  and(
    eq(studentActivities.studentId, studentId),
    eq(studentActivities.termId, termId),
    id ? eq(studentActivities.id, id) : undefined,
  )
const activityFields = {
  id: studentActivities.id,
  termId: studentActivities.termId,
  title: studentActivities.title,
  dayCode: studentActivities.dayCode,
  startMinute: studentActivities.startMinute,
  endMinute: studentActivities.endMinute,
}

export const personalPlanningModule = new Elysia({ name: "personal-planning" })
  .get(
    "/api/v1/schedule/activities",
    { cookie: sessionCookieSchema, query: termQuery },
    async ({ cookie, request, query }) => {
      const owner = await authorize(cookie as SessionCookieJar, request)
      if (typeof owner !== "string") return owner
      if (!(await termExists(query.termId))) return missingTerm(request)
      return {
        data: await db
          .select(activityFields)
          .from(studentActivities)
          .where(activityOwner(owner, query.termId))
          .orderBy(
            asc(studentActivities.dayCode),
            asc(studentActivities.startMinute),
            asc(studentActivities.id),
          ),
      }
    },
  )
  .post(
    "/api/v1/schedule/activities",
    { cookie: sessionCookieSchema, query: termQuery, body: activityBody },
    async ({ cookie, request, query, body }) => {
      const owner = await authorize(cookie as SessionCookieJar, request)
      if (typeof owner !== "string") return owner
      if (!validActivity(body))
        return appProblem(
          request,
          400,
          "INVALID_ACTIVITY",
          "ข้อมูลกิจกรรมไม่ถูกต้อง",
          "ระบุชื่อและเวลาสิ้นสุดหลังเวลาเริ่มในวันเดียวกัน",
        )
      if (!(await termExists(query.termId))) return missingTerm(request)
      const activity = {
        ...body,
        title: body.title.trim(),
        id: crypto.randomUUID(),
        termId: query.termId,
      }
      await db.insert(studentActivities).values({ ...activity, studentId: owner })
      return { data: activity }
    },
  )
  .put(
    "/api/v1/schedule/activities/:id",
    { cookie: sessionCookieSchema, query: termQuery, params: activityParams, body: activityBody },
    async ({ cookie, request, query, params, body }) => {
      const owner = await authorize(cookie as SessionCookieJar, request)
      if (typeof owner !== "string") return owner
      if (!validActivity(body))
        return appProblem(
          request,
          400,
          "INVALID_ACTIVITY",
          "ข้อมูลกิจกรรมไม่ถูกต้อง",
          "ระบุชื่อและเวลาสิ้นสุดหลังเวลาเริ่มในวันเดียวกัน",
        )
      const where = activityOwner(owner, query.termId, params.id)
      const [existing] = await db
        .select({ id: studentActivities.id })
        .from(studentActivities)
        .where(where)
        .limit(1)
      if (!existing) return missingActivity(request)
      const activity = { ...body, title: body.title.trim() }
      await db.update(studentActivities).set(activity).where(where)
      return { data: { ...activity, id: params.id, termId: query.termId } }
    },
  )
  .delete(
    "/api/v1/schedule/activities/:id",
    { cookie: sessionCookieSchema, query: termQuery, params: activityParams },
    async ({ cookie, request, query, params }) => {
      const owner = await authorize(cookie as SessionCookieJar, request)
      if (typeof owner !== "string") return owner
      const [result] = await db
        .delete(studentActivities)
        .where(activityOwner(owner, query.termId, params.id))
      if (result.affectedRows === 0) return missingActivity(request)
      return { data: { id: params.id } }
    },
  )
  .get(
    "/api/v1/favorites",
    { cookie: sessionCookieSchema, query: termQuery },
    async ({ cookie, request, query }) => {
      const owner = await authorize(cookie as SessionCookieJar, request)
      if (typeof owner !== "string") return owner
      if (!(await termExists(query.termId))) return missingTerm(request)
      const rows = await db
        .select({
          courseCode: studentFavorites.courseCode,
          nameTh: courseOfferings.nameTh,
          nameEn: courseOfferings.nameEn,
          offeringId: courseOfferings.id,
        })
        .from(studentFavorites)
        .leftJoin(
          courseOfferings,
          and(
            eq(courseOfferings.courseCode, studentFavorites.courseCode),
            eq(courseOfferings.termId, query.termId),
            eq(courseOfferings.active, true),
          ),
        )
        .where(eq(studentFavorites.studentId, owner))
        .orderBy(asc(studentFavorites.courseCode))
      return {
        data: rows.map(({ offeringId, ...row }) => ({ ...row, offered: offeringId !== null })),
      }
    },
  )
  .put(
    "/api/v1/favorites/:courseCode",
    { cookie: sessionCookieSchema, params: courseParams },
    async ({ cookie, request, params }) => {
      const owner = await authorize(cookie as SessionCookieJar, request)
      if (typeof owner !== "string") return owner
      const courseCode = params.courseCode.trim().toUpperCase()
      const [course] = await db
        .select({ courseCode: courses.courseCode })
        .from(courses)
        .where(eq(courses.courseCode, courseCode))
        .limit(1)
      if (!course)
        return appProblem(request, 404, "COURSE_NOT_FOUND", "ไม่พบรายวิชา", "เลือกรายวิชาจากผลการค้นหา")
      await db
        .insert(studentFavorites)
        .values({ studentId: owner, courseCode })
        .onDuplicateKeyUpdate({ set: { courseCode } })
      return { data: { courseCode } }
    },
  )
  .delete(
    "/api/v1/favorites/:courseCode",
    { cookie: sessionCookieSchema, params: courseParams },
    async ({ cookie, request, params }) => {
      const owner = await authorize(cookie as SessionCookieJar, request)
      if (typeof owner !== "string") return owner
      const courseCode = params.courseCode.trim().toUpperCase()
      await db
        .delete(studentFavorites)
        .where(
          and(eq(studentFavorites.studentId, owner), eq(studentFavorites.courseCode, courseCode)),
        )
      return { data: { courseCode } }
    },
  )
