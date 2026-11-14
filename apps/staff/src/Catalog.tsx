import { Button, Input, Label, ListBox, Select, TextArea, TextField } from "./ui"
import { Tabs, toast } from "@heroui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { request } from "./api"
import { EditorModal } from "./EditorModal"

interface Term {
  id: number
  label: string
  isCurrent: boolean
}
interface Meeting {
  id: number
  classType: string
  dayCode: string | null
  startMinute: number | null
  endMinute: number | null
  periodLabel: string
  building: string | null
  room: string | null
  teachers: string[]
  arranged: boolean
}
interface Section {
  id: number
  sectionNo: string
  capacity: number
  baselineEnrolled: number
  localActive: number
  closed: boolean
  active: boolean
  note: string | null
  genEdType: string | null
  meetings: Meeting[]
}
interface Offering {
  id: number
  courseCode: string
  nameTh: string
  nameEn: string
  faculty: string
  department: string
  credits: number
  active: boolean
  descriptionTh: string | null
  descriptionEn: string | null
  shortName: string | null
  creditHours: string | null
  prerequisiteText: string | null
  genEdType: string | null
  studyPrograms: string[]
  midtermDate: string | null
  midtermStartMinute: number | null
  midtermEndMinute: number | null
  finalDate: string | null
  finalStartMinute: number | null
  finalEndMinute: number | null
  sections: Section[]
}
interface ImportPreview {
  checksum: string
  courseCount: number
  sectionCount: number
  terms: { academicYear: number; semester: number }[]
  reviewTerms: { academicYear: number; semester: number; count: number }[]
  changes: {
    academicYear: number
    semester: number
    added: number
    replaced: number
    removed: number
    overCapacitySections: number
  }[]
  warnings: string[]
}
interface Draft {
  active: boolean
  courseCode: string
  nameTh: string
  nameEn: string
  faculty: string
  department: string
  credits: string
  shortName: string
  creditHours: string
  descriptionTh: string
  descriptionEn: string
  prerequisiteText: string
  genEdType: string
  studyPrograms: string
  midtermDate: string
  midtermStart: string
  midtermEnd: string
  finalDate: string
  finalStart: string
  finalEnd: string
}
const emptyDraft: Draft = {
  active: true,
  courseCode: "",
  nameTh: "",
  nameEn: "",
  faculty: "",
  department: "",
  credits: "",
  shortName: "",
  creditHours: "",
  descriptionTh: "",
  descriptionEn: "",
  prerequisiteText: "",
  genEdType: "",
  studyPrograms: "",
  midtermDate: "",
  midtermStart: "",
  midtermEnd: "",
  finalDate: "",
  finalStart: "",
  finalEnd: "",
}

type MeetingDraft = {
  key: string
  id?: number
  classType: string
  dayCode: string
  start: string
  end: string
  building: string
  room: string
  teachers: string
}
type SectionDraft = {
  key: string
  id?: number
  sectionNo: string
  capacity: string
  baselineEnrolled: number
  localActive: number
  active: boolean
  closed: boolean
  note: string
  genEdType: string
  dirty: boolean
  meetingsDirty: boolean
  meetings: MeetingDraft[]
}
const toTime = (minute: number | null | undefined) =>
  minute == null
    ? ""
    : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
const toMinute = (time: string) =>
  time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : null
const optionalText = (value: string) => value.trim() || null

function TermSelect({
  terms,
  value,
  onChange,
  disabled = false,
}: {
  terms: Term[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <Select
      className="field"
      selectedKey={value || null}
      isDisabled={disabled}
      onSelectionChange={(key) => onChange(key === null ? "" : String(key))}
      placeholder="เลือกภาคการศึกษา"
    >
      <Label>ภาคการศึกษา</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {terms.map((term) => (
            <ListBox.Item id={String(term.id)} key={term.id} textValue={term.label}>
              {term.label}
              {term.isCurrent ? " · ปัจจุบัน" : ""}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

export function Catalog() {
  const [terms, setTerms] = useState<Term[]>([])
  const [term, setTerm] = useState("")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Offering[]>([])
  const [selected, setSelected] = useState<Offering | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [adding, setAdding] = useState(false)
  const [tab, setTab] = useState("general")
  const [sections, setSections] = useState<SectionDraft[]>([])
  const [sectionKey, setSectionKey] = useState<string | null>(null)
  const nextKey = useRef(0)
  const editorTrigger = useRef<HTMLElement | null>(null)
  const editorWasOpen = useRef(false)
  const [file, setFile] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importStage, setImportStage] = useState<"preview" | "confirm" | null>(null)
  const [editorError, setEditorError] = useState("")
  const [importError, setImportError] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const loadVersion = useRef(0)
  const context = `${term}\0${query}`
  const currentContext = useRef(context)
  currentContext.current = context
  const editorOpen = Boolean(selected || adding)
  const sectionDraft = sections.find((section) => section.key === sectionKey)
  useEffect(() => {
    if (editorOpen) editorWasOpen.current = true
    else if (!busy && editorWasOpen.current) {
      editorWasOpen.current = false
      requestAnimationFrame(() => editorTrigger.current?.focus({ preventScroll: true }))
    }
  }, [editorOpen, busy])
  useEffect(() => {
    void request<Term[]>("/api/v1/staff/terms")
      .then((items) => {
        setTerms(items)
        setTerm(String((items.find((item) => item.isCurrent) ?? items[0])?.id ?? ""))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "ไม่สามารถโหลดภาคการศึกษาได้"))
  }, [])
  const load = useCallback(async () => {
    if (!term) return []
    return request<Offering[]>(
      `/api/v1/staff/catalog?${new URLSearchParams({ termId: term, q: query })}`,
    )
  }, [term, query])
  useEffect(() => {
    let active = true
    setLoading(true)
    const timer = window.setTimeout(() => {
      const version = ++loadVersion.current
      void load()
        .then((items) => {
          if (active && version === loadVersion.current) {
            setResults(items)
            setError("")
          }
        })
        .catch((e: unknown) => {
          if (active && version === loadVersion.current)
            setError(e instanceof Error ? e.message : "ไม่สามารถโหลดรายวิชาได้")
        })
        .finally(() => {
          if (active && version === loadVersion.current) setLoading(false)
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [load])
  const run = async (work: () => Promise<unknown>, success: string, refresh = true) => {
    const scope = editorOpen ? "editor" : importOpen ? "import" : "page"
    const originContext = context
    setBusy(true)
    setError("")
    setEditorError("")
    setImportError("")
    setMessage("")
    let saved = false
    try {
      await work()
      saved = true
      setMessage(success)
      if (scope !== "import" || refresh) toast.success(success, { timeout: 4500 })
      if (refresh) {
        const version = ++loadVersion.current
        const items = await load()
        if (currentContext.current === originContext && version === loadVersion.current)
          setResults(items)
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ"
      if (saved) {
        const warning = `บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่ได้: ${detail}`
        setError(warning)
        toast.warning(warning, { timeout: 6000 })
      } else if (scope === "editor") setEditorError(detail)
      else if (scope === "import") setImportError(detail)
      else setError(detail)
    } finally {
      setBusy(false)
    }
    return saved
  }
  const closeEditor = () => {
    if (busy) return
    setSelected(null)
    setAdding(false)
    setSectionKey(null)
    setEditorError("")
  }
  const openEditor = (item?: Offering) => {
    if (busy) return
    editorTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditorError("")
    setMessage("")
    setSelected(item ?? null)
    setAdding(!item)
    setTab("general")
    setSectionKey(null)
    setDraft(
      item
        ? {
            courseCode: item.courseCode,
            nameTh: item.nameTh,
            nameEn: item.nameEn,
            faculty: item.faculty,
            department: item.department,
            credits: String(item.credits),
            active: item.active,
            shortName: item.shortName ?? "",
            creditHours: item.creditHours ?? "",
            descriptionTh: item.descriptionTh ?? "",
            descriptionEn: item.descriptionEn ?? "",
            prerequisiteText: item.prerequisiteText ?? "",
            genEdType: item.genEdType ?? "",
            studyPrograms: (item.studyPrograms ?? []).join(", "),
            midtermDate: item.midtermDate?.slice(0, 10) ?? "",
            midtermStart: toTime(item.midtermStartMinute),
            midtermEnd: toTime(item.midtermEndMinute),
            finalDate: item.finalDate?.slice(0, 10) ?? "",
            finalStart: toTime(item.finalStartMinute),
            finalEnd: toTime(item.finalEndMinute),
          }
        : emptyDraft,
    )
    setSections(
      item?.sections.map((section) => ({
        key: String(section.id),
        id: section.id,
        sectionNo: section.sectionNo,
        capacity: String(section.capacity),
        baselineEnrolled: section.baselineEnrolled,
        localActive: section.localActive,
        closed: section.closed,
        active: section.active,
        note: section.note ?? "",
        genEdType: section.genEdType ?? "",
        dirty: false,
        meetingsDirty: false,
        meetings: section.meetings.map((meeting) => ({
          key: String(meeting.id),
          id: meeting.id,
          classType: meeting.classType,
          dayCode: meeting.dayCode ?? "",
          start: toTime(meeting.startMinute),
          end: toTime(meeting.endMinute),
          building: meeting.building ?? "",
          room: meeting.room ?? "",
          teachers: meeting.teachers.join(", "),
        })),
      })) ?? [],
    )
  }
  const update = (key: keyof Draft, value: string | boolean) =>
    setDraft((item) => ({ ...item, [key]: value }))
  const updateSection = (key: string, values: Partial<SectionDraft>) =>
    setSections((items) =>
      items.map((item) => (item.key === key ? { ...item, ...values, dirty: true } : item)),
    )
  const updateMeeting = (index: number, key: keyof MeetingDraft, value: string) => {
    if (!sectionDraft) return
    updateSection(sectionDraft.key, {
      meetingsDirty: true,
      meetings: sectionDraft.meetings.map((meeting, i) =>
        i === index ? { ...meeting, [key]: value } : meeting,
      ),
    })
  }
  const addSection = () => {
    const key = `new-${nextKey.current++}`
    setSections((items) => [
      ...items,
      {
        key,
        sectionNo: "",
        capacity: "0",
        baselineEnrolled: 0,
        localActive: 0,
        closed: false,
        active: true,
        note: "",
        genEdType: "",
        meetings: [],
        dirty: true,
        meetingsDirty: true,
      },
    ])
    setSectionKey(key)
  }
  const saveOffering = async () => {
    if (
      !draft.nameTh.trim() ||
      !draft.nameEn.trim() ||
      !draft.faculty.trim() ||
      !draft.department.trim() ||
      !draft.credits.trim() ||
      (adding && !draft.courseCode.trim())
    ) {
      setTab("general")
      throw new Error("กรุณาระบุข้อมูลรายวิชาที่จำเป็นให้ครบถ้วน")
    }
    if (
      !Number.isFinite(Number(draft.credits)) ||
      Number(draft.credits) < 0 ||
      Number(draft.credits) > 99
    ) {
      setTab("general")
      throw new Error("หน่วยกิตต้องเป็นตัวเลขระหว่าง 0–99")
    }
    for (const [date, start, end] of [
      [draft.midtermDate, draft.midtermStart, draft.midtermEnd],
      [draft.finalDate, draft.finalStart, draft.finalEnd],
    ] as const) {
      if (
        [date, start, end].some(Boolean) &&
        (![date, start, end].every(Boolean) || start >= end)
      ) {
        setTab("exams")
        throw new Error("กรุณาระบุวันและเวลาเริ่ม–สิ้นสุดการสอบให้ครบถ้วน")
      }
    }
    const usedNumbers = new Set<string>()
    const changedSections = sections
      .filter((section) => section.dirty)
      .map((section) => {
        if (
          !section.sectionNo.trim() ||
          !/^\d+$/.test(section.capacity) ||
          Number(section.capacity) > 100000
        ) {
          setTab("sections")
          setSectionKey(section.key)
          throw new Error("กรุณาระบุตอนเรียนและจำนวนที่รับให้ถูกต้อง")
        }
        const meetings = section.meetingsDirty
          ? section.meetings.map((meeting) => {
              if (
                !meeting.classType.trim() ||
                Boolean(meeting.start) !== Boolean(meeting.end) ||
                (meeting.start && (!meeting.dayCode || meeting.start >= meeting.end))
              ) {
                setTab("sections")
                setSectionKey(section.key)
                throw new Error("กรุณาระบุประเภท วัน และเวลาเรียนให้ครบถ้วน หรือเว้นเวลาไว้หากยังไม่กำหนด")
              }
              return {
                ...(meeting.id === undefined ? {} : { id: meeting.id }),
                classType: meeting.classType.trim(),
                dayCode: meeting.dayCode || null,
                startMinute: toMinute(meeting.start),
                endMinute: toMinute(meeting.end),
                building: optionalText(meeting.building),
                room: optionalText(meeting.room),
                teachers: meeting.teachers
                  .split(",")
                  .map((teacher) => teacher.trim())
                  .filter(Boolean),
              }
            })
          : undefined
        return {
          ...(section.id === undefined ? {} : { id: section.id }),
          sectionNo: section.sectionNo.trim(),
          capacity: Number(section.capacity),
          active: section.active,
          closed: section.closed,
          note: optionalText(section.note),
          genEdType: optionalText(section.genEdType),
          ...(meetings === undefined ? {} : { meetings }),
        }
      })
    for (const section of sections) {
      if (usedNumbers.has(section.sectionNo.trim())) {
        setTab("sections")
        throw new Error("เลขตอนเรียนต้องไม่ซ้ำกัน")
      }
      usedNumbers.add(section.sectionNo.trim())
    }
    const payload = {
      nameTh: draft.nameTh.trim(),
      nameEn: draft.nameEn.trim(),
      faculty: draft.faculty.trim(),
      department: draft.department.trim(),
      credits: Number(draft.credits),
      active: draft.active,
      shortName: optionalText(draft.shortName),
      creditHours: optionalText(draft.creditHours),
      descriptionTh: optionalText(draft.descriptionTh),
      descriptionEn: optionalText(draft.descriptionEn),
      prerequisiteText: optionalText(draft.prerequisiteText),
      genEdType: optionalText(draft.genEdType),
      studyPrograms: draft.studyPrograms
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      midtermDate: draft.midtermDate || null,
      midtermStartMinute: toMinute(draft.midtermStart),
      midtermEndMinute: toMinute(draft.midtermEnd),
      finalDate: draft.finalDate || null,
      finalStartMinute: toMinute(draft.finalStart),
      finalEndMinute: toMinute(draft.finalEnd),
      sections: changedSections,
    }
    if (adding)
      await request("/api/v1/staff/catalog/offerings/editor", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          termId: Number(term),
          courseCode: draft.courseCode.trim(),
        }),
      })
    else if (selected)
      await request(`/api/v1/staff/catalog/offerings/${selected.id}/editor`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
    setSelected(null)
    setAdding(false)
    setSectionKey(null)
  }
  const download = async () => {
    const response = await fetch(
      `/api/v1/staff/catalog/export?termId=${encodeURIComponent(term)}`,
      { credentials: "same-origin" },
    )
    if (!response.ok) throw new Error("ไม่สามารถส่งออกข้อมูลรายวิชาได้")
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement("a")
    link.href = url
    link.download = `catalog-${term}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  const textField = (label: string, key: keyof Draft, type = "text", autoFocus = false) => (
    <TextField className="field">
      <Label>{label}</Label>
      <Input
        autoFocus={autoFocus}
        type={type}
        value={String(draft[key])}
        onChange={(e) => update(key, e.target.value)}
      />
    </TextField>
  )
  const textArea = (label: string, key: keyof Draft) => (
    <TextField className="field">
      <Label>{label}</Label>
      <TextArea value={String(draft[key])} onChange={(e) => update(key, e.target.value)} />
    </TextField>
  )
  const statusSelect = (
    label: string,
    value: boolean,
    onChange: (value: boolean) => void,
    yes = "ใช้งาน",
    no = "ไม่ใช้งาน",
  ) => (
    <Select
      className="field"
      selectedKey={value ? "yes" : "no"}
      onSelectionChange={(key) => onChange(key === "yes")}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="yes" textValue={yes}>
            {yes}
          </ListBox.Item>
          <ListBox.Item id="no" textValue={no}>
            {no}
          </ListBox.Item>
        </ListBox>
      </Select.Popover>
    </Select>
  )
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">งานทะเบียน</p>
          <h1>ข้อมูลรายวิชา</h1>
          <p>จัดการรายวิชาและตอนเรียนในแต่ละภาคการศึกษา</p>
        </div>
        <div className="actions">
          <Button
            variant="secondary"
            isDisabled={busy}
            onPress={() => {
              setImportOpen(true)
              setImportError("")
              setMessage("")
            }}
          >
            นำเข้าข้อมูล
          </Button>
          <Button variant="primary" isDisabled={!term || busy} onPress={() => openEditor()}>
            เพิ่มรายวิชา
          </Button>
        </div>
      </div>
      {!editorOpen && !importOpen && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!editorOpen && !importOpen && message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <section className="panel">
        <div className="toolbar">
          <TermSelect
            terms={terms}
            value={term}
            disabled={busy || editorOpen}
            onChange={(value) => {
              setTerm(value)
              setResults([])
            }}
          />
          <TextField className="field">
            <Label>ค้นหารายวิชา</Label>
            <Input
              value={query}
              disabled={busy || editorOpen}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="รหัสหรือชื่อรายวิชา"
            />
          </TextField>
          <Button
            variant="secondary"
            isDisabled={!term || busy}
            onPress={() => void run(download, "ส่งออกข้อมูลรายวิชาแล้ว", false)}
          >
            ส่งออก JSON
          </Button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>รายวิชา</th>
                <th>คณะ</th>
                <th>หน่วยกิต</th>
                <th>ตอนเรียน</th>
                <th>สถานะ</th>
                <th>
                  <span className="sr-only">จัดการ</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.courseCode}</strong>
                    <br />
                    {item.nameEn || item.nameTh}
                  </td>
                  <td>{item.faculty}</td>
                  <td>{item.credits}</td>
                  <td>{item.sections.length}</td>
                  <td>{item.active ? "ใช้งาน" : "ไม่ใช้งาน"}</td>
                  <td>
                    <Button variant="secondary" isDisabled={busy} onPress={() => openEditor(item)}>
                      แก้ไข
                    </Button>
                  </td>
                </tr>
              ))}
              {!results.length && (
                <tr>
                  <td colSpan={6}>
                    {loading ? <span role="status">กำลังโหลดรายวิชา...</span> : "ไม่พบรายวิชา"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <EditorModal
        isOpen={editorOpen}
        onClose={closeEditor}
        title={adding ? "เพิ่มรายวิชา" : `แก้ไข ${selected?.courseCode}`}
        wide
        busy={busy}
        error={editorError}
        footer={
          <>
            <Button variant="secondary" isDisabled={busy} onPress={closeEditor}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="course-editor-form"
              isPending={busy}
              isDisabled={busy}
            >
              {busy ? "กำลังบันทึก..." : "บันทึกและปิด"}
            </Button>
          </>
        }
      >
        <form
          id="course-editor-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!busy) void run(saveOffering, adding ? "เพิ่มรายวิชาแล้ว" : "บันทึกรายวิชาแล้ว")
          }}
        >
          <fieldset disabled={busy} className="editor-fields">
            <Tabs
              className="editor-tabs"
              selectedKey={tab}
              onSelectionChange={(key) => setTab(String(key))}
            >
              <Tabs.List aria-label="ข้อมูลรายวิชา">
                <Tabs.Tab id="general">
                  ข้อมูลรายวิชา
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="exams">
                  การสอบ
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="sections">
                  ตอนเรียน
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel id="general" className="editor-tab-panel">
                <div className="editor-section-stack">
                  <div className="form-grid">
                    {adding && textField("รหัสรายวิชา", "courseCode", "text", true)}
                    {textField("ชื่อภาษาไทย", "nameTh", "text", !adding)}
                    {textField("ชื่อภาษาอังกฤษ", "nameEn")}
                    {textField("คณะ", "faculty")}
                    {textField("ภาควิชา", "department")}
                    {textField("หน่วยกิต", "credits", "number")}
                    {textField("ชื่อย่อ", "shortName")}
                    {textField("รูปแบบหน่วยกิต", "creditHours")}
                    {statusSelect("สถานะรายวิชา", draft.active, (value) => update("active", value))}
                  </div>
                  <details>
                    <summary>รายละเอียดเพิ่มเติม</summary>
                    <div className="editor-section-stack">
                      <div className="form-grid">
                        {textField("หมวดศึกษาทั่วไป", "genEdType")}
                        {textField("หลักสูตรที่เปิดสอน (คั่นด้วยเครื่องหมายจุลภาค)", "studyPrograms")}
                      </div>
                      {textArea("คำอธิบายภาษาไทย", "descriptionTh")}
                      {textArea("คำอธิบายภาษาอังกฤษ", "descriptionEn")}
                      {textArea("เงื่อนไขรายวิชา", "prerequisiteText")}
                    </div>
                  </details>
                </div>
              </Tabs.Panel>
              <Tabs.Panel id="exams" className="editor-tab-panel">
                <div className="editor-section-stack">
                  <section>
                    <h3>สอบกลางภาค</h3>
                    <div className="editor-exam-grid">
                      {textField("วันสอบกลางภาค", "midtermDate", "date")}
                      {textField("เวลาเริ่มสอบกลางภาค", "midtermStart", "time")}
                      {textField("เวลาสิ้นสุดสอบกลางภาค", "midtermEnd", "time")}
                    </div>
                  </section>
                  <section>
                    <h3>สอบปลายภาค</h3>
                    <div className="editor-exam-grid">
                      {textField("วันสอบปลายภาค", "finalDate", "date")}
                      {textField("เวลาเริ่มสอบปลายภาค", "finalStart", "time")}
                      {textField("เวลาสิ้นสุดสอบปลายภาค", "finalEnd", "time")}
                    </div>
                  </section>
                </div>
              </Tabs.Panel>
              <Tabs.Panel id="sections" className="editor-tab-panel">
                {sectionDraft ? (
                  <div className="editor-section-stack">
                    <div className="panel-heading">
                      <h3>ตอนเรียน {sectionDraft.sectionNo || "ใหม่"}</h3>
                      <Button variant="secondary" onPress={() => setSectionKey(null)}>
                        กลับไปตอนเรียน
                      </Button>
                    </div>
                    <div className="form-grid">
                      <TextField className="field">
                        <Label>ตอนเรียน</Label>
                        <Input
                          autoFocus
                          readOnly={Boolean(sectionDraft.id)}
                          value={sectionDraft.sectionNo}
                          onChange={(e) =>
                            updateSection(sectionDraft.key, { sectionNo: e.target.value })
                          }
                        />
                      </TextField>
                      <TextField className="field">
                        <Label>จำนวนที่รับ</Label>
                        <Input
                          type="number"
                          min={0}
                          value={sectionDraft.capacity}
                          onChange={(e) =>
                            updateSection(sectionDraft.key, { capacity: e.target.value })
                          }
                        />
                      </TextField>
                      {statusSelect("สถานะตอนเรียน", sectionDraft.active, (value) =>
                        updateSection(sectionDraft.key, { active: value }),
                      )}
                      {statusSelect(
                        "การรับลงทะเบียน",
                        !sectionDraft.closed,
                        (value) => updateSection(sectionDraft.key, { closed: !value }),
                        "เปิดรับ",
                        "ปิดรับ",
                      )}
                      <TextField className="field">
                        <Label>หมวดศึกษาทั่วไปของตอนเรียน</Label>
                        <Input
                          value={sectionDraft.genEdType}
                          onChange={(e) =>
                            updateSection(sectionDraft.key, { genEdType: e.target.value })
                          }
                        />
                      </TextField>
                    </div>
                    <TextField className="field">
                      <Label>หมายเหตุ</Label>
                      <TextArea
                        value={sectionDraft.note}
                        onChange={(e) => updateSection(sectionDraft.key, { note: e.target.value })}
                      />
                    </TextField>
                    <div className="panel-heading">
                      <h3>วันเวลาเรียนและผู้สอน</h3>
                      <Button
                        variant="secondary"
                        onPress={() =>
                          updateSection(sectionDraft.key, {
                            meetingsDirty: true,
                            meetings: [
                              ...sectionDraft.meetings,
                              {
                                key: `new-${nextKey.current++}`,
                                classType: "",
                                dayCode: "",
                                start: "",
                                end: "",
                                building: "",
                                room: "",
                                teachers: "",
                              },
                            ],
                          })
                        }
                      >
                        เพิ่มช่วงเรียน
                      </Button>
                    </div>
                    {sectionDraft.meetings.map((meeting, index) => (
                      <section className="editor-section-card" key={meeting.key}>
                        <div className="panel-heading">
                          <strong>ช่วงเรียนที่ {index + 1}</strong>
                          <Button
                            variant="ghost"
                            onPress={() =>
                              updateSection(sectionDraft.key, {
                                meetingsDirty: true,
                                meetings: sectionDraft.meetings.filter((_, i) => i !== index),
                              })
                            }
                          >
                            ลบช่วงเรียน
                          </Button>
                        </div>
                        <div className="form-grid">
                          <TextField className="field">
                            <Label>ประเภทการเรียน</Label>
                            <Input
                              value={meeting.classType}
                              onChange={(e) => updateMeeting(index, "classType", e.target.value)}
                            />
                          </TextField>
                          <Select
                            className="field"
                            selectedKey={meeting.dayCode || "unscheduled"}
                            onSelectionChange={(key) =>
                              updateMeeting(
                                index,
                                "dayCode",
                                key === "unscheduled" || key === null ? "" : String(key),
                              )
                            }
                          >
                            <Label>วันเรียน</Label>
                            <Select.Trigger>
                              <Select.Value />
                              <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                              <ListBox>
                                {(
                                  [
                                    ["unscheduled", "ยังไม่กำหนด"],
                                    ["MO", "จันทร์"],
                                    ["TU", "อังคาร"],
                                    ["WE", "พุธ"],
                                    ["TH", "พฤหัสบดี"],
                                    ["FR", "ศุกร์"],
                                    ["SA", "เสาร์"],
                                    ["SU", "อาทิตย์"],
                                  ] as const
                                ).map(([id, label]) => (
                                  <ListBox.Item id={id} key={id} textValue={label}>
                                    {label}
                                  </ListBox.Item>
                                ))}
                              </ListBox>
                            </Select.Popover>
                          </Select>
                          <TextField className="field">
                            <Label>เวลาเริ่ม</Label>
                            <Input
                              type="time"
                              value={meeting.start}
                              onChange={(e) => updateMeeting(index, "start", e.target.value)}
                            />
                          </TextField>
                          <TextField className="field">
                            <Label>เวลาสิ้นสุด</Label>
                            <Input
                              type="time"
                              value={meeting.end}
                              onChange={(e) => updateMeeting(index, "end", e.target.value)}
                            />
                          </TextField>
                          <TextField className="field">
                            <Label>อาคาร</Label>
                            <Input
                              value={meeting.building}
                              onChange={(e) => updateMeeting(index, "building", e.target.value)}
                            />
                          </TextField>
                          <TextField className="field">
                            <Label>ห้อง</Label>
                            <Input
                              value={meeting.room}
                              onChange={(e) => updateMeeting(index, "room", e.target.value)}
                            />
                          </TextField>
                        </div>
                        <TextField className="field">
                          <Label>ผู้สอน (คั่นด้วยเครื่องหมายจุลภาค)</Label>
                          <Input
                            value={meeting.teachers}
                            onChange={(e) => updateMeeting(index, "teachers", e.target.value)}
                          />
                        </TextField>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="editor-section-stack">
                    <div className="panel-heading">
                      <h3>ตอนเรียน ({sections.length})</h3>
                      <Button variant="secondary" onPress={addSection}>
                        เพิ่มตอนเรียน
                      </Button>
                    </div>
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>ตอนเรียน</th>
                            <th>จำนวนที่รับ</th>
                            <th>ลงทะเบียนแล้ว</th>
                            <th>สถานะ</th>
                            <th>
                              <span className="sr-only">จัดการ</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sections.map((section) => (
                            <tr key={section.key}>
                              <td>{section.sectionNo || "ใหม่"}</td>
                              <td>{section.capacity}</td>
                              <td>{section.baselineEnrolled + section.localActive}</td>
                              <td>
                                {!section.active ? "ไม่ใช้งาน" : section.closed ? "ปิดรับ" : "เปิดรับ"}
                              </td>
                              <td>
                                <Button
                                  variant="secondary"
                                  onPress={() => setSectionKey(section.key)}
                                >
                                  รายละเอียด
                                </Button>
                                {section.id === undefined && (
                                  <Button
                                    variant="ghost"
                                    onPress={() =>
                                      setSections((items) =>
                                        items.filter((item) => item.key !== section.key),
                                      )
                                    }
                                  >
                                    ลบตอนเรียนใหม่
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {sections.length === 0 && <p className="muted">ยังไม่มีตอนเรียน</p>}
                  </div>
                )}
              </Tabs.Panel>
            </Tabs>
          </fieldset>
        </form>
      </EditorModal>
      <EditorModal
        isOpen={importOpen}
        onClose={() => {
          if (!busy) setImportOpen(false)
        }}
        title="นำเข้าข้อมูลรายวิชา"
        wide
        busy={busy}
        error={importError}
        message={message}
        footer={
          <>
            <Button variant="secondary" isDisabled={busy} onPress={() => setImportOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="secondary"
              isPending={busy && importStage === "preview"}
              isDisabled={!file || busy}
              onPress={() => {
                if (!file) return
                setImportStage("preview")
                void run(
                  async () => {
                    setPreview(
                      await request<ImportPreview>("/api/v1/staff/catalog/import/preview", {
                        method: "POST",
                        body: file,
                      }),
                    )
                  },
                  "ตรวจสอบข้อมูลแล้ว",
                  false,
                ).finally(() => setImportStage(null))
              }}
            >
              ตรวจสอบข้อมูล
            </Button>
            {preview && (
              <Button
                variant="primary"
                isPending={busy && importStage === "confirm"}
                isDisabled={busy}
                onPress={() => setConfirm(true)}
              >
                นำเข้าข้อมูลรายวิชา
              </Button>
            )}
          </>
        }
      >
        <p>ตรวจสอบข้อมูลก่อนแทนที่รายวิชาในภาคการศึกษาที่ระบุ</p>
        <TextField className="field">
          <Label>ไฟล์รายวิชา JSON</Label>
          <Input
            autoFocus
            disabled={busy}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const chosen = e.target.files?.[0]
              setPreview(null)
              setFile(null)
              setMessage("")
              setImportError("")
              if (chosen)
                void chosen
                  .text()
                  .then(setFile)
                  .catch(() => setImportError("ไม่สามารถอ่านไฟล์ได้"))
            }}
          />
        </TextField>
        {preview && (
          <div>
            <p>
              <strong>{preview.courseCount}</strong> รายวิชา ·{" "}
              <strong>{preview.sectionCount}</strong> ตอนเรียน
            </p>
            <p>
              ภาคการศึกษา:{" "}
              {preview.terms.map((item) => `${item.semester}/${item.academicYear}`).join(", ")}
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ภาคการศึกษา</th>
                    <th>เพิ่ม</th>
                    <th>แทนที่</th>
                    <th>ปิดใช้งาน</th>
                    <th>เกินจำนวนที่รับ</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.map((item) => (
                    <tr key={`${item.academicYear}-${item.semester}`}>
                      <td>
                        {item.semester}/{item.academicYear}
                      </td>
                      <td>{item.added}</td>
                      <td>{item.replaced}</td>
                      <td>{item.removed}</td>
                      <td>{item.overCapacitySections}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.changes.some((item) => item.overCapacitySections > 0) && (
              <p role="status">ตอนเรียนที่มีผู้ลงทะเบียนเกินจำนวนที่รับจะไม่มีที่นั่งว่าง</p>
            )}
            {preview.reviewTerms.length > 0 && (
              <div>
                <h3>รีวิวที่จะปรับปรุง</h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ภาคการศึกษา</th>
                        <th>จำนวนรีวิว</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.reviewTerms.map((item) => (
                        <tr key={`${item.academicYear}-${item.semester}`}>
                          <td>
                            {item.semester}/{item.academicYear}
                          </td>
                          <td>{item.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {preview.warnings?.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
      </EditorModal>
      <EditorModal
        alert
        isOpen={confirm}
        onClose={() => {
          if (!busy) setConfirm(false)
        }}
        busy={busy}
        title="แทนที่ข้อมูลรายวิชา?"
        ariaLabel="ยืนยันการนำเข้ารายวิชา"
        footer={
          <>
            <Button variant="secondary" onPress={() => setConfirm(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              isDisabled={busy}
              onPress={() => {
                setConfirm(false)
                if (file && preview) {
                  setImportStage("confirm")
                  void run(async () => {
                    await request(
                      `/api/v1/staff/catalog/import/confirm?checksum=${encodeURIComponent(preview.checksum)}`,
                      { method: "POST", body: file },
                    )
                    setPreview(null)
                    setFile(null)
                    setImportOpen(false)
                  }, "นำเข้าข้อมูลรายวิชาแล้ว").finally(() => setImportStage(null))
                }
              }}
            >
              ยืนยันการนำเข้า
            </Button>
          </>
        }
      >
        <p>การนำเข้าจะแทนที่ข้อมูลรายวิชาและตอนเรียนในภาคการศึกษาที่ระบุ โดยเก็บประวัติการลงทะเบียนไว้</p>
      </EditorModal>
    </div>
  )
}
