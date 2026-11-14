import { Button, Input, Label, ListBox, Select, TextField } from "./ui"
import { EditorModal } from "./EditorModal"
import { useEffect, useRef, useState } from "react"
import { errorMessage, request } from "./api"

type Term = { id: number; label: string; isCurrent: boolean }
type StudentCode = {
  studentId: string
  firstTermId: number | null
  academicLevel: string | null
  code: string | null
}

export function AdvisorCodes() {
  const [terms, setTerms] = useState<Term[]>([])
  const [termId, setTermId] = useState("")
  const [students, setStudents] = useState<StudentCode[]>([])
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [pendingStudentId, setPendingStudentId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [rotateStudent, setRotateStudent] = useState<string | null>(null)
  const rotateTrigger = useRef<HTMLElement | null>(null)

  function closeRotate() {
    setRotateStudent(null)
    requestAnimationFrame(() => rotateTrigger.current?.focus())
  }

  useEffect(() => {
    request<Term[]>("/api/v1/staff/terms")
      .then((items) => {
        setTerms(items)
        setTermId(String(items.find((term) => term.isCurrent)?.id ?? items[0]?.id ?? ""))
      })
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    if (!termId) return
    let cancelled = false
    setBusy(true)
    setError("")
    setStudents([])
    request<{ students: StudentCode[] }>(
      `/api/v1/staff/advisor-codes?termId=${encodeURIComponent(termId)}`,
    )
      .then((result) => {
        if (!cancelled) setStudents(result.students)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [termId])

  async function issue(studentId: string, rotate = false) {
    setBusy(true)
    setPendingStudentId(studentId)
    setMessage("")
    setError("")
    try {
      const result = await request<{ code: string }>(
        `/api/v1/staff/advisor-codes/${encodeURIComponent(studentId)}`,
        {
          method: "POST",
          body: JSON.stringify({ termId: Number(termId), rotate }),
        },
      )
      setStudents((current) =>
        current.map((student) =>
          student.studentId === studentId ? { ...student, code: result.code } : student,
        ),
      )
      if (rotate) closeRotate()
      setMessage(`${rotate ? "เปลี่ยนรหัส" : "ออกรหัส"}ให้นิสิต ${studentId} แล้ว`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
      setPendingStudentId(null)
    }
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">การลงทะเบียน</p>
          <h1>รหัสลงทะเบียนเรียน</h1>
          <p>ดูและออกรหัสให้นิสิตในความดูแล</p>
        </div>
      </div>
      <div className="panel">
        <p className="sr-only" role="status">
          {message}
        </p>
        <div className="toolbar">
          <Select
            className="field"
            selectedKey={termId || null}
            onSelectionChange={(value) => setTermId(String(value ?? ""))}
            isDisabled={busy}
          >
            <Label>ภาคการศึกษา</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {terms.map((term) => (
                  <ListBox.Item key={term.id} id={String(term.id)} textValue={term.label}>
                    {term.label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <TextField className="field">
            <Label>ค้นหารหัสนิสิต</Label>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="รหัสนิสิต"
            />
          </TextField>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>รหัสนิสิต</th>
                <th>ระดับการศึกษา</th>
                <th>รหัสลงทะเบียน</th>
                <th>
                  <span className="sr-only">ดำเนินการ</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {students
                .filter((student) => student.studentId.includes(query.trim()))
                .map((student) => (
                  <tr key={student.studentId}>
                    <td>{student.studentId}</td>
                    <td>
                      {student.academicLevel === "graduate"
                        ? "บัณฑิตศึกษา"
                        : student.academicLevel === "undergraduate"
                          ? "ปริญญาตรี"
                          : "ยังไม่ระบุ"}
                    </td>
                    <td>
                      <strong className="registration-code">{student.code ?? "—"}</strong>
                    </td>
                    <td>
                      {student.code ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={busy}
                          isPending={pendingStudentId === student.studentId}
                          onPress={(event) => {
                            rotateTrigger.current = event.target as HTMLElement
                            setRotateStudent(student.studentId)
                          }}
                        >
                          เปลี่ยนรหัส
                        </Button>
                      ) : student.firstTermId ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={busy}
                          isPending={pendingStudentId === student.studentId}
                          onPress={() => void issue(student.studentId)}
                        >
                          {pendingStudentId === student.studentId ? "กำลังออกรหัส..." : "ออกรหัส"}
                        </Button>
                      ) : (
                        <span className="muted">รอระบุข้อมูลนิสิต</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!busy &&
          !students.some((student) => student.studentId.includes(query.trim())) &&
          !error && <p className="empty">ไม่พบนิสิตในภาคการศึกษานี้</p>}
        {busy && !pendingStudentId && (
          <p className="muted" role="status">
            กำลังโหลดข้อมูล...
          </p>
        )}
      </div>
      <EditorModal
        alert
        isOpen={rotateStudent !== null}
        onClose={closeRotate}
        busy={busy}
        error={error}
        title="เปลี่ยนรหัสลงทะเบียน"
        footer={
          <>
            <Button variant="secondary" isDisabled={busy} onPress={closeRotate}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              isDisabled={busy}
              isPending={busy}
              onPress={() => {
                if (rotateStudent) void issue(rotateStudent, true)
              }}
            >
              เปลี่ยนรหัส
            </Button>
          </>
        }
      >
        <p>รหัสเดิมของนิสิต {rotateStudent} จะใช้ไม่ได้อีกต่อไป</p>
      </EditorModal>
    </section>
  )
}
