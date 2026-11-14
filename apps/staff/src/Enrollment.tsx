import { Button, Input, Label, TextArea, TextField } from "./ui"
import { EditorModal } from "./EditorModal"
import { Search } from "lucide-react"
import { useRef, useState } from "react"
import { errorMessage, request } from "./api"

type Registration = {
  registrationId: number
  termLabel: string
  courseCode: string
  nameTh: string
  nameEn: string
  sectionNo: string
  status: string
  credits: number
}
type Result = { studentId: string; registrations: Registration[] }
type Action = { type: "withdraw" | "remove"; registration: Registration }

const statusLabel: Record<string, string> = {
  active: "ลงทะเบียน",
  dropped: "ลดรายวิชา",
  withdrawn: "ถอน (W)",
  removed: "นำออก",
}

export function Enrollment() {
  const [studentId, setStudentId] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [reason, setReason] = useState("")
  const [approvalReference, setApprovalReference] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const resultsHeadingRef = useRef<HTMLHeadingElement | null>(null)

  const search = async (id: string) => {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      setResult(
        await request<Result>(`/api/v1/staff/enrollments?studentId=${encodeURIComponent(id)}`),
      )
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : "ไม่สามารถค้นหาข้อมูลได้")
    } finally {
      setBusy(false)
    }
  }
  const close = () => {
    if (busy) return
    setAction(null)
    setReason("")
    setApprovalReference("")
    requestAnimationFrame(() => triggerRef.current?.focus())
  }
  const start = (type: Action["type"], registration: Registration, target: HTMLButtonElement) => {
    triggerRef.current = target
    setReason("")
    setApprovalReference("")
    setError("")
    setAction({ type, registration })
  }
  const confirm = async () => {
    if (
      !action ||
      !result ||
      !reason.trim() ||
      (action.type === "withdraw" && !approvalReference.trim())
    )
      return
    setBusy(true)
    setError("")
    try {
      const changed = await request<{ registrationId: number; status: string }>(
        `/api/v1/staff/enrollments/${action.registration.registrationId}/${action.type}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: reason.trim(),
            ...(action.type === "withdraw" ? { approvalReference: approvalReference.trim() } : {}),
          }),
        },
      )
      setResult({
        ...result,
        registrations: result.registrations.map((registration) =>
          registration.registrationId === changed.registrationId
            ? { ...registration, status: changed.status }
            : registration,
        ),
      })
      setAction(null)
      setReason("")
      setApprovalReference("")
      setMessage(action.type === "withdraw" ? "บันทึกการถอนรายวิชาแล้ว" : "นำรายวิชาออกแล้ว")
      requestAnimationFrame(() => resultsHeadingRef.current?.focus())
      try {
        setResult(
          await request<Result>(
            `/api/v1/staff/enrollments?studentId=${encodeURIComponent(result.studentId)}`,
          ),
        )
      } catch (err) {
        setError(`บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่ได้: ${errorMessage(err)}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">การจัดการ</p>
          <h1>รายวิชาของนิสิต</h1>
          <p className="muted">ค้นหาและจัดการรายการลงทะเบียนของนิสิต</p>
        </div>
      </div>
      {error && !action && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <section className="panel">
        <form
          className="toolbar search-toolbar"
          onSubmit={(event) => {
            event.preventDefault()
            if (/^\d{10}$/.test(studentId)) void search(studentId)
          }}
        >
          <TextField className="field" isRequired>
            <Label>เลขประจำตัวนิสิต</Label>
            <Input
              disabled={busy}
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              placeholder="เลขประจำตัวนิสิต 10 หลัก"
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
            />
          </TextField>
          <Button type="submit" variant="primary" isDisabled={busy} isPending={busy}>
            <Search size={16} aria-hidden="true" /> {busy ? "กำลังค้นหา..." : "ค้นหา"}
          </Button>
        </form>
        {result && (
          <>
            <div className="panel-heading">
              <div>
                <h2 ref={resultsHeadingRef} tabIndex={-1}>
                  รายการลงทะเบียน
                </h2>
                <p className="muted">นิสิต {result.studentId}</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ภาคการศึกษา</th>
                    <th>รายวิชา</th>
                    <th>ตอนเรียน</th>
                    <th>หน่วยกิต</th>
                    <th>สถานะ</th>
                    <th>
                      <span className="sr-only">จัดการ</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.registrations.map((registration) => (
                    <tr key={registration.registrationId}>
                      <td>{registration.termLabel}</td>
                      <td>
                        <strong>{registration.courseCode}</strong>
                        <br />
                        <span className="muted">{registration.nameTh || registration.nameEn}</span>
                      </td>
                      <td>{registration.sectionNo}</td>
                      <td>{registration.credits}</td>
                      <td>{statusLabel[registration.status] ?? registration.status}</td>
                      <td>
                        <div className="actions">
                          {registration.status === "active" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              isDisabled={busy}
                              onPress={(event) =>
                                start("withdraw", registration, event.target as HTMLButtonElement)
                              }
                            >
                              ถอน
                            </Button>
                          )}
                          {(registration.status === "active" ||
                            registration.status === "withdrawn" ||
                            registration.status === "dropped") && (
                            <Button
                              size="sm"
                              variant="secondary"
                              isDisabled={busy}
                              onPress={(event) =>
                                start("remove", registration, event.target as HTMLButtonElement)
                              }
                            >
                              นำออก
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.registrations.length === 0 && <p className="muted">ไม่พบรายการลงทะเบียน</p>}
            </div>
          </>
        )}
      </section>
      <EditorModal
        alert
        isOpen={Boolean(action)}
        onClose={close}
        busy={busy}
        error={error}
        title={action?.type === "withdraw" ? "บันทึกการถอนรายวิชา" : "นำรายวิชาออก"}
        ariaLabel={action?.type === "withdraw" ? "ยืนยันการถอนรายวิชา" : "ยืนยันการนำรายวิชาออก"}
        footer={
          <>
            <Button variant="secondary" onPress={close} isDisabled={busy}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              onPress={() => void confirm()}
              isPending={busy}
              isDisabled={
                busy || !reason.trim() || (action?.type === "withdraw" && !approvalReference.trim())
              }
            >
              ยืนยัน
            </Button>
          </>
        }
      >
        <div className="editor-section-stack">
          <p className="muted">
            นิสิต {result?.studentId} · {action?.registration.termLabel} · ตอนเรียน{" "}
            {action?.registration.sectionNo}
          </p>
          <p>
            <strong>{action?.registration.courseCode}</strong>{" "}
            {action?.registration.nameTh || action?.registration.nameEn}
          </p>
          <p className="muted">
            {action?.type === "withdraw"
              ? "ตรวจสอบคำร้องและลายเซ็นให้ครบถ้วนก่อนบันทึก สถานะรายวิชาจะเป็น W"
              : "รายวิชาจะถูกนำออกจากรายการของนิสิต โดยยังเก็บประวัติการดำเนินการไว้"}
          </p>
          <TextField className="field" isRequired>
            <Label>เหตุผล</Label>
            <TextArea value={reason} onChange={(event) => setReason(event.target.value)} />
          </TextField>
          {action?.type === "withdraw" && (
            <TextField className="field" isRequired>
              <Label>เลขอ้างอิงคำร้องที่อนุมัติ</Label>
              <Input
                value={approvalReference}
                onChange={(event) => setApprovalReference(event.target.value)}
              />
            </TextField>
          )}
        </div>
      </EditorModal>
    </div>
  )
}
