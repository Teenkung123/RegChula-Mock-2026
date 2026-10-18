import {
  DEFAULT_APPEARANCE_SETTINGS,
  mergeAppearanceSettings,
  normalizeAppearanceSettings,
  readableForeground,
  readableAccentText,
  resolveAccentColor,
  type AppearanceSettings,
  type AppearanceSettingsPatch,
} from "@regchula/appearance"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { LocaleProvider } from "../i18n"
import { getPreferences, resetPreferences, updatePreferences } from "../lib/api"

export const APPEARANCE_CACHE_KEY = "regchula_appearance_v2"

type AppearanceCache = {
  version: 2
  owner: string
  settings: AppearanceSettings
}

function readCache(): AppearanceCache | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(APPEARANCE_CACHE_KEY) ?? "null")
    if (!value || typeof value !== "object") return null
    const cached = value as Partial<AppearanceCache>
    if (cached.version !== 2 || typeof cached.owner !== "string" || !cached.settings) return null
    const settings = normalizeAppearanceSettings(cached.settings)
    return settings.ok ? { version: 2, owner: cached.owner, settings: settings.value } : null
  } catch {
    return null
  }
}

function writeCache(owner: string, settings: AppearanceSettings) {
  try {
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify({ version: 2, owner, settings }))
    return true
  } catch {
    // Browser caching is optional; denied/quota-limited storage must not prevent API saves.
    return false
  }
}

export function clearAppearanceCache() {
  try {
    localStorage.removeItem(APPEARANCE_CACHE_KEY)
    return true
  } catch {
    return false
  }
}

export function cachedAppearanceFor(owner: string): AppearanceSettings | null {
  const cached = readCache()
  return cached?.owner === owner ? cached.settings : null
}

function resolvedTheme(theme: AppearanceSettings["theme"]) {
  if (theme !== "system") return theme
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

export function applyAppearance(settings: AppearanceSettings) {
  const root = document.documentElement
  const accent = resolveAccentColor(settings)
  const foreground = readableForeground(accent)
  const theme = resolvedTheme(settings.theme)
  const neutralRoles = [
    "paper",
    "paper-2",
    "paper-3",
    "surface",
    "canvas",
    "sidebar",
    "toolbar",
    "ink",
    "ink-2",
    "muted",
    "neutral",
    "rule",
    "rule-2",
    "overlay",
    "secondary-control",
    "sidebar-ink",
    "sidebar-muted",
    "sidebar-rule",
    "sidebar-active",
    "focus",
  ] as const
  root.dataset.appearanceTransition = "true"
  root.dataset.theme = theme
  root.dataset.labelStyle = settings.labelStyle
  root.dataset.detailPresentation = settings.detailPresentation
  root.dataset.contentLayout = settings.contentLayout
  for (const role of neutralRoles) {
    root.style.setProperty(`--color-${role}`, `var(--theme-${role}-base)`)
  }
  root.style.setProperty("--color-surface-raised", "var(--color-surface)")
  root.style.setProperty("--color-surface-muted", "var(--color-paper)")
  root.style.setProperty("--background", "var(--color-paper)")
  root.style.setProperty("--foreground", "var(--color-ink)")
  root.style.setProperty("--surface", "var(--color-surface)")
  root.style.setProperty("--surface-foreground", "var(--color-ink)")
  root.style.setProperty("--border", "var(--color-rule)")
  root.style.setProperty("--ui-scale", String(settings.uiScale))
  root.style.setProperty(
    "--app-content-max",
    settings.contentLayout === "contained" ? `${settings.contentWidth}px` : "100%",
  )
  root.style.setProperty("--color-accent", accent)
  root.style.setProperty("--color-accent-text", readableAccentText(accent, theme === "dark"))
  root.style.setProperty(
    "--color-accent-strong",
    `color-mix(in srgb, ${accent} 90%, ${foreground === "#ffffff" ? "#151116" : "#ffffff"})`,
  )
  root.style.setProperty("--color-accent-ink", foreground)
  root.style.setProperty("--color-accent-contrast", foreground)
  root.style.setProperty("--accent", accent)
  root.style.setProperty("--accent-foreground", foreground)
  root.style.setProperty(
    "--color-accent-soft",
    `color-mix(in oklch, ${accent} 14%, var(--color-paper))`,
  )
  root.style.setProperty("--focus", "var(--color-focus)")
  root.style.setProperty(
    "--label-accent-bg",
    settings.labelStyle === "solid"
      ? accent
      : `color-mix(in oklch, ${accent} 14%, var(--color-paper))`,
  )
  root.style.setProperty(
    "--label-accent-text",
    settings.labelStyle === "solid" ? foreground : "var(--color-ink)",
  )
  root.style.setProperty(
    "--label-accent-border",
    settings.labelStyle === "solid"
      ? accent
      : `color-mix(in oklch, ${accent} 54%, var(--color-paper))`,
  )
}

export function applyCachedAppearance() {
  if (window.location.pathname === "/login") return
  const cached = readCache()
  if (cached) applyAppearance(cached.settings)
}

type AppearanceContextValue = {
  settings: AppearanceSettings
  isLoading: boolean
  isSaving: boolean
  error: Error | null
  update: (patch: AppearanceSettingsPatch) => void
  reset: () => void
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

type QueuedPreferenceWrite =
  | { kind: "patch"; patch: AppearanceSettingsPatch; revision: number }
  | { kind: "reset"; revision: number }

export function AppearanceProvider({
  studentId,
  children,
}: {
  studentId: string
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const cached = useMemo(() => readCache(), [])
  const preferenceKey = useMemo(() => ["preferences", studentId] as const, [studentId])
  const provisional =
    cached?.owner === studentId ? cached.settings : { ...DEFAULT_APPEARANCE_SETTINGS }
  const [settings, setSettings] = useState<AppearanceSettings>(provisional)
  const settingsRef = useRef(settings)
  const confirmedRef = useRef(settings)
  const writesRef = useRef<QueuedPreferenceWrite[]>([])
  const flushingRef = useRef(false)
  const flushWritesRef = useRef<(() => void) | null>(null)
  const revisionRef = useRef(0)
  const hydratedRef = useRef(false)
  const localIntentRef = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<Error | null>(null)
  const preference = useQuery({
    queryKey: preferenceKey,
    queryFn: getPreferences,
  })

  const applyLocal = useCallback(
    (next: AppearanceSettings) => {
      settingsRef.current = next
      setSettings(next)
      applyAppearance(next)
      writeCache(studentId, next)
    },
    [studentId],
  )

  const flushWrites = useCallback(async () => {
    if (flushingRef.current) return
    flushingRef.current = true
    setIsSaving(true)
    try {
      while (writesRef.current.length > 0) {
        const write = writesRef.current.shift()
        if (!write) continue
        try {
          const saved =
            write.kind === "patch" ? await updatePreferences(write.patch) : await resetPreferences()
          confirmedRef.current = saved
          queryClient.setQueryData(preferenceKey, saved)
          if (write.revision === revisionRef.current) {
            applyLocal(saved)
            setSaveError(null)
          }
        } catch (reason) {
          setSaveError(reason instanceof Error ? reason : new Error("ไม่สามารถบันทึกการแสดงผลได้"))
          // Roll back only the failed write, preserving newer queued choices.
          let next = confirmedRef.current
          for (const pending of writesRef.current) {
            if (pending.kind === "reset") next = { ...DEFAULT_APPEARANCE_SETTINGS }
            else {
              const merged = mergeAppearanceSettings(next, pending.patch)
              if (merged.ok) next = merged.value
            }
          }
          applyLocal(next)
        }
      }
    } finally {
      flushingRef.current = false
      setIsSaving(false)
      if (writesRef.current.length > 0) flushWritesRef.current?.()
    }
  }, [applyLocal, preferenceKey, queryClient])

  flushWritesRef.current = () => {
    void flushWrites()
  }

  const enqueue = useCallback((write: QueuedPreferenceWrite) => {
    if (write.kind === "reset") {
      writesRef.current = [write]
    } else {
      const last = writesRef.current.at(-1)
      if (last?.kind === "patch") {
        last.patch = { ...last.patch, ...write.patch }
        last.revision = write.revision
      } else {
        writesRef.current.push(write)
      }
    }
    flushWritesRef.current?.()
  }, [])

  const update = useCallback(
    (patch: AppearanceSettingsPatch) => {
      const merged = mergeAppearanceSettings(settingsRef.current, patch)
      if (!merged.ok) {
        setSaveError(new Error("ไม่สามารถบันทึกการแสดงผลได้"))
        return
      }
      localIntentRef.current = true
      const revision = revisionRef.current + 1
      revisionRef.current = revision
      setSaveError(null)
      applyLocal(merged.value)
      enqueue({ kind: "patch", patch, revision })
    },
    [applyLocal, enqueue],
  )

  const reset = useCallback(() => {
    localIntentRef.current = true
    const revision = revisionRef.current + 1
    revisionRef.current = revision
    setSaveError(null)
    applyLocal({ ...DEFAULT_APPEARANCE_SETTINGS })
    enqueue({ kind: "reset", revision })
  }, [applyLocal, enqueue])

  useEffect(() => {
    if (!preference.data || hydratedRef.current || localIntentRef.current) return
    hydratedRef.current = true
    confirmedRef.current = preference.data
    applyLocal(preference.data)
  }, [applyLocal, preference.data])

  useLayoutEffect(() => {
    if (cached && cached.owner !== studentId) clearAppearanceCache()
    applyAppearance(settings)
    writeCache(studentId, settings)
  }, [cached, settings, studentId])

  useEffect(() => {
    if (settings.theme !== "system" || typeof window.matchMedia !== "function") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const sync = () => applyAppearance(settings)
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [settings])

  const value = useMemo<AppearanceContextValue>(
    () => ({
      settings,
      isLoading: preference.isPending,
      isSaving,
      error: saveError ?? (preference.error instanceof Error ? preference.error : null),
      update,
      reset,
    }),
    [isSaving, preference.error, preference.isPending, reset, saveError, settings, update],
  )

  return (
    <AppearanceContext.Provider value={value}>
      <LocaleProvider language={settings.language}>{children}</LocaleProvider>
    </AppearanceContext.Provider>
  )
}

export function useAppearance() {
  const value = useContext(AppearanceContext)
  if (!value) throw new Error("AppearanceProvider is missing")
  return value
}
