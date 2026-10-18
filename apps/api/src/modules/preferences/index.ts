import {
  DEFAULT_APPEARANCE_SETTINGS,
  mergeAppearanceSettings,
  normalizeAppearancePatch,
  normalizeAppearanceSettings,
  type AppearanceSettings,
  type AppearanceValidationIssue,
} from "../../../../../packages/appearance/src/index.ts"
import { asc, eq } from "drizzle-orm"
import { Elysia, t } from "elysia"
import { db } from "../../db/client"
import { announcements, studentPreferences } from "../../db/schema"
import { originIsAllowed } from "../../shared/http"
import { appProblem } from "../../shared/problem"
import {
  sessionCookieSchema,
  touchStudentSession,
  type SessionCookieJar,
} from "../../shared/session"

const studentOrProblem = async (cookie: SessionCookieJar, request: Request) =>
  (await touchStudentSession(cookie))?.studentId ??
  appProblem(request, 401, "AUTH_REQUIRED", "ต้องเข้าสู่ระบบ", "เข้าสู่ระบบด้วยรหัสนิสิตก่อนใช้งาน")

const appearancePatchSchema = t.Object({
  theme: t.Optional(t.Union([t.Literal("system"), t.Literal("light"), t.Literal("dark")])),
  accentPreset: t.Optional(
    t.Union([
      t.Literal("rose"),
      t.Literal("coral"),
      t.Literal("indigo"),
      t.Literal("forest"),
      t.Literal("violet"),
      t.Literal("amber"),
      t.Literal("berry"),
      t.Literal("teal"),
      t.Literal("slate"),
      t.Literal("clay"),
      t.Literal("mint"),
      t.Literal("custom"),
    ]),
  ),
  customAccent: t.Optional(t.Union([t.Null(), t.String({ minLength: 1, maxLength: 32 })])),
  uiScale: t.Optional(t.Number()),
  contentWidth: t.Optional(t.Number()),
  contentLayout: t.Optional(t.Union([t.Literal("fluid"), t.Literal("contained")])),
  labelStyle: t.Optional(t.Union([t.Literal("soft"), t.Literal("solid")])),
  detailPresentation: t.Optional(t.Union([t.Literal("drawer"), t.Literal("modal")])),
  language: t.Optional(t.Union([t.Literal("th"), t.Literal("en"), t.Literal("zh")])),
})

type PreferenceRow = typeof studentPreferences.$inferSelect

export function appearanceSettingsFromRow(
  preference: Partial<PreferenceRow> | null | undefined,
): AppearanceSettings {
  if (!preference) return { ...DEFAULT_APPEARANCE_SETTINGS }
  const stored: Record<string, unknown> = {}
  if (preference.theme !== undefined) stored.theme = preference.theme
  if (preference.accentPreset !== undefined) stored.accentPreset = preference.accentPreset
  if (preference.customAccent !== undefined) stored.customAccent = preference.customAccent
  if (preference.uiScale !== undefined) stored.uiScale = preference.uiScale
  if (preference.contentWidth !== undefined) stored.contentWidth = preference.contentWidth
  if (preference.contentLayout !== undefined) stored.contentLayout = preference.contentLayout
  if (preference.labelStyle !== undefined) stored.labelStyle = preference.labelStyle
  if (preference.detailPresentation !== undefined) {
    stored.detailPresentation = preference.detailPresentation
  }
  if (preference.language !== undefined) stored.language = preference.language
  const normalized = normalizeAppearanceSettings(stored)
  return normalized.ok ? normalized.value : { ...DEFAULT_APPEARANCE_SETTINGS }
}

function preferenceValues(settings: AppearanceSettings) {
  return {
    theme: settings.theme,
    accentPreset: settings.accentPreset,
    customAccent: settings.customAccent,
    uiScale: settings.uiScale,
    contentWidth: settings.contentWidth,
    contentLayout: settings.contentLayout,
    labelStyle: settings.labelStyle,
    detailPresentation: settings.detailPresentation,
    language: settings.language,
  }
}

function invalidPreferenceProblem(request: Request, issues: readonly AppearanceValidationIssue[]) {
  return appProblem(
    request,
    400,
    "INVALID_PREFERENCE",
    "บันทึกการตั้งค่าไม่ได้",
    "ตรวจสอบรูปแบบการตั้งค่าแล้วลองอีกครั้ง",
    { issues: [...issues] },
  )
}

export const preferencesModule = new Elysia({ name: "preferences" })
  .get(
    "/api/v1/announcements",
    {
      cookie: sessionCookieSchema,
      detail: { tags: ["Dashboard"], summary: "Active demo announcements" },
    },
    async ({ cookie, request }) => {
      const auth = await studentOrProblem(cookie as SessionCookieJar, request)
      if (typeof auth !== "string") return auth
      const items = await db
        .select()
        .from(announcements)
        .where(eq(announcements.active, true))
        .orderBy(asc(announcements.sortOrder), asc(announcements.id))
      return { data: items }
    },
  )
  .get(
    "/api/v1/preferences",
    {
      cookie: sessionCookieSchema,
      detail: { tags: ["Preferences"], summary: "Current student appearance" },
    },
    async ({ cookie, request }) => {
      const studentId = await studentOrProblem(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      const [preference] = await db
        .select()
        .from(studentPreferences)
        .where(eq(studentPreferences.studentId, studentId))
        .limit(1)
      return { data: appearanceSettingsFromRow(preference) }
    },
  )
  .patch(
    "/api/v1/preferences",
    {
      cookie: sessionCookieSchema,
      body: appearancePatchSchema,
      detail: { tags: ["Preferences"], summary: "Update student appearance" },
    },
    async ({ body, cookie, request }) => {
      const studentId = await studentOrProblem(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      if (!originIsAllowed(request)) {
        return appProblem(
          request,
          400,
          "ORIGIN_NOT_ALLOWED",
          "บันทึกการตั้งค่าไม่ได้",
          "คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต",
        )
      }
      const patch = normalizeAppearancePatch(body)
      if (!patch.ok) return invalidPreferenceProblem(request, patch.issues)
      const [preference] = await db
        .select()
        .from(studentPreferences)
        .where(eq(studentPreferences.studentId, studentId))
        .limit(1)
      const updated = mergeAppearanceSettings(appearanceSettingsFromRow(preference), patch.value)
      if (!updated.ok) return invalidPreferenceProblem(request, updated.issues)
      await db
        .insert(studentPreferences)
        .values({ studentId, ...preferenceValues(updated.value) })
        .onDuplicateKeyUpdate({ set: preferenceValues(updated.value) })
      return { data: updated.value }
    },
  )
  .post(
    "/api/v1/preferences/reset",
    {
      cookie: sessionCookieSchema,
      detail: { tags: ["Preferences"], summary: "Reset student appearance" },
    },
    async ({ cookie, request }) => {
      const studentId = await studentOrProblem(cookie as SessionCookieJar, request)
      if (typeof studentId !== "string") return studentId
      if (!originIsAllowed(request)) {
        return appProblem(
          request,
          400,
          "ORIGIN_NOT_ALLOWED",
          "บันทึกการตั้งค่าไม่ได้",
          "คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต",
        )
      }
      const defaults = { ...DEFAULT_APPEARANCE_SETTINGS }
      await db
        .insert(studentPreferences)
        .values({ studentId, ...preferenceValues(defaults) })
        .onDuplicateKeyUpdate({ set: preferenceValues(defaults) })
      return { data: defaults }
    },
  )
