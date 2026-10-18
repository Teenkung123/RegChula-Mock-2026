import { randomId } from "./random-id"
import { treaty } from "@elysia/eden"
import type { AppearanceSettings, AppearanceSettingsPatch } from "@regchula/appearance"
import type { App } from "@regchula/api/app"
import type {
  ActionResultDto,
  ActivityDto,
  ActivityInputDto,
  FavoriteDto,
  BatchRegistrationPreviewDto,
  BatchRegistrationResultDto,
  BatchDropPreviewDto,
  BatchDropResultDto,
  WithdrawalFormPreviewDto,
  AnnouncementDto,
  CatalogOptionsDto,
  ChallengeDto,
  CourseDetailDto,
  CourseReviewDto,
  CourseSummaryDto,
  ExamScheduleDto,
  MeDto,
  RegistrationListDto,
  RegistrationPreviewDto,
  ScheduleColorsDto,
  TermDto,
} from "@regchula/api/public-types"

const client = treaty<App>(window.location.origin)

interface ProblemValue {
  code?: string
  title?: string
  detail?: string
  details?: Record<string, unknown>
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: Record<string, unknown> | undefined

  constructor(status: number, value: unknown) {
    const problem =
      value && typeof value === "object" ? (value as ProblemValue) : ({} as ProblemValue)
    super(problem.detail ?? problem.title ?? "ระบบดำเนินการไม่สำเร็จ")
    this.name = "ApiError"
    this.code = problem.code ?? "REQUEST_FAILED"
    this.status = status
    this.details = problem.details
  }
}

const dataOrThrow = <T>(response: {
  data: unknown
  error: { status: unknown; value: unknown } | null
}): T => {
  if (response.error) throw new ApiError(Number(response.error.status) || 500, response.error.value)
  if (response.data === null) throw new ApiError(500, null)
  return response.data as T
}

export async function getChallenge() {
  const response = await client.api.v1.auth.challenge.get()
  return dataOrThrow<{ data: ChallengeDto }>(response).data
}

export async function login(input: {
  studentId: string
  password: string
  rememberMe: boolean
  challengeCode: string
  challengeToken: string
}) {
  const response = await client.api.v1.auth.login.post(input)
  return dataOrThrow<{ data: { studentId: string } }>(response).data
}

export async function logout() {
  const response = await client.api.v1.auth.logout.post()
  return dataOrThrow<{ data: { loggedOut: true } }>(response).data
}

export async function getMe() {
  const response = await client.api.v1.me.get()
  return dataOrThrow<{ data: MeDto }>(response).data
}

export async function getTerms() {
  const response = await client.api.v1.terms.get()
  return dataOrThrow<{ data: TermDto[] }>(response).data
}

export interface TermQuery {
  academicYear?: number
  semester?: number
}

export async function getCatalogOptions(query: TermQuery) {
  const response = await client.api.v1.catalog.options.get({ query })
  return dataOrThrow<CatalogOptionsDto>(response)
}

export interface CourseQuery extends TermQuery {
  q?: string
  faculty?: string
  faculties?: string
  department?: string
  departments?: string
  genEdTypes?: string
  courseGroup?: "general" | "other"
  day?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU"
  days?: string
  startTime?: string
  endTime?: string
  examDays?: string
  examStartTime?: string
  examEndTime?: string
  credits?: number
  minCredits?: number
  maxCredits?: number
  mode?: "autocomplete"
  page?: number
  pageSize?: number
}

export async function getCourses(query: CourseQuery, signal?: AbortSignal) {
  const response = await client.api.v1.courses.get({
    query,
    fetch: signal ? { signal } : {},
  })
  return dataOrThrow<{
    data: CourseSummaryDto[]
    meta: {
      term: TermDto
      page: number
      pageSize: number
      total: number
      totalPages: number
    }
  }>(response)
}

export async function getCourse(courseCode: string, query: TermQuery) {
  const response = await client.api.v1.courses({ courseCode }).get({ query })
  return dataOrThrow<{ data: CourseDetailDto }>(response).data
}

export async function getCourseReviews(
  courseCode: string,
  query: TermQuery & { page?: number; pageSize?: number },
) {
  const response = await client.api.v1.courses({ courseCode }).reviews.get({ query })
  return dataOrThrow<{
    data: CourseReviewDto[]
    meta: { page: number; pageSize: number; total: number; totalPages: number }
  }>(response)
}

export async function getAnnouncements() {
  const response = await client.api.v1.announcements.get()
  return dataOrThrow<{ data: AnnouncementDto[] }>(response).data
}

export async function getPreferences() {
  const response = await client.api.v1.preferences.get()
  return dataOrThrow<{ data: AppearanceSettings }>(response).data
}

export async function updatePreferences(patch: AppearanceSettingsPatch) {
  const response = await client.api.v1.preferences.patch(patch)
  return dataOrThrow<{ data: AppearanceSettings }>(response).data
}

export async function resetPreferences() {
  const response = await client.api.v1.preferences.reset.post()
  return dataOrThrow<{ data: AppearanceSettings }>(response).data
}

export async function getRegistrations() {
  const response = await client.api.v1.registrations.get()
  return dataOrThrow<{ data: RegistrationListDto }>(response).data
}

export async function previewRegistration(sectionId: number, allowAdvisoryOverride = false) {
  const response = await client.api.v1.registrations.preview.post({
    sectionId,
    allowAdvisoryOverride,
  })
  return dataOrThrow<{ data: RegistrationPreviewDto }>(response).data
}

export async function confirmRegistration(confirmationToken: string) {
  const response = await client.api.v1.registrations.post(
    { confirmationToken },
    { headers: { "idempotency-key": randomId() } },
  )
  return dataOrThrow<{ data: ActionResultDto }>(response).data
}

export async function previewBatchRegistration(
  choices: Array<{ sectionId: number; alternateSectionId?: number }>,
  allowAdvisoryOverride = false,
) {
  const response = await client.api.v1.registrations["batch-preview"].post({
    choices,
    allowAdvisoryOverride,
  })
  return dataOrThrow<{ data: BatchRegistrationPreviewDto }>(response).data
}

export async function confirmBatchRegistration(
  confirmationToken: string,
  idempotencyKey: string = randomId(),
) {
  const response = await client.api.v1.registrations.batch.post(
    { confirmationToken },
    { headers: { "idempotency-key": idempotencyKey } },
  )
  return dataOrThrow<{ data: BatchRegistrationResultDto }>(response).data
}

export async function previewBatchDrop(registrationIds: number[]) {
  const response = await client.api.v1.registrations["drop-preview"].post({ registrationIds })
  return dataOrThrow<{ data: BatchDropPreviewDto }>(response).data
}

export async function confirmBatchDrop(confirmationToken: string) {
  const response = await client.api.v1.registrations.drop.post(
    { confirmationToken },
    { headers: { "idempotency-key": randomId() } },
  )
  return dataOrThrow<{ data: BatchDropResultDto }>(response).data
}

export async function previewWithdrawalForm(
  selections: Array<{ registrationId: number; reason: string }>,
) {
  const response = await client.api.v1.withdrawals.preview.post({ selections })
  return dataOrThrow<{ data: WithdrawalFormPreviewDto }>(response).data
}

export async function createWithdrawalForm(confirmationToken: string) {
  const response = await fetch("/api/v1/withdrawals/form", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmationToken }),
  })
  if (!response.ok) {
    let value: unknown = null
    try {
      value = await response.json()
    } catch {
      value = null
    }
    throw new ApiError(response.status, value)
  }
  return response.blob()
}

export async function getSchedule() {
  const response = await client.api.v1.schedule.get()
  return dataOrThrow<{ data: RegistrationListDto }>(response).data
}

export async function getScheduleColors() {
  const response = await client.api.v1.schedule.colors.get()
  return dataOrThrow<{ data: ScheduleColorsDto }>(response).data
}

export async function setScheduleColor(
  courseCode: string,
  colorId: import("@regchula/appearance").ScheduleColorId,
) {
  const response = await client.api.v1.schedule.colors({ courseCode }).put({ colorId })
  return dataOrThrow<{
    data: { courseCode: string; colorId: import("@regchula/appearance").ScheduleColorId }
  }>(response).data
}

export async function resetScheduleColor(courseCode: string) {
  const response = await client.api.v1.schedule.colors({ courseCode }).delete()
  return dataOrThrow<{ data: { courseCode: string } }>(response).data
}

export async function getExams() {
  const response = await client.api.v1.exams.get()
  return dataOrThrow<{ data: ExamScheduleDto }>(response).data
}

export async function getActivities(termId: number) {
  return dataOrThrow<{ data: ActivityDto[] }>(
    await client.api.v1.schedule.activities.get({ query: { termId } }),
  ).data
}

export async function saveActivity(termId: number, input: ActivityInputDto, id?: string) {
  const response = id
    ? await client.api.v1.schedule.activities({ id }).put(input, { query: { termId } })
    : await client.api.v1.schedule.activities.post(input, { query: { termId } })
  return dataOrThrow<{ data: ActivityDto }>(response).data
}

export async function deleteActivity(termId: number, id: string) {
  return dataOrThrow<{ data: { id: string } }>(
    await client.api.v1.schedule.activities({ id }).delete(undefined, { query: { termId } }),
  ).data
}

export async function getFavorites(termId: number) {
  return dataOrThrow<{ data: FavoriteDto[] }>(
    await client.api.v1.favorites.get({ query: { termId } }),
  ).data
}

export async function setFavorite(courseCode: string, favorite: boolean) {
  const route = client.api.v1.favorites({ courseCode })
  return dataOrThrow<{ data: { courseCode: string } }>(
    favorite ? await route.put() : await route.delete(),
  ).data
}
