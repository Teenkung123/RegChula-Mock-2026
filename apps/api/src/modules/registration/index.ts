import { Elysia, t } from "elysia"
import { originIsAllowed } from "../../shared/http"
import { appProblem } from "../../shared/problem"
import {
  sessionCookieSchema,
  touchStudentSession,
  type SessionCookieJar,
} from "../../shared/session"
import { renderWithdrawalPdf } from "../withdrawal/pdf"
import {
  batchDropPreview,
  commitBatchDrop,
  withdrawalForStudent,
  withdrawalFormData,
  withdrawalFormPreview,
} from "./actions"
import {
  commitRegistration,
  commitRegistrationBatch,
  listRegistrations,
  registrationBatchPreview,
  registrationPreview,
  type ServiceResult,
} from "./service"

const requireStudent = async (cookie: SessionCookieJar, request: Request) =>
  (await touchStudentSession(cookie))?.studentId ??
  appProblem(request, 401, "AUTH_REQUIRED", "ต้องเข้าสู่ระบบ", "เข้าสู่ระบบด้วยรหัสนิสิตก่อนใช้งาน")

const responseOf = <T>(request: Request, result: ServiceResult<T>) =>
  result.ok
    ? { data: result.data }
    : appProblem(request, result.status, result.code, result.title, result.detail, result.details)

const mutationAllowed = (request: Request) =>
  originIsAllowed(request)
    ? null
    : appProblem(request, 400, "ORIGIN_NOT_ALLOWED", "ดำเนินการไม่ได้", "คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต")

const idempotencyHeaders = t.Object({
  "idempotency-key": t.String({ minLength: 8, maxLength: 128 }),
})

const withdrawalSelection = t.Object({
  registrationId: t.Numeric({ minimum: 1 }),
  reason: t.String({ minLength: 1, maxLength: 1_000 }),
})

const registrationChoice = t.Object({
  sectionId: t.Numeric({ minimum: 1 }),
  alternateSectionId: t.Optional(t.Numeric({ minimum: 1 })),
})

export const registrationModule = new Elysia({ name: "registration" })
  .get(
    "/api/v1/registrations",
    {
      cookie: sessionCookieSchema,
      detail: { tags: ["Registration"], summary: "Current student registrations" },
    },
    async ({ cookie, request }) => {
      const studentId = await requireStudent(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      return { data: await listRegistrations(studentId) }
    },
  )
  .post(
    "/api/v1/registrations/preview",
    {
      cookie: sessionCookieSchema,
      body: t.Object({
        sectionId: t.Numeric({ minimum: 1 }),
        allowAdvisoryOverride: t.Optional(t.Boolean()),
      }),
      detail: { tags: ["Registration"], summary: "Preview registration rules" },
    },
    async ({ body, cookie, request }) => {
      const studentId = await requireStudent(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      const originProblem = mutationAllowed(request)
      if (originProblem) return originProblem
      return responseOf(
        request,
        await registrationPreview(studentId, body.sectionId, body.allowAdvisoryOverride === true),
      )
    },
  )
  .post(
    "/api/v1/registrations/batch-preview",
    {
      cookie: sessionCookieSchema,
      body: t.Object({
        choices: t.Array(registrationChoice, { minItems: 1, maxItems: 20 }),
        allowAdvisoryOverride: t.Optional(t.Boolean()),
      }),
      detail: { tags: ["Registration"], summary: "Preview a combined registration draft" },
    },
    async ({ body, cookie, request }) => {
      const studentId = await requireStudent(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      const originProblem = mutationAllowed(request)
      if (originProblem) return originProblem
      return responseOf(
        request,
        await registrationBatchPreview(
          studentId,
          body.choices,
          body.allowAdvisoryOverride === true,
        ),
      )
    },
  )
  .post(
    "/api/v1/registrations/batch",
    {
      cookie: sessionCookieSchema,
      headers: idempotencyHeaders,
      body: t.Object({ confirmationToken: t.String({ minLength: 20, maxLength: 4_096 }) }),
      detail: { tags: ["Registration"], summary: "Confirm a combined registration draft" },
    },
    async ({ body, cookie, headers, request }) => {
      const studentId = await requireStudent(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      const originProblem = mutationAllowed(request)
      if (originProblem) return originProblem
      return responseOf(
        request,
        await commitRegistrationBatch(
          studentId,
          body.confirmationToken,
          headers["idempotency-key"],
        ),
      )
    },
  )
  .post(
    "/api/v1/registrations",
    {
      cookie: sessionCookieSchema,
      headers: idempotencyHeaders,
      body: t.Object({ confirmationToken: t.String({ minLength: 20, maxLength: 4_096 }) }),
      detail: { tags: ["Registration"], summary: "Confirm registration" },
    },
    async ({ body, cookie, headers, request }) => {
      const studentId = await requireStudent(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      const originProblem = mutationAllowed(request)
      if (originProblem) return originProblem
      return responseOf(
        request,
        await commitRegistration(studentId, body.confirmationToken, headers["idempotency-key"]),
      )
    },
  )
  .post(
    "/api/v1/registrations/drop-preview",
    {
      cookie: sessionCookieSchema,
      body: t.Object({
        registrationIds: t.Array(t.Numeric({ minimum: 1 }), { minItems: 1, maxItems: 20 }),
      }),
      detail: { tags: ["Registration"], summary: "Preview batch course drop" },
    },
    async ({ body, cookie, request }) => {
      const studentId = await requireStudent(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      const originProblem = mutationAllowed(request)
      if (originProblem) return originProblem
      return responseOf(request, await batchDropPreview(studentId, body.registrationIds))
    },
  )
  .post(
    "/api/v1/registrations/drop",
    {
      cookie: sessionCookieSchema,
      headers: idempotencyHeaders,
      body: t.Object({ confirmationToken: t.String({ minLength: 20, maxLength: 4_096 }) }),
      detail: { tags: ["Registration"], summary: "Confirm batch course drop" },
    },
    async ({ body, cookie, headers, request }) => {
      const studentId = await requireStudent(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      const originProblem = mutationAllowed(request)
      if (originProblem) return originProblem
      return responseOf(
        request,
        await commitBatchDrop(studentId, body.confirmationToken, headers["idempotency-key"]),
      )
    },
  )
  .post(
    "/api/v1/withdrawals/preview",
    {
      cookie: sessionCookieSchema,
      body: t.Object({
        selections: t.Array(withdrawalSelection, { minItems: 1, maxItems: 20 }),
      }),
      detail: { tags: ["Withdrawal"], summary: "Preview printable withdrawal form" },
    },
    async ({ body, cookie, request }) => {
      const studentId = await requireStudent(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      const originProblem = mutationAllowed(request)
      if (originProblem) return originProblem
      return responseOf(request, await withdrawalFormPreview(studentId, body.selections))
    },
  )
  .post(
    "/api/v1/withdrawals/form",
    {
      cookie: sessionCookieSchema,
      body: t.Object({ confirmationToken: t.String({ minLength: 20, maxLength: 4_096 }) }),
      detail: {
        tags: ["Withdrawal"],
        summary: "Generate printable withdrawal form without changing enrollment",
      },
    },
    async ({ body, cookie, request }) => {
      const studentId = await requireStudent(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      const originProblem = mutationAllowed(request)
      if (originProblem) return originProblem
      const form = await withdrawalFormData(studentId, body.confirmationToken)
      if (!form.ok) return responseOf(request, form)
      const pdf = await renderWithdrawalPdf(form.data.formId, form.data.snapshot)
      return new Response(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'inline; filename="withdrawal-form-' + form.data.formId + '.pdf"',
          "cache-control": "private, no-store",
        },
      })
    },
  )
  .get(
    "/api/v1/withdrawals/:id/pdf",
    {
      cookie: sessionCookieSchema,
      params: t.Object({ id: t.String({ minLength: 1, maxLength: 36 }) }),
      query: t.Object({ download: t.Optional(t.String()) }),
      detail: {
        tags: ["Withdrawal"],
        summary: "View or download a previously created withdrawal PDF",
      },
    },
    async ({ cookie, params, query, request }) => {
      const studentId = await requireStudent(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      const withdrawal = await withdrawalForStudent(studentId, params.id)
      if (!withdrawal) {
        return appProblem(
          request,
          404,
          "WITHDRAWAL_NOT_FOUND",
          "ไม่พบใบถอนรายวิชา",
          "เลือกใบถอนรายวิชาจากรายการของคุณ",
        )
      }
      const pdf = await renderWithdrawalPdf(withdrawal.id, withdrawal.snapshot)
      const disposition =
        query.download === "1" || query.download === "true" ? "attachment" : "inline"
      return new Response(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": disposition + '; filename="withdrawal-' + withdrawal.id + '.pdf"',
          "cache-control": "private, no-store",
        },
      })
    },
  )
  .get(
    "/api/v1/schedule",
    {
      cookie: sessionCookieSchema,
      detail: { tags: ["Schedule"], summary: "Current weekly schedule" },
    },
    async ({ cookie, request }) => {
      const studentId = await requireStudent(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      const registrations = await listRegistrations(studentId)
      return {
        data: {
          term: registrations.term,
          registrations: registrations.registrations.filter(
            (registration) => registration.status === "active",
          ),
        },
      }
    },
  )
