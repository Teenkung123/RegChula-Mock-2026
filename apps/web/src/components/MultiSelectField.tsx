import { Drawer, ListBox, Modal } from "@heroui/react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useI18n } from "../i18n"
import { Button, Field } from "./ui"
import styles from "./MultiSelectField.module.css"

export interface MultiSelectOption {
  id: string
  label: string
  disabled?: boolean
}

const css = (value: string | undefined) => value ?? ""

export function MultiSelectField({
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  label: string
  onChange: (value: string[]) => void
  options: MultiSelectOption[]
  placeholder: string
  value: string[]
}) {
  const { text } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 40rem)").matches)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const selected = useMemo(() => new Set(value), [value])
  const filtered = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  const selectedLabel =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((option) => option.id === value[0])?.label ?? placeholder)
        : `${value.length} ${text({ th: "รายการ", en: "selected", zh: "项已选" })}`

  useEffect(() => {
    const media = window.matchMedia("(max-width: 40rem)")
    const update = () => setNarrow(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  const close = () => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }))
  }
  const content = (
    <>
      <div className={styles.header}>
        <div>
          <h2>{label}</h2>
          <p>{placeholder}</p>
        </div>
        <Button
          aria-label={text({ th: "ปิด", en: "Close", zh: "关闭" })}
          onClick={close}
          type="button"
          variant="quiet"
        >
          <X aria-hidden="true" size={18} />
        </Button>
      </div>
      <div className={styles.search}>
        <Search aria-hidden="true" size={16} />
        <Field
          label={label}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={text({ th: "ค้นหา", en: "Search", zh: "搜索" })}
          value={query}
        />
      </div>
      <ListBox
        aria-label={label}
        className={css(styles.list)}
        onSelectionChange={(keys) => {
          if (keys === "all")
            onChange(options.filter((option) => !option.disabled).map((option) => option.id))
          else onChange([...keys].map(String))
        }}
        selectedKeys={selected}
        selectionMode="multiple"
      >
        {filtered.map((option) => (
          <ListBox.Item
            id={option.id}
            isDisabled={option.disabled ?? false}
            key={option.id}
            textValue={option.label}
          >
            <span>{option.label}</span>
            {selected.has(option.id) ? <Check aria-hidden="true" size={16} /> : null}
          </ListBox.Item>
        ))}
      </ListBox>
      <div className={styles.actions}>
        <Button onClick={close} type="button" variant="primary">
          {text({ th: "เสร็จสิ้น", en: "Done", zh: "完成" })}
        </Button>
      </div>
    </>
  )

  return (
    <div className={styles.field}>
      <span>{label}</span>
      <Button
        className={css(styles.trigger)}
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
        variant="outline"
      >
        <span>{selectedLabel}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </Button>
      {narrow ? (
        <Drawer.Backdrop
          isDismissable
          isOpen={open}
          onOpenChange={(next) => (next ? setOpen(true) : close())}
        >
          <Drawer.Content className={css(styles.drawer)} placement="bottom">
            <Drawer.Dialog aria-label={label}>{content}</Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      ) : (
        <Modal.Backdrop
          isDismissable
          isOpen={open}
          onOpenChange={(next) => (next ? setOpen(true) : close())}
        >
          <Modal.Container className={css(styles.modal)} placement="center">
            <Modal.Dialog aria-label={label}>{content}</Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      )}
    </div>
  )
}
