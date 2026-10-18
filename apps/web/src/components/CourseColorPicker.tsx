import { Popover } from "@heroui/react"
import {
  defaultScheduleColor,
  SCHEDULE_COLOR_IDS,
  SCHEDULE_COLOR_PALETTE,
  readableForeground,
  type ScheduleColorId,
} from "@regchula/appearance"
import { Check, Palette, RotateCcw } from "lucide-react"
import { useState, type CSSProperties } from "react"
import { useI18n } from "../i18n"
import { Button } from "./ui"
import styles from "./CourseColorPicker.module.css"

const css = (value: string | undefined) => value ?? ""

const labels: Record<ScheduleColorId, { th: string; en: string; zh: string }> = {
  rose: { th: "ชมพู", en: "Rose", zh: "粉红" },
  orange: { th: "ส้ม", en: "Orange", zh: "橙色" },
  amber: { th: "เหลืองอำพัน", en: "Amber", zh: "琥珀色" },
  green: { th: "เขียว", en: "Green", zh: "绿色" },
  teal: { th: "เขียวน้ำทะเล", en: "Teal", zh: "青色" },
  blue: { th: "ฟ้า", en: "Blue", zh: "蓝色" },
  indigo: { th: "คราม", en: "Indigo", zh: "靛蓝" },
  violet: { th: "ม่วง", en: "Violet", zh: "紫色" },
}

const swatchStyle = (id: ScheduleColorId) =>
  ({
    "--swatch-color": SCHEDULE_COLOR_PALETTE[id],
    "--swatch-ink": readableForeground(SCHEDULE_COLOR_PALETTE[id]),
  }) as CSSProperties

export function CourseColorPicker({
  courseCode,
  colorId,
  pending,
  onChange,
  onReset,
}: {
  courseCode: string
  colorId: ScheduleColorId
  pending: boolean
  onChange: (colorId: ScheduleColorId) => void
  onReset: () => void
}) {
  const { text } = useI18n()
  const [open, setOpen] = useState(false)
  const choose = (next: ScheduleColorId) => {
    onChange(next)
    setOpen(false)
  }
  return (
    <Popover
      isOpen={open}
      onOpenChange={(next) => {
        if (!next || !pending) setOpen(next)
      }}
    >
      <Popover.Trigger
        aria-label={text({
          th: "เปลี่ยนสีรายวิชา " + courseCode,
          en: "Change color for " + courseCode,
          zh: "更改课程 " + courseCode + " 的颜色",
        })}
        className={css(styles.trigger)}
        aria-disabled={pending}
      >
        <Palette aria-hidden="true" size={15} />
        <span aria-hidden="true" className={styles.currentSwatch} style={swatchStyle(colorId)} />
      </Popover.Trigger>
      <Popover.Content className={css(styles.popover)} placement="bottom end">
        <Popover.Dialog
          aria-label={text({
            th: "สีรายวิชา " + courseCode,
            en: "Course color for " + courseCode,
            zh: "课程 " + courseCode + " 的颜色",
          })}
          className={css(styles.dialog)}
        >
          <strong>{text({ th: "สีในตาราง", en: "Schedule color", zh: "课程表颜色" })}</strong>
          <div className={styles.swatches}>
            {SCHEDULE_COLOR_IDS.map((id) => (
              <button
                aria-label={text(labels[id])}
                aria-pressed={colorId === id}
                disabled={pending}
                key={id}
                onClick={() => choose(id)}
                style={swatchStyle(id)}
                type="button"
              >
                {colorId === id ? <Check aria-hidden="true" size={14} /> : null}
              </button>
            ))}
          </div>
          <Button
            disabled={pending}
            onClick={() => {
              onReset()
              setOpen(false)
            }}
            type="button"
            variant="quiet"
          >
            <RotateCcw aria-hidden="true" size={14} />
            {text({
              th: "คืนค่าสีอัตโนมัติ (" + text(labels[defaultScheduleColor(courseCode)]) + ")",
              en: "Use automatic color (" + text(labels[defaultScheduleColor(courseCode)]) + ")",
              zh: "恢复自动颜色（" + text(labels[defaultScheduleColor(courseCode)]) + "）",
            })}
          </Button>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
