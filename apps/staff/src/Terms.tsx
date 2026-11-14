import { Button, Input, Label, ListBox, Select, TextField } from "./ui"
import { toast } from "@heroui/react"
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react"
import { EditorModal } from "./EditorModal"
import { errorMessage, request } from "./api"

interface Term {
  id: number
  academicYear: number
  semester: number
  label: string
  active: boolean
  isCurrent: boolean
  opensAt: string | null
  closesAt: string | null
}

const localDateTime = (value: string | null) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function Terms() {
  const [terms, setTerms] = useState<Term[]>([])
  const [selected, setSelected] = useState("")
  const [editorOpen, setEditorOpen] = useState(false)
  const [year, setYear] = useState("")
  const [semester, setSemester] = useState("1")
  const [label, setLabel] = useState("")
  const [opens, setOpens] = useState("")
  const [closes, setCloses] = useState("")
  const [active, setActive] = useState(true)
  const [isCurrent, setIsCurrent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const editorTrigger = useRef<HTMLElement | null>(null)
  const load = useCallback(async () => {
    setTerms(await request<Term[]>("/api/v1/staff/terms"))
  }, [])
  useEffect(() => {
    void load()
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [load])
  useEffect(() => {
    if (editorOpen || busy) return
    const frame = requestAnimationFrame(() => editorTrigger.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [editorOpen, busy])

  const current = terms.find((term) => String(term.id) === selected)
  const openEditor = (term?: Term, trigger?: HTMLElement) => {
    if (busy) return
    editorTrigger.current = trigger ?? null
    setSelected(term ? String(term.id) : "")
    setYear("")
    setSemester("1")
    setLabel(term?.label ?? "")
    setOpens(localDateTime(term?.opensAt ?? null))
    setCloses(localDateTime(term?.closesAt ?? null))
    setActive(term?.active ?? true)
    setIsCurrent(term?.isCurrent ?? false)
    setError("")
    setMessage("")
    setEditorOpen(true)
  }
  const closeEditor = () => {
    if (!busy) setEditorOpen(false)
  }
  const action = async (
    work: () => Promise<unknown>,
    success: string,
  ) => {
    if (busy) return
    setBusy(true)
    setError("")
    setMessage("")
    let saved = false
    try {
      await work()
      saved = true
      setMessage(success)
      toast.success(success, { timeout: 4_500 })
      setEditorOpen(false)
      await load()
    } catch (e) {
      setError(saved ? `บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่ได้: ${errorMessage(e)}` : errorMessage(e))
      if (saved) {
        toast.warning("บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่ได้", {
          description: errorMessage(e),
          timeout: 6_000,
        })
      }
    } finally {
      setBusy(false)
    }
  }
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    if (Boolean(opens) !== Boolean(closes)) {
      setError("กรุณาระบุเวลาเริ่มและสิ้นสุดการลงทะเบียนให้ครบถ้วน")
      return
    }
    if (opens && closes && new Date(opens) >= new Date(closes)) {
      setError("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น")
      return
    }
    if (isCurrent && !active) {
      setError("ภาคการศึกษาปัจจุบันต้องเปิดใช้งาน")
      return
    }
    void action(
      () => current
        ? request(`/api/v1/staff/terms/${current.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              label: label.trim(),
              opensAt: opens ? new Date(opens).toISOString() : null,
              closesAt: closes ? new Date(closes).toISOString() : null,
              active,
              isCurrent,
            }),
          })
        : request("/api/v1/staff/terms", {
            method: "POST",
            body: JSON.stringify({
              academicYear: Number(year),
              semester: Number(semester),
              label: label.trim(),
            }),
          }),
      current ? "บันทึกภาคการศึกษาแล้ว" : "เพิ่มภาคการศึกษาแล้ว",
    )
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">งานทะเบียน</p>
          <h1>ภาคการศึกษาและการลงทะเบียน</h1>
          <p>จัดการภาคการศึกษาและช่วงเวลาลงทะเบียน</p>
        </div>
        <Button variant="primary" isDisabled={busy || loading} onPress={(event) => openEditor(undefined, event.target as HTMLElement)}>
          เพิ่มภาคการศึกษา
        </Button>
      </div>
      {!editorOpen && error && <p className="error" role="alert">{error}</p>}
      {!editorOpen && message && <p className="success" role="status">{message}</p>}
      <section className="panel">
        <h2>ภาคการศึกษา</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ภาคการศึกษา</th>
                <th>ปีการศึกษา</th>
                <th>ช่วงเวลาลงทะเบียน</th>
                <th>สถานะ</th>
                <th><span className="sr-only">จัดการ</span></th>
              </tr>
            </thead>
            <tbody>
              {terms.map((term) => (
                <tr key={term.id}>
                  <td>{term.label}</td>
                  <td>{term.academicYear}</td>
                  <td>
                    {term.opensAt && term.closesAt
                      ? `${new Date(term.opensAt).toLocaleString()} – ${new Date(term.closesAt).toLocaleString()}`
                      : "ยังไม่ได้กำหนด"}
                  </td>
                  <td>{term.isCurrent ? "ปัจจุบัน" : term.active ? "ใช้งาน" : "ไม่ใช้งาน"}</td>
                  <td>
                    <Button variant="secondary" isDisabled={busy} onPress={(event) => openEditor(term, event.target as HTMLElement)}>
                      แก้ไข
                    </Button>
                  </td>
                </tr>
              ))}
              {!terms.length && (
                <tr>
                  <td colSpan={5}>{loading ? <span role="status">กำลังโหลดภาคการศึกษา...</span> : "ไม่มีภาคการศึกษา"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <EditorModal
        isOpen={editorOpen}
        onClose={closeEditor}
        title={current ? `แก้ไข ${current.label}` : "เพิ่มภาคการศึกษา"}
        busy={busy}
        error={error}
        message={message}
        footer={
          <>
            <Button variant="secondary" isDisabled={busy} onPress={closeEditor}>ยกเลิก</Button>
            <Button
              type="submit"
              form="term-editor-form"
              variant="primary"
              isPending={busy}
              isDisabled={busy || !label.trim() || (!current && !year) || Boolean(opens) !== Boolean(closes)}
            >
              {busy ? "กำลังบันทึก..." : "บันทึกและปิด"}
            </Button>
          </>
        }
      >
        <form id="term-editor-form" onSubmit={save}>
          <div className="form-grid">
            {!current && (
              <>
                <TextField className="field" isRequired isDisabled={busy}>
                  <Label>ปีการศึกษา</Label>
                  <Input autoFocus type="number" min={1} max={9999} step={1} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2569" />
                </TextField>
                <Select className="field" selectedKey={semester} isDisabled={busy} onSelectionChange={(key) => setSemester(String(key))}>
                  <Label>ภาคการศึกษา</Label>
                  <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="1" textValue="ภาคต้น">ภาคต้น</ListBox.Item>
                      <ListBox.Item id="2" textValue="ภาคปลาย">ภาคปลาย</ListBox.Item>
                      <ListBox.Item id="3" textValue="ภาคฤดูร้อน">ภาคฤดูร้อน</ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
              </>
            )}
            <TextField className="field form-field-wide" isRequired isDisabled={busy}>
              <Label>ชื่อภาคการศึกษา</Label>
              <Input autoFocus={Boolean(current)} maxLength={32} value={label} onChange={(e) => setLabel(e.target.value)} />
            </TextField>
            {current && (
              <>
                <h3>ช่วงเวลาลงทะเบียน</h3>
                <TextField className="field" isDisabled={busy}>
                  <Label>เริ่มลงทะเบียน</Label>
                  <Input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} />
                </TextField>
                <TextField className="field" isDisabled={busy}>
                  <Label>สิ้นสุดการลงทะเบียน</Label>
                  <Input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
                </TextField>
                <h3>สถานะภาคการศึกษา</h3>
                <Select
                  className="field"
                  selectedKey={active ? "active" : "inactive"}
                  isDisabled={busy || current.isCurrent || isCurrent}
                  onSelectionChange={(key) => setActive(key === "active")}
                >
                  <Label>การใช้งาน</Label>
                  <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="active" textValue="เปิดใช้งาน">เปิดใช้งาน</ListBox.Item>
                      <ListBox.Item id="inactive" textValue="ปิดใช้งาน">ปิดใช้งาน</ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
                <Select
                  className="field"
                  selectedKey={isCurrent ? "current" : "other"}
                  isDisabled={busy || current.isCurrent || !active}
                  onSelectionChange={(key) => setIsCurrent(key === "current")}
                >
                  <Label>ภาคการศึกษาปัจจุบัน</Label>
                  <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="current" textValue="ตั้งเป็นภาคปัจจุบัน">ตั้งเป็นภาคปัจจุบัน</ListBox.Item>
                      <ListBox.Item id="other" textValue="ไม่ใช่ภาคปัจจุบัน">ไม่ใช่ภาคปัจจุบัน</ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
                {current.isCurrent && <p className="muted">เลือกภาคอื่นเป็นภาคปัจจุบันก่อนปิดใช้งานภาคนี้</p>}
              </>
            )}
          </div>
        </form>
      </EditorModal>
    </div>
  )
}
