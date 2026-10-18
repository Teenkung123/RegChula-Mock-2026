export const APPEARANCE_THEMES = Object.freeze(["system", "light", "dark"] as const)
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number]

export const ACCENT_PRESET_IDS = Object.freeze([
  "rose",
  "coral",
  "indigo",
  "forest",
  "violet",
  "amber",
  "berry",
  "teal",
  "slate",
  "clay",
  "mint",
] as const)

export type AccentPresetId = (typeof ACCENT_PRESET_IDS)[number]
export type AppearanceAccentPreset = AccentPresetId | "custom"

export const ACCENT_PRESET_CATALOG: Readonly<Record<AccentPresetId, string>> = Object.freeze({
  rose: "#db5f8d",
  coral: "#c75d4f",
  indigo: "#5865c9",
  forest: "#278052",
  violet: "#7653b4",
  amber: "#a86d12",
  berry: "#aa3559",
  teal: "#10746d",
  slate: "#52647b",
  clay: "#995b32",
  mint: "#168065",
})

export const LABEL_STYLES = Object.freeze(["soft", "solid"] as const)
export type AppearanceLabelStyle = (typeof LABEL_STYLES)[number]

export const DETAIL_PRESENTATIONS = Object.freeze(["drawer", "modal"] as const)
export type AppearanceDetailPresentation = (typeof DETAIL_PRESENTATIONS)[number]

export const APPEARANCE_LANGUAGES = Object.freeze(["th", "en", "zh"] as const)
export type AppearanceLanguage = (typeof APPEARANCE_LANGUAGES)[number]

export const SCHEDULE_COLOR_IDS = Object.freeze([
  "rose",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "violet",
] as const)
export type ScheduleColorId = (typeof SCHEDULE_COLOR_IDS)[number]
export const SCHEDULE_COLOR_PALETTE: Readonly<Record<ScheduleColorId, string>> = Object.freeze({
  rose: "#db5f8d",
  orange: "#f08c46",
  amber: "#d6a21f",
  green: "#3b9b68",
  teal: "#2b9b99",
  blue: "#438ad7",
  indigo: "#686bd8",
  violet: "#8a63ce",
})

export function defaultScheduleColor(courseCode: string): ScheduleColorId {
  const index = [...courseCode].reduce((sum, character) => sum + (character.codePointAt(0) ?? 0), 0)
  return SCHEDULE_COLOR_IDS[index % SCHEDULE_COLOR_IDS.length] ?? "rose"
}

export const CONTENT_LAYOUTS = Object.freeze(["fluid", "contained"] as const)
export type ContentLayout = (typeof CONTENT_LAYOUTS)[number]

export interface AppearanceSettings {
  theme: AppearanceTheme
  accentPreset: AppearanceAccentPreset
  customAccent: string | null
  uiScale: number
  contentWidth: number
  contentLayout: ContentLayout
  labelStyle: AppearanceLabelStyle
  detailPresentation: AppearanceDetailPresentation
  language: AppearanceLanguage
}

export type AppearanceSettingsPatch = Partial<AppearanceSettings>

export interface AppearanceValidationIssue {
  field: string
  code:
    | "INVALID_OBJECT"
    | "UNKNOWN_FIELD"
    | "INVALID_VALUE"
    | "INVALID_HEX"
    | "OUT_OF_RANGE"
    | "INVALID_STEP"
    | "CUSTOM_ACCENT_REQUIRED"
    | "CUSTOM_ACCENT_NOT_ALLOWED"
}

export type AppearanceNormalizationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: readonly AppearanceValidationIssue[] }

export const DEFAULT_APPEARANCE_SETTINGS: Readonly<AppearanceSettings> = Object.freeze({
  theme: "system",
  accentPreset: "rose",
  customAccent: null,
  uiScale: 1,
  contentWidth: 1120,
  contentLayout: "fluid",
  labelStyle: "soft",
  detailPresentation: "modal",
  language: "th",
})

const appearanceKeys = Object.freeze([
  "theme",
  "accentPreset",
  "customAccent",
  "uiScale",
  "contentWidth",
  "contentLayout",
  "labelStyle",
  "detailPresentation",
  "language",
] as const)

const validAccentPresets = Object.freeze([...ACCENT_PRESET_IDS, "custom"] as const)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value)
}

function isSteppedNumber(value: unknown, minimum: number, maximum: number, step: number): boolean {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    return false
  }
  const steps = (value - minimum) / step
  return Math.abs(steps - Math.round(steps)) < 0.000_000_1
}

function normalizeCompleteSettings(
  candidate: AppearanceSettings,
): AppearanceNormalizationResult<AppearanceSettings> {
  const issues: AppearanceValidationIssue[] = []
  if (candidate.accentPreset === "custom" && candidate.customAccent === null) {
    issues.push({ field: "customAccent", code: "CUSTOM_ACCENT_REQUIRED" })
  }
  if (candidate.accentPreset !== "custom" && candidate.customAccent !== null) {
    issues.push({ field: "customAccent", code: "CUSTOM_ACCENT_NOT_ALLOWED" })
  }
  return issues.length === 0 ? { ok: true, value: candidate } : { ok: false, issues }
}

/** Normalizes a three- or six-digit CSS hex value to lowercase #rrggbb. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null
  const source = value.trim().toLowerCase().replace(/^#/, "")
  if (/^[\da-f]{3}$/.test(source)) {
    return `#${source
      .split("")
      .map((character) => `${character}${character}`)
      .join("")}`
  }
  return /^[\da-f]{6}$/.test(source) ? `#${source}` : null
}

/** Validates only provided fields and returns their canonical values. */
export function normalizeAppearancePatch(
  value: unknown,
): AppearanceNormalizationResult<AppearanceSettingsPatch> {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ field: "settings", code: "INVALID_OBJECT" }] }
  }

  const issues: AppearanceValidationIssue[] = []
  const patch: AppearanceSettingsPatch = {}
  for (const key of Object.keys(value)) {
    if (!(appearanceKeys as readonly string[]).includes(key)) {
      issues.push({ field: key, code: "UNKNOWN_FIELD" })
    }
  }

  if ("theme" in value) {
    if (includes(APPEARANCE_THEMES, value.theme)) patch.theme = value.theme
    else issues.push({ field: "theme", code: "INVALID_VALUE" })
  }
  if ("accentPreset" in value) {
    if (includes(validAccentPresets, value.accentPreset)) patch.accentPreset = value.accentPreset
    else issues.push({ field: "accentPreset", code: "INVALID_VALUE" })
  }
  if ("customAccent" in value) {
    if (value.customAccent === null) patch.customAccent = null
    else {
      const normalized = normalizeHex(value.customAccent)
      if (normalized) patch.customAccent = normalized
      else issues.push({ field: "customAccent", code: "INVALID_HEX" })
    }
  }
  if ("uiScale" in value) {
    if (isSteppedNumber(value.uiScale, 0.9, 1.35, 0.05)) patch.uiScale = value.uiScale as number
    else {
      issues.push({
        field: "uiScale",
        code:
          typeof value.uiScale === "number" && value.uiScale >= 0.9 && value.uiScale <= 1.35
            ? "INVALID_STEP"
            : "OUT_OF_RANGE",
      })
    }
  }
  if ("contentWidth" in value) {
    if (isSteppedNumber(value.contentWidth, 960, 1360, 20)) {
      patch.contentWidth = value.contentWidth as number
    } else {
      issues.push({
        field: "contentWidth",
        code:
          typeof value.contentWidth === "number" &&
          value.contentWidth >= 960 &&
          value.contentWidth <= 1360
            ? "INVALID_STEP"
            : "OUT_OF_RANGE",
      })
    }
  }
  if ("contentLayout" in value) {
    if (includes(CONTENT_LAYOUTS, value.contentLayout)) patch.contentLayout = value.contentLayout
    else issues.push({ field: "contentLayout", code: "INVALID_VALUE" })
  }
  if ("labelStyle" in value) {
    if (includes(LABEL_STYLES, value.labelStyle)) patch.labelStyle = value.labelStyle
    else issues.push({ field: "labelStyle", code: "INVALID_VALUE" })
  }
  if ("detailPresentation" in value) {
    if (includes(DETAIL_PRESENTATIONS, value.detailPresentation)) {
      patch.detailPresentation = value.detailPresentation
    } else {
      issues.push({ field: "detailPresentation", code: "INVALID_VALUE" })
    }
  }
  if ("language" in value) {
    if (includes(APPEARANCE_LANGUAGES, value.language)) patch.language = value.language
    else issues.push({ field: "language", code: "INVALID_VALUE" })
  }

  return issues.length === 0 ? { ok: true, value: patch } : { ok: false, issues }
}

/** Applies a partial patch to a full profile and validates cross-field invariants. */
export function mergeAppearanceSettings(
  current: AppearanceSettings,
  patch: AppearanceSettingsPatch,
): AppearanceNormalizationResult<AppearanceSettings> {
  const normalizedCurrent = normalizeAppearanceSettings(current)
  if (!normalizedCurrent.ok) return normalizedCurrent
  return normalizeCompleteSettings({ ...normalizedCurrent.value, ...patch })
}

/** Normalizes a stored or external profile, filling omitted legacy fields from defaults. */
export function normalizeAppearanceSettings(
  value: unknown,
): AppearanceNormalizationResult<AppearanceSettings> {
  const patch = normalizeAppearancePatch(value)
  if (!patch.ok) return patch
  return normalizeCompleteSettings({ ...DEFAULT_APPEARANCE_SETTINGS, ...patch.value })
}

export function resolveAccentColor(
  settings: Pick<AppearanceSettings, "accentPreset" | "customAccent">,
): string {
  if (settings.accentPreset === "custom" && settings.customAccent) return settings.customAccent
  return ACCENT_PRESET_CATALOG[settings.accentPreset === "custom" ? "rose" : settings.accentPreset]
}

function relativeLuminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  const channel = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  )
}

/** Keeps brand text readable while solid controls retain the user's exact accent. */
export function readableAccentText(value: string, dark: boolean): string {
  const accent = normalizeHex(value) ?? ACCENT_PRESET_CATALOG.rose
  const surface = dark ? "#15171c" : "#ffffff"
  const endpoint = dark ? 255 : 0
  for (let step = 0; step <= 20; step += 1) {
    const amount = step / 20
    const candidate =
      "#" +
      [1, 3, 5]
        .map((offset) => {
          const channel = Number.parseInt(accent.slice(offset, offset + 2), 16)
          return Math.round(channel + (endpoint - channel) * amount)
            .toString(16)
            .padStart(2, "0")
        })
        .join("")
    if (contrastRatio(candidate, surface) >= 5.5) return candidate
  }
  return readableForeground(surface)
}

/** Chooses the higher-contrast neutral foreground for a valid accent color. */
export function readableForeground(value: unknown): "#151116" | "#ffffff" {
  const color = normalizeHex(value)
  if (!color) return "#151116"
  return contrastRatio(color, "#ffffff") >= contrastRatio(color, "#151116") ? "#ffffff" : "#151116"
}
