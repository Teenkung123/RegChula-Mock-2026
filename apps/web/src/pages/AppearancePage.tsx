import { AlertDialog, ColorSwatchPicker, Radio, RadioGroup, Slider } from "@heroui/react"
import {
  ACCENT_PRESET_CATALOG,
  ACCENT_PRESET_IDS,
  type AppearanceSettings,
  normalizeHex,
  resolveAccentColor,
} from "@regchula/appearance"
import {
  Check,
  Languages,
  LayoutPanelTop,
  Monitor,
  Moon,
  Palette,
  PanelRight,
  RotateCcw,
  Sun,
  Type,
} from "lucide-react"
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { applyAppearance, useAppearance } from "../appearance/AppearanceProvider"
import { Button, SelectField, Status } from "../components/ui"
import { useI18n } from "../i18n"
import styles from "./Appearance.module.css"
import { AppearanceColorPicker } from "./AppearanceColorPicker"
import colorStyles from "./AppearanceColorPicker.module.css"

const css = (value: string | undefined) => value ?? ""

const themeChoices = [
  {
    value: "system",
    icon: <Monitor aria-hidden="true" size={18} />,
    key: "appearance.system",
    shortKey: "appearance.systemShort",
  },
  {
    value: "light",
    icon: <Sun aria-hidden="true" size={18} />,
    key: "appearance.light",
    shortKey: "appearance.lightShort",
  },
  {
    value: "dark",
    icon: <Moon aria-hidden="true" size={18} />,
    key: "appearance.dark",
    shortKey: "appearance.darkShort",
  },
] as const

const languageChoices = [
  { value: "th", label: "ไทย" },
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
] as const

const presetLabels: Record<(typeof ACCENT_PRESET_IDS)[number], string> = {
  rose: "Rose",
  coral: "Coral",
  indigo: "Indigo",
  forest: "Forest",
  violet: "Violet",
  amber: "Amber",
  berry: "Berry",
  teal: "Teal",
  slate: "Slate",
  clay: "Clay",
  mint: "Mint",
}

function scaleValue(value: number | number[]) {
  return Array.isArray(value) ? (value[0] ?? 1) : value
}

function Preview({ settings }: { settings: AppearanceSettings }) {
  const { text, t } = useI18n()
  const accent = resolveAccentColor(settings)
  const style = { "--preview-accent": accent } as CSSProperties
  return (
    <aside className={styles.preview} style={style}>
      <div className={styles.previewHeader}>
        <div>
          <span>{text({ th: "ตัวอย่างทันที", en: "Live preview", zh: "实时预览" })}</span>
          <strong>
            {text({ th: "ตัวอย่างหน้าจอ RegChula", en: "RegChula preview", zh: "RegChula 预览" })}
          </strong>
        </div>
      </div>
      <div className={styles.previewBody}>
        <div className={styles.previewMetric}>
          <span>{t("common.currentTerm")}</span>
          <strong>2569/1</strong>
        </div>
        <article className={styles.previewCard}>
          <div>
            <strong>2301107</strong>
            <span>{settings.language === "th" ? "แคลคูลัส" : "Calculus"}</span>
          </div>
          <span className={styles.previewAction}>
            {text({ th: "ตัวอย่างปุ่ม", en: "Button preview", zh: "按钮示例" })}
          </span>
        </article>
        <div className={styles.previewLabels}>
          <span data-style={settings.labelStyle}>
            {text({ th: "3 หน่วยกิต", en: "3 credits", zh: "3 学分" })}
          </span>
          <span data-style={settings.labelStyle}>
            {text({ th: "ตอน 10", en: "Section 10", zh: "第 10 班" })}
          </span>
        </div>
        <div className={styles.previewRows}>
          <span />
          <span />
          <span />
        </div>
      </div>
    </aside>
  )
}

export function AppearancePage() {
  const { settings, update, reset, isLoading, isSaving, error } = useAppearance()
  const { t, text } = useI18n()
  const persistedAccent = resolveAccentColor(settings)
  const [draftAccent, setDraftAccent] = useState(persistedAccent)
  const [scaleDraft, setScaleDraft] = useState(settings.uiScale)
  const [widthDraft, setWidthDraft] = useState(settings.contentWidth)
  const [resetOpen, setResetOpen] = useState(false)
  const accentFrame = useRef<number | null>(null)
  const committedAccent = useRef<string | null>(null)
  const previewedAccent = useRef<string | null>(null)
  const resetTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (previewedAccent.current) {
      applyAppearance({
        ...settings,
        accentPreset: "custom",
        customAccent: previewedAccent.current,
      })
      return
    }
    setDraftAccent(persistedAccent)
    committedAccent.current = null
  }, [persistedAccent, settings])

  useEffect(() => {
    setScaleDraft(settings.uiScale)
  }, [settings.uiScale])

  useEffect(() => {
    setWidthDraft(settings.contentWidth)
  }, [settings.contentWidth])

  useEffect(() => {
    if (error) committedAccent.current = null
  }, [error])

  useEffect(
    () => () => {
      if (accentFrame.current) window.cancelAnimationFrame(accentFrame.current)
    },
    [],
  )

  const previewScale = (value: number | number[]) => {
    const next = scaleValue(value)
    setScaleDraft(next)
    applyAppearance({ ...settings, uiScale: next })
  }

  const commitScale = (value: number | number[]) => {
    const next = scaleValue(value)
    setScaleDraft(next)
    update({ uiScale: next })
  }

  const previewWidth = (value: number | number[]) => {
    const next = scaleValue(value)
    setWidthDraft(next)
    applyAppearance({ ...settings, contentWidth: next })
  }

  const commitWidth = (value: number | number[]) => {
    const next = scaleValue(value)
    setWidthDraft(next)
    update({ contentWidth: next })
  }

  const previewAccent = (value: string) => {
    const normalized = normalizeHex(value)
    if (!normalized) return
    previewedAccent.current = normalized
    setDraftAccent(normalized)
    if (accentFrame.current) window.cancelAnimationFrame(accentFrame.current)
    accentFrame.current = window.requestAnimationFrame(() => {
      accentFrame.current = null
      applyAppearance({ ...settings, accentPreset: "custom", customAccent: normalized })
    })
  }

  const commitAccent = (value: string) => {
    if (accentFrame.current !== null) window.cancelAnimationFrame(accentFrame.current)
    accentFrame.current = null
    const normalized = normalizeHex(value)
    if (normalized && committedAccent.current !== normalized) {
      previewedAccent.current = null
      committedAccent.current = normalized
      update({ accentPreset: "custom", customAccent: normalized })
    }
  }

  const cancelAccent = () => {
    previewedAccent.current = null
    committedAccent.current = null
    if (accentFrame.current) window.cancelAnimationFrame(accentFrame.current)
    accentFrame.current = null
    setDraftAccent(persistedAccent)
    applyAppearance(settings)
  }

  const closeReset = () => {
    setResetOpen(false)
    window.requestAnimationFrame(() => resetTriggerRef.current?.focus({ preventScroll: true }))
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>
            {text({ th: "การตั้งค่าของคุณ", en: "Your settings", zh: "你的设置" })}
          </span>
          <h1>{t("appearance.title")}</h1>
          <p>{t("appearance.subtitle")}</p>
        </div>
        <div className={styles.saveState} aria-live="polite">
          {isLoading
            ? t("common.loading")
            : isSaving
              ? t("appearance.saving")
              : t("appearance.saved")}
        </div>
      </header>

      {error ? <Status tone="error">{error.message || t("appearance.saveError")}</Status> : null}

      <div className={styles.layout}>
        <div className={styles.controls}>
          <section className={styles.section} aria-labelledby="language-heading">
            <div className={styles.sectionHeading}>
              <Languages aria-hidden="true" size={18} />
              <div>
                <h2 id="language-heading">{t("appearance.language")}</h2>
                <p>{t("appearance.readability")}</p>
              </div>
            </div>
            <RadioGroup
              aria-label={t("appearance.language")}
              className={css(styles.segmented)}
              onChange={(value) =>
                update({ language: value === "en" || value === "zh" ? value : "th" })
              }
              value={settings.language}
            >
              {languageChoices.map((choice) => (
                <Radio className={css(styles.segment)} key={choice.value} value={choice.value}>
                  <Radio.Content className={css(styles.segmentContent)}>
                    {settings.language === choice.value ? (
                      <span
                        aria-hidden="true"
                        className={styles.selectionMark}
                        data-selection-mark="true"
                      >
                        <Check size={14} />
                      </span>
                    ) : null}
                    <span className={styles.segmentLabel}>{choice.label}</span>
                  </Radio.Content>
                </Radio>
              ))}
            </RadioGroup>
          </section>

          <section className={styles.section} aria-labelledby="scale-heading">
            <div className={styles.sectionHeading}>
              <Type aria-hidden="true" size={18} />
              <div>
                <h2 id="scale-heading">{t("appearance.scale")}</h2>
                <p>{Math.round(scaleDraft * 100)}%</p>
              </div>
            </div>
            <Slider
              data-sidebar-swipe="ignore"
              aria-label={t("appearance.scale")}
              className={css(styles.slider)}
              maxValue={1.35}
              minValue={0.9}
              onChange={previewScale}
              onChangeEnd={commitScale}
              step={0.05}
              value={scaleDraft}
            >
              <Slider.Track className={css(styles.sliderTrack)}>
                <Slider.Fill className={css(styles.sliderFill)} />
                <Slider.Thumb className={css(styles.sliderThumb)} />
              </Slider.Track>
            </Slider>
            <div className={styles.rangeLabels}>
              <span>90%</span>
              <span>135%</span>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="theme-heading">
            <div className={styles.sectionHeading}>
              <Palette aria-hidden="true" size={18} />
              <div>
                <h2 id="theme-heading">{t("appearance.color")}</h2>
                <p>{t("appearance.accent")}</p>
              </div>
            </div>
            <RadioGroup
              aria-label={t("appearance.color")}
              className={css(styles.themeChoices)}
              onChange={(value) => {
                if (value === "system" || value === "light" || value === "dark")
                  update({ theme: value })
              }}
              value={settings.theme}
            >
              {themeChoices.map((choice) => (
                <Radio
                  aria-label={t(choice.key)}
                  className={css(styles.themeChoice)}
                  key={choice.value}
                  value={choice.value}
                >
                  <Radio.Content className={css(styles.themeChoiceContent)}>
                    {choice.icon}
                    <span className={styles.themeChoiceLabel}>
                      <span className={styles.themeChoiceLabelCompact}>{t(choice.shortKey)}</span>
                      <span className={styles.themeChoiceLabelFull}>{t(choice.key)}</span>
                    </span>
                    {settings.theme === choice.value ? (
                      <span
                        aria-hidden="true"
                        className={styles.selectionMark}
                        data-selection-mark="true"
                      >
                        <Check size={14} />
                      </span>
                    ) : null}
                  </Radio.Content>
                </Radio>
              ))}
            </RadioGroup>

            <div className={styles.swatchWrap}>
              <ColorSwatchPicker
                aria-label={t("appearance.accent")}
                className={css(styles.swatches)}
                onChange={(color) => {
                  const value = normalizeHex(color.toString("hex"))
                  if (!value) return
                  const preset = ACCENT_PRESET_IDS.find((id) => ACCENT_PRESET_CATALOG[id] === value)
                  if (preset) update({ accentPreset: preset, customAccent: null })
                }}
                value={resolveAccentColor(settings)}
              >
                {ACCENT_PRESET_IDS.map((id) => (
                  <ColorSwatchPicker.Item
                    aria-label={presetLabels[id]}
                    className={css(colorStyles.paletteItem)}
                    color={ACCENT_PRESET_CATALOG[id]}
                    key={id}
                  >
                    <ColorSwatchPicker.Swatch />
                    <ColorSwatchPicker.Indicator>
                      <Check aria-hidden="true" size={13} />
                    </ColorSwatchPicker.Indicator>
                    <span className={styles.visuallyHidden}>{presetLabels[id]}</span>
                  </ColorSwatchPicker.Item>
                ))}
              </ColorSwatchPicker>
            </div>

            <AppearanceColorPicker
              value={persistedAccent}
              onPreview={previewAccent}
              onCommit={commitAccent}
              onCancel={cancelAccent}
            />
          </section>

          <section className={styles.section} aria-label={t("appearance.labelStyle")}>
            <div className={styles.desktopLayout}>
              <div className={styles.sectionHeading}>
                <LayoutPanelTop aria-hidden="true" size={18} />
                <div>
                  <h2 id="layout-heading">{t("appearance.layout")}</h2>
                  <p>
                    {settings.contentLayout === "fluid" ? t("appearance.fluid") : `${widthDraft}px`}
                  </p>
                </div>
              </div>
              <SelectField
                label={t("appearance.contentLayout")}
                value={settings.contentLayout}
                options={[
                  { value: "fluid", label: t("appearance.fluid") },
                  { value: "contained", label: t("appearance.contained") },
                ]}
                onValueChange={(value) =>
                  update({ contentLayout: value === "contained" ? "contained" : "fluid" })
                }
              />
              {settings.contentLayout === "contained" ? (
                <div className={styles.widthControl}>
                  <Slider
                    data-sidebar-swipe="ignore"
                    aria-label={t("appearance.width")}
                    className={css(styles.slider)}
                    maxValue={1360}
                    minValue={960}
                    onChange={previewWidth}
                    onChangeEnd={commitWidth}
                    step={20}
                    value={widthDraft}
                  >
                    <Slider.Track className={css(styles.sliderTrack)}>
                      <Slider.Fill className={css(styles.sliderFill)} />
                      <Slider.Thumb className={css(styles.sliderThumb)} />
                    </Slider.Track>
                  </Slider>
                  <div className={styles.rangeLabels}>
                    <span>960px</span>
                    <span>1360px</span>
                  </div>
                </div>
              ) : (
                <p className={styles.layoutHint}>{t("appearance.fluidHint")}</p>
              )}
            </div>

            <RadioGroup
              aria-label={t("appearance.labelStyle")}
              className={css(styles.choiceGrid)}
              onChange={(value) => update({ labelStyle: value === "solid" ? "solid" : "soft" })}
              value={settings.labelStyle}
            >
              <Radio className={css(styles.choiceCard)} value="soft">
                <Radio.Content className={css(styles.choiceCardContent)}>
                  <span className={styles.choiceCardCopy}>
                    <strong>{t("appearance.soft")}</strong>
                    <small>{t("appearance.labelStyle")}</small>
                  </span>
                  {settings.labelStyle === "soft" ? (
                    <span
                      aria-hidden="true"
                      className={styles.selectionMark}
                      data-selection-mark="true"
                    >
                      <Check size={14} />
                    </span>
                  ) : null}
                </Radio.Content>
              </Radio>
              <Radio className={css(styles.choiceCard)} value="solid">
                <Radio.Content className={css(styles.choiceCardContent)}>
                  <span className={styles.choiceCardCopy}>
                    <strong>{t("appearance.solid")}</strong>
                    <small>{t("appearance.labelStyle")}</small>
                  </span>
                  {settings.labelStyle === "solid" ? (
                    <span
                      aria-hidden="true"
                      className={styles.selectionMark}
                      data-selection-mark="true"
                    >
                      <Check size={14} />
                    </span>
                  ) : null}
                </Radio.Content>
              </Radio>
            </RadioGroup>
          </section>

          <section
            className={(styles.section ?? "") + " " + (styles.detailSection ?? "")}
            aria-labelledby="detail-heading"
          >
            <div className={styles.sectionHeading}>
              <PanelRight aria-hidden="true" size={18} />
              <div>
                <h2 id="detail-heading">{t("appearance.detail")}</h2>
                <p>{t("appearance.behavior")}</p>
              </div>
            </div>
            <RadioGroup
              aria-label={t("appearance.detail")}
              className={css(styles.choiceGrid)}
              onChange={(value) =>
                update({ detailPresentation: value === "drawer" ? "drawer" : "modal" })
              }
              value={settings.detailPresentation}
            >
              <Radio className={css(styles.choiceCard)} value="drawer">
                <Radio.Content className={css(styles.choiceCardContent)}>
                  <span className={styles.choiceCardCopy}>
                    <strong>{t("appearance.drawer")}</strong>
                    <small>{text({ th: "เดสก์ท็อป", en: "Desktop", zh: "桌面端" })}</small>
                  </span>
                  {settings.detailPresentation === "drawer" ? (
                    <span
                      aria-hidden="true"
                      className={styles.selectionMark}
                      data-selection-mark="true"
                    >
                      <Check size={14} />
                    </span>
                  ) : null}
                </Radio.Content>
              </Radio>
              <Radio className={css(styles.choiceCard)} value="modal">
                <Radio.Content className={css(styles.choiceCardContent)}>
                  <span className={styles.choiceCardCopy}>
                    <strong>{t("appearance.modal")}</strong>
                    <small>{text({ th: "เดสก์ท็อป", en: "Desktop", zh: "桌面端" })}</small>
                  </span>
                  {settings.detailPresentation === "modal" ? (
                    <span
                      aria-hidden="true"
                      className={styles.selectionMark}
                      data-selection-mark="true"
                    >
                      <Check size={14} />
                    </span>
                  ) : null}
                </Radio.Content>
              </Radio>
            </RadioGroup>
            <p className={styles.mobileNote}>
              {text({
                th: "บนหน้าจอขนาดเล็ก ระบบจะแสดงรายละเอียดในแผงด้านข้างเสมอ",
                en: "On smaller screens, course details always open in a side panel.",
                zh: "在小屏幕上，课程详情始终在侧边面板中打开。",
              })}
            </p>
          </section>

          <section className={styles.resetSection}>
            <RotateCcw aria-hidden="true" size={18} />
            <div>
              <strong>{t("common.reset")}</strong>
              <span>
                {text({
                  th: "คืนค่าภาษา สี ขนาด และรูปแบบหน้าจอ",
                  en: "Restore your language, colors, size, and layout.",
                  zh: "恢复语言、配色、界面大小和页面布局。",
                })}
              </span>
            </div>
            <Button
              onClick={() => setResetOpen(true)}
              ref={resetTriggerRef}
              type="button"
              variant="outline"
            >
              {t("common.reset")}
            </Button>
          </section>
        </div>

        <Preview settings={{ ...settings, accentPreset: "custom", customAccent: draftAccent }} />
      </div>

      <AlertDialog.Backdrop
        className={css(styles.resetBackdrop)}
        isDismissable
        isKeyboardDismissDisabled={false}
        isOpen={resetOpen}
        onOpenChange={(open) => (open ? setResetOpen(true) : closeReset())}
      >
        <AlertDialog.Container className={css(styles.resetDialog)} placement="center">
          <AlertDialog.Dialog aria-label={t("common.reset")}>
            <AlertDialog.Header>
              <AlertDialog.Heading>{t("common.reset")}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>{t("appearance.resetConfirm")}</p>
            </AlertDialog.Body>
            <AlertDialog.Footer className={css(styles.resetActions)}>
              <Button onClick={closeReset} type="button" variant="quiet">
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => {
                  reset()
                  closeReset()
                }}
                type="button"
                variant="primary"
              >
                {t("common.reset")}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  )
}
