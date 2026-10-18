import { DEFAULT_APPEARANCE_SETTINGS } from "@regchula/appearance"
import { afterEach, describe, expect, it } from "vitest"
import {
  APPEARANCE_CACHE_KEY,
  applyAppearance,
  cachedAppearanceFor,
  clearAppearanceCache,
} from "./AppearanceProvider"

afterEach(() => {
  clearAppearanceCache()
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.removeAttribute("data-appearance-transition")
  document.documentElement.removeAttribute("data-content-layout")
  for (const token of [
    "--background",
    "--foreground",
    "--surface",
    "--surface-foreground",
    "--border",
    "--focus",
    "--accent",
    "--accent-foreground",
    "--color-paper",
    "--color-paper-2",
    "--color-paper-3",
    "--color-surface",
    "--color-secondary-control",
    "--color-canvas",
    "--color-sidebar",
    "--color-sidebar-ink",
    "--color-sidebar-muted",
    "--color-sidebar-rule",
    "--color-sidebar-active",
    "--color-toolbar",
    "--color-ink",
    "--color-ink-2",
    "--color-muted",
    "--color-neutral",
    "--color-rule",
    "--color-rule-2",
    "--color-overlay",
    "--color-accent",
    "--color-accent-text",
    "--color-accent-strong",
    "--color-accent-ink",
    "--color-accent-contrast",
    "--color-accent-soft",
    "--color-focus",
    "--label-accent-bg",
    "--label-accent-text",
    "--label-accent-border",
    "--ui-scale",
    "--app-content-max",
  ]) {
    document.documentElement.style.removeProperty(token)
  }
})

describe("appearance cache and document bridge", () => {
  it("returns a profile only to its cached owner", () => {
    localStorage.setItem(
      APPEARANCE_CACHE_KEY,
      JSON.stringify({ version: 2, owner: "student-a", settings: DEFAULT_APPEARANCE_SETTINGS }),
    )

    expect(cachedAppearanceFor("student-a")).toEqual(DEFAULT_APPEARANCE_SETTINGS)
    expect(cachedAppearanceFor("student-b")).toBeNull()
  })

  it("rejects a malformed cached accent before it reaches document styles", () => {
    localStorage.setItem(
      APPEARANCE_CACHE_KEY,
      JSON.stringify({
        version: 2,
        owner: "student-a",
        settings: { ...DEFAULT_APPEARANCE_SETTINGS, accentPreset: "custom", customAccent: "red;" },
      }),
    )

    expect(cachedAppearanceFor("student-a")).toBeNull()
  })

  it("applies normalized scale, width, and contrast-safe custom accent tokens", () => {
    applyAppearance({
      ...DEFAULT_APPEARANCE_SETTINGS,
      accentPreset: "custom",
      customAccent: "#168065",
      contentWidth: 1240,
      contentLayout: "contained",
      uiScale: 1.15,
    })

    const root = document.documentElement
    expect(root.style.getPropertyValue("--color-accent")).toBe("#168065")
    expect(root.style.getPropertyValue("--accent")).toBe("#168065")
    expect(root.style.getPropertyValue("--accent-foreground")).toBe("#ffffff")
    expect(root.style.getPropertyValue("--ui-scale")).toBe("1.15")
    expect(root.style.getPropertyValue("--app-content-max")).toBe("1240px")
    for (const token of ["--color-paper", "--color-toolbar", "--color-rule", "--color-ink"]) {
      expect(root.style.getPropertyValue(token)).not.toContain("#168065")
    }
    expect(root.style.getPropertyValue("--color-surface")).toBe("var(--theme-surface-base)")
    expect(root.style.getPropertyValue("--color-secondary-control")).toBe(
      "var(--theme-secondary-control-base)",
    )
    expect(root.style.getPropertyValue("--color-canvas")).toBe("var(--theme-canvas-base)")
    expect(root.style.getPropertyValue("--color-sidebar")).toBe("var(--theme-sidebar-base)")
  })

  it("uses fluid width by default and retains the saved contained width", () => {
    applyAppearance({ ...DEFAULT_APPEARANCE_SETTINGS, contentWidth: 1240 })
    expect(document.documentElement.style.getPropertyValue("--app-content-max")).toBe("100%")
    applyAppearance({
      ...DEFAULT_APPEARANCE_SETTINGS,
      contentWidth: 1240,
      contentLayout: "contained",
    })
    expect(document.documentElement.style.getPropertyValue("--app-content-max")).toBe("1240px")
  })
})
