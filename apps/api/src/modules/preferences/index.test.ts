import { describe, expect, it } from "bun:test"
import {
  ACCENT_PRESET_CATALOG,
  DEFAULT_APPEARANCE_SETTINGS,
  mergeAppearanceSettings,
  normalizeAppearancePatch,
  normalizeAppearanceSettings,
  normalizeHex,
  readableForeground,
} from "../../../../../packages/appearance/src/index.ts"
import { appearanceSettingsFromRow } from "./index"

describe("appearance preferences", () => {
  it("keeps the preset catalog and defaults immutable", () => {
    expect(Object.isFrozen(ACCENT_PRESET_CATALOG)).toBe(true)
    expect(DEFAULT_APPEARANCE_SETTINGS).toEqual({
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
    expect(ACCENT_PRESET_CATALOG.mint).toBe("#168065")
    expect(ACCENT_PRESET_CATALOG.rose).toBe("#db5f8d")
  })

  it("normalizes legacy rows and preserves partial preference updates", () => {
    expect(appearanceSettingsFromRow({ theme: "dark" })).toEqual({
      ...DEFAULT_APPEARANCE_SETTINGS,
      theme: "dark",
    })
    const patch = normalizeAppearancePatch({ theme: "light", uiScale: 1.2 })
    expect(patch.ok).toBe(true)
    if (!patch.ok) return
    expect(mergeAppearanceSettings({ ...DEFAULT_APPEARANCE_SETTINGS }, patch.value)).toEqual({
      ok: true,
      value: { ...DEFAULT_APPEARANCE_SETTINGS, theme: "light", uiScale: 1.2 },
    })
  })

  it("canonicalizes a valid custom accent and rejects invalid values", () => {
    expect(normalizeHex(" #AbC ")).toBe("#aabbcc")
    expect(normalizeAppearanceSettings({ accentPreset: "custom", customAccent: " #AbC " })).toEqual(
      {
        ok: true,
        value: { ...DEFAULT_APPEARANCE_SETTINGS, accentPreset: "custom", customAccent: "#aabbcc" },
      },
    )
    expect(normalizeAppearancePatch({ customAccent: "not-a-color" })).toEqual({
      ok: false,
      issues: [{ field: "customAccent", code: "INVALID_HEX" }],
    })
  })

  it("enforces numeric steps and selects a readable foreground", () => {
    expect(normalizeAppearancePatch({ uiScale: 1.03 })).toEqual({
      ok: false,
      issues: [{ field: "uiScale", code: "INVALID_STEP" }],
    })
    expect(normalizeAppearancePatch({ contentWidth: 1380 })).toEqual({
      ok: false,
      issues: [{ field: "contentWidth", code: "OUT_OF_RANGE" }],
    })
    expect(readableForeground("#000000")).toBe("#ffffff")
    expect(readableForeground("#ffffff")).toBe("#151116")
  })

  it("keeps legacy widths while adding fluid layout and validates layout choices", () => {
    expect(appearanceSettingsFromRow({ theme: "dark", contentWidth: 1240 })).toEqual({
      ...DEFAULT_APPEARANCE_SETTINGS,
      theme: "dark",
      contentWidth: 1240,
      contentLayout: "fluid",
    })
    expect(normalizeAppearancePatch({ contentLayout: "invalid" }).ok).toBe(false)
    expect(normalizeAppearancePatch({ contentLayout: "contained" })).toEqual({
      ok: true,
      value: { contentLayout: "contained" },
    })
  })
})
