import { Elysia, t } from "elysia"
import { appProblem } from "../../shared/problem"
import { validateExamSearch } from "./cache"
import {
  sessionCookieSchema,
  touchStudentSession,
  type SessionCookieJar,
} from "../../shared/session"
import { catalogOptions, courseDetail, listTerms, reviewsForCourse, searchCourses } from "./service"

const termQuery = {
  academicYear: t.Optional(t.Numeric({ minimum: 1 })),
  semester: t.Optional(t.Numeric({ minimum: 1, maximum: 3 })),
}

const examSlot = (date: string | null, startMinute: number | null, endMinute: number | null) =>
  date === null || startMinute === null || endMinute === null
    ? null
    : { date, startMinute, endMinute }

const requireSession = async (cookie: SessionCookieJar, request: Request) => {
  const session = await touchStudentSession(cookie)
  const studentId = session?.studentId
  return (
    studentId ??
    appProblem(request, 401, "AUTH_REQUIRED", "ต้องเข้าสู่ระบบ", "เข้าสู่ระบบด้วยรหัสนิสิตก่อนใช้งาน")
  )
}

export const catalogModule = new Elysia({ name: "catalog" })
  .get(
    "/api/v1/terms",
    { cookie: sessionCookieSchema, detail: { tags: ["Catalog"], summary: "List terms" } },
    async ({ cookie, request }) => {
      const auth = await requireSession(cookie as SessionCookieJar, request)
      if (typeof auth !== "string") return auth
      return { data: await listTerms() }
    },
  )
  .get(
    "/api/v1/catalog/options",
    {
      cookie: sessionCookieSchema,
      query: t.Object(termQuery),
      detail: { tags: ["Catalog"], summary: "Course filter options" },
    },
    async ({ cookie, query, request }) => {
      const auth = await requireSession(cookie as SessionCookieJar, request)
      if (typeof auth !== "string") return auth
      const data = await catalogOptions(query)
      return (
        data ??
        appProblem(
          request,
          404,
          "TERM_NOT_FOUND",
          "ไม่พบภาคการศึกษา",
          "เลือกปีการศึกษาและภาคการศึกษาที่นำเข้าแล้ว",
        )
      )
    },
  )
  .get(
    "/api/v1/courses",
    {
      cookie: sessionCookieSchema,
      query: t.Object({
        ...termQuery,
        q: t.Optional(t.String({ maxLength: 100 })),
        faculty: t.Optional(t.String({ maxLength: 255 })),
        faculties: t.Optional(t.String({ maxLength: 1_000 })),
        department: t.Optional(t.String({ maxLength: 255 })),
        departments: t.Optional(t.String({ maxLength: 2_000 })),
        genEdTypes: t.Optional(t.String({ maxLength: 64 })),
        courseGroup: t.Optional(t.Union([t.Literal("general"), t.Literal("other")])),
        day: t.Optional(
          t.Union([
            t.Literal("MO"),
            t.Literal("TU"),
            t.Literal("WE"),
            t.Literal("TH"),
            t.Literal("FR"),
            t.Literal("SA"),
            t.Literal("SU"),
          ]),
        ),
        days: t.Optional(t.String({ maxLength: 64 })),
        examDays: t.Optional(t.String({ maxLength: 64 })),
        examStartTime: t.Optional(t.String({ maxLength: 5 })),
        examEndTime: t.Optional(t.String({ maxLength: 5 })),
        startTime: t.Optional(t.String({ pattern: "^\\d{1,2}:\\d{2}$" })),
        endTime: t.Optional(t.String({ pattern: "^\\d{1,2}:\\d{2}$" })),
        credits: t.Optional(t.Numeric({ minimum: 0, maximum: 99 })),
        minCredits: t.Optional(t.Numeric({ minimum: 0, maximum: 99 })),
        maxCredits: t.Optional(t.Numeric({ minimum: 0, maximum: 99 })),
        page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
        pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 50, default: 20 })),
        mode: t.Optional(t.Literal("autocomplete")),
      }),
      detail: { tags: ["Catalog"], summary: "Search term course offerings" },
    },
    async ({ cookie, query, request }) => {
      const auth = await requireSession(cookie as SessionCookieJar, request)
      if (typeof auth !== "string") return auth
      const examError = validateExamSearch(query)
      if (examError) {
        return appProblem(request, 422, "INVALID_EXAM_FILTER", "Invalid exam filter", examError)
      }
      const data = await searchCourses({
        ...query,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      })
      return (
        (data && {
          data: data.items,
          meta: {
            term: data.term,
            page: data.page,
            pageSize: data.pageSize,
            total: data.total,
            totalPages: data.totalPages,
          },
        }) ??
        appProblem(
          request,
          404,
          "TERM_NOT_FOUND",
          "ไม่พบภาคการศึกษา",
          "เลือกปีการศึกษาและภาคการศึกษาที่นำเข้าแล้ว",
        )
      )
    },
  )
  .get(
    "/api/v1/courses/:courseCode",
    {
      cookie: sessionCookieSchema,
      params: t.Object({ courseCode: t.String({ minLength: 1, maxLength: 24 }) }),
      query: t.Object(termQuery),
      detail: { tags: ["Catalog"], summary: "Course and section details" },
    },
    async ({ cookie, params, query, request }) => {
      const auth = await requireSession(cookie as SessionCookieJar, request)
      if (typeof auth !== "string") return auth
      const data = await courseDetail(params.courseCode, query)
      return (
        (data && {
          data: {
            ...data,
            offering: {
              ...data.offering,
              midterm: examSlot(
                data.offering.midtermDate,
                data.offering.midtermStartMinute,
                data.offering.midtermEndMinute,
              ),
              final: examSlot(
                data.offering.finalDate,
                data.offering.finalStartMinute,
                data.offering.finalEndMinute,
              ),
            },
          },
        }) ??
        appProblem(
          request,
          404,
          "COURSE_NOT_FOUND",
          "ไม่พบรายวิชา",
          "ตรวจสอบรหัสวิชาและภาคการศึกษาแล้วลองอีกครั้ง",
        )
      )
    },
  )
  .get(
    "/api/v1/courses/:courseCode/reviews",
    {
      cookie: sessionCookieSchema,
      params: t.Object({ courseCode: t.String({ minLength: 1, maxLength: 24 }) }),
      query: t.Object({
        ...termQuery,
        page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
        pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 50, default: 20 })),
      }),
      detail: { tags: ["Catalog"], summary: "Approved course reviews" },
    },
    async ({ cookie, params, query, request }) => {
      const auth = await requireSession(cookie as SessionCookieJar, request)
      if (typeof auth !== "string") return auth
      const data = await reviewsForCourse(
        params.courseCode,
        query,
        query.page ?? 1,
        query.pageSize ?? 20,
      )
      return (
        (data && { data: data.items, meta: data }) ??
        appProblem(
          request,
          404,
          "TERM_NOT_FOUND",
          "ไม่พบภาคการศึกษา",
          "เลือกปีการศึกษาและภาคการศึกษาที่นำเข้าแล้ว",
        )
      )
    },
  )
