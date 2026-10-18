import { Elysia } from "elysia"
import { appProblem } from "../../shared/problem"
import {
  sessionCookieSchema,
  touchStudentSession,
  type SessionCookieJar,
} from "../../shared/session"
import { listCurrentExams } from "./service"

const studentOrProblem = async (cookie: SessionCookieJar, request: Request) =>
  (await touchStudentSession(cookie))?.studentId ??
  appProblem(request, 401, "AUTH_REQUIRED", "ต้องเข้าสู่ระบบ", "เข้าสู่ระบบด้วยรหัสนิสิตก่อนใช้งาน")

export const examsModule = new Elysia({ name: "exams" }).get(
  "/api/v1/exams",
  {
    cookie: sessionCookieSchema,
    detail: { tags: ["Exams"], summary: "Current student exam schedule" },
  },
  async ({ cookie, request }) => {
    const studentId = await studentOrProblem(cookie as SessionCookieJar, request)
    if (typeof studentId !== "string") return studentId
    return { data: await listCurrentExams(studentId) }
  },
)
