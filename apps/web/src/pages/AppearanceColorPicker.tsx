import {
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  type ColorValue,
  Label,
  parseColor,
} from "@heroui/react"
import { normalizeHex } from "@regchula/appearance"
import { useEffect, useRef, useState } from "react"
import { Button } from "../components/ui"
import { useI18n } from "../i18n"
import appearanceStyles from "./Appearance.module.css"
import styles from "./AppearanceColorPicker.module.css"

type Props = {
  value: string
  onPreview: (value: string) => void
  onCommit: (value: string) => void
  onCancel: () => void
}

export function AppearanceColorPicker({ value, onPreview, onCommit, onCancel }: Props) {
  const { t, text } = useI18n()
  const [open, setOpen] = useState(false)
  const [color, setColor] = useState<ColorValue>(() => parseColor(value))
  const active = useRef(false)
  const rawHex = useRef<string | null>(null)

  useEffect(() => {
    if (!active.current) setColor(parseColor(value))
  }, [value])

  const cancel = () => {
    if (!active.current) return
    active.current = false
    rawHex.current = null
    setOpen(false)
    setColor(parseColor(value))
    onCancel()
  }

  const commit = (hex: string) => {
    if (!active.current) return
    active.current = false
    rawHex.current = null
    setOpen(false)
    setColor(parseColor(hex))
    onCommit(hex)
  }

  const preview = (next: ColorValue) => {
    if (!active.current) return
    setColor(next)
    onPreview(next.toString("hex"))
  }

  return (
    <ColorPicker value={color} onChange={preview}>
      <ColorPicker.Trigger
        aria-expanded={open}
        className={`${appearanceStyles.customColorTrigger} ${styles.trigger}`}
        data-inline-control="color-picker"
        onPress={() => {
          if (active.current) {
            cancel()
            return
          }
          active.current = true
          rawHex.current = null
          setColor(parseColor(value))
          setOpen(true)
        }}
      >
        <ColorSwatch className={appearanceStyles.customSwatch ?? ""} />
        <span>{t("appearance.customColor")}</span>
        <code>{color.toString("hex")}</code>
      </ColorPicker.Trigger>
      <ColorPicker.Popover
        aria-label={t("appearance.customColor")}
        className={appearanceStyles.colorPopover ?? ""}
        isOpen={open}
        onOpenChange={(next) => {
          if (!next) cancel()
        }}
        placement="bottom start"
      >
        <div
          className={styles.content}
          onKeyDownCapture={(event) => {
            if (event.key === "Escape") cancel()
          }}
        >
          <ColorArea
            aria-label={text({
              th: "ความอิ่มตัวและความสว่าง",
              en: "Saturation and brightness",
              zh: "饱和度和亮度",
            })}
            className={styles.area ?? ""}
            colorSpace="hsb"
            xChannel="saturation"
            yChannel="brightness"
          >
            <ColorArea.Thumb className={styles.thumb ?? ""} />
          </ColorArea>
          <ColorSlider
            aria-label={text({ th: "เฉดสี", en: "Hue", zh: "色相" })}
            channel="hue"
            className={styles.slider ?? ""}
            colorSpace="hsb"
          >
            <ColorSlider.Track className={styles.track ?? ""}>
              <ColorSlider.Thumb className={styles.thumb ?? ""} />
            </ColorSlider.Track>
          </ColorSlider>
          <ColorField>
            <Label>{t("appearance.customColor")} (HEX)</Label>
            <ColorField.Group className={styles.field ?? ""}>
              <ColorField.Input
                onInput={(event) => {
                  rawHex.current = event.currentTarget.value
                  const hex = normalizeHex(event.currentTarget.value)
                  if (hex) preview(parseColor(hex))
                }}
              />
            </ColorField.Group>
          </ColorField>
          <div className={styles.actions}>
            <Button data-color-action="cancel" onClick={cancel} type="button" variant="quiet">
              {t("common.cancel")}
            </Button>
            <Button
              data-color-action="save"
              onClick={() => {
                const hex = normalizeHex(rawHex.current ?? color.toString("hex"))
                if (hex) commit(hex)
              }}
              type="button"
              variant="primary"
            >
              {t("common.save")}
            </Button>
          </div>
        </div>
      </ColorPicker.Popover>
    </ColorPicker>
  )
}
