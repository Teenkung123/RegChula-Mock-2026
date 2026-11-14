import { Tabs, toast } from "@heroui/react"
import { Button, Input, Label, ListBox, Select, TextField } from "./ui"
import { useCallback, useEffect, useRef, useState } from "react"
import { errorMessage, request } from "./api"
import { EditorModal } from "./EditorModal"

type Account = {
  id: string
  username: string
  displayName: string
  role: "admin" | "advisor"
  active: boolean
}
type Student = {
  studentId: string
  advisorId: string | null
  advisorName: string | null
  active: boolean | null
}
type Term = { id: number; label: string; isCurrent: boolean }
type Profile = {
  studentId: string
  firstTermId: number | null
  academicLevel: "undergraduate" | "graduate" | null
}

function SelectBox({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <Select
      className="field"
      isDisabled={disabled}
      selectedKey={value || null}
      onSelectionChange={(key) => onChange(key === null ? "" : String(key))}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item id={option.value} key={option.value} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

export function People() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [studentQuery, setStudentQuery] = useState("")
  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("advisor")
  const [editing, setEditing] = useState<Account | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingAction, setPendingAction] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [advisorId, setAdvisorId] = useState("")
  const [firstTermId, setFirstTermId] = useState("")
  const [academicLevel, setAcademicLevel] = useState("undergraduate")
  const [studentActive, setStudentActive] = useState(true)
  const [studentTab, setStudentTab] = useState("education")
  const [studentAction, setStudentAction] = useState<"reset" | "disable" | "enable" | null>(null)
  const actionRef = useRef<HTMLButtonElement | null>(null)
  const editorTrigger = useRef<HTMLElement | null>(null)

  const closeEditor = () => {
    if (busy || studentAction) return
    setAccountOpen(false)
    setEditing(null)
    setSelectedStudent(null)
    setUsername("")
    setDisplayName("")
    setPassword("")
    setRole("advisor")
    setError("")
    requestAnimationFrame(() => editorTrigger.current?.focus())
  }
  const openAccount = (account: Account | null, trigger: HTMLElement) => {
    if (busy) return
    editorTrigger.current = trigger
    setSelectedStudent(null)
    setEditing(account)
    setDisplayName(account?.displayName ?? "")
    setUsername(account?.username ?? "")
    setPassword("")
    setRole(account?.role ?? "advisor")
    setError("")
    setMessage("")
    setAccountOpen(true)
  }

  const load = useCallback(async () => {
    const [nextAccounts, nextTerms] = await Promise.all([
      request<Account[]>("/api/v1/staff/accounts"),
      request<Term[]>("/api/v1/staff/terms"),
    ])
    setAccounts(nextAccounts)
    setTerms(nextTerms)
    const term = nextTerms.find((entry) => entry.isCurrent) ?? nextTerms[0]
    if (term) {
      const result = await request<{ students: Profile[] }>(
        `/api/v1/staff/advisor-codes?termId=${term.id}`,
      )
      setProfiles(result.students)
    }
  }, [])

  useEffect(() => {
    void load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false))
  }, [load])
  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      void request<Student[]>(`/api/v1/staff/students?q=${encodeURIComponent(studentQuery.trim())}`)
        .then((items) => {
          if (current) setStudents(items)
        })
        .catch((err: unknown) => {
          if (current) setError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายชื่อนิสิตได้")
        })
    }, 250)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [studentQuery])
  const perform = async (action: () => Promise<unknown>, success: string, pending = "account") => {
    setBusy(true)
    setPendingAction(pending)
    setError("")
    setMessage("")
    let saved = false
    try {
      await action()
      saved = true
      setMessage(success)
      toast.success(success, { timeout: 4500 })
      await load()
      setStudents(
        await request<Student[]>(
          `/api/v1/staff/students?q=${encodeURIComponent(studentQuery.trim())}`,
        ),
      )
    } catch (err) {
      setError(
        saved
          ? `บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่ได้: ${errorMessage(err)}`
          : err instanceof Error
            ? err.message
            : "ดำเนินการไม่สำเร็จ",
      )
      if (saved)
        toast.warning("บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่ได้", {
          description: errorMessage(err),
          timeout: 6000,
        })
    } finally {
      setBusy(false)
      setPendingAction("")
    }
    return saved
  }
  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const saveAccount = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    let saved: boolean
    if (editing) {
      saved = await perform(
        () =>
          request(`/api/v1/staff/accounts/${encodeURIComponent(editing.id)}`, {
            ...json({ displayName, role, ...(password ? { password } : {}) }),
            method: "PATCH",
          }),
        "บันทึกบัญชีแล้ว",
      )
    } else {
      saved = await perform(
        () => request("/api/v1/staff/accounts", json({ username, displayName, password, role })),
        "เพิ่มบัญชีแล้ว",
      )
    }
    if (saved) {
      setAccountOpen(false)
      setEditing(null)
      setUsername("")
      setDisplayName("")
      setPassword("")
      requestAnimationFrame(() => editorTrigger.current?.focus())
    }
  }
  const selectStudent = (student: Student, trigger: HTMLElement) => {
    if (busy) return
    editorTrigger.current = trigger
    setError("")
    setMessage("")
    setAccountOpen(false)
    setSelectedStudent(student)
    setAdvisorId(student.advisorId ? String(student.advisorId) : "")
    const profile = profiles.find((item) => item.studentId === student.studentId)
    setFirstTermId(profile?.firstTermId ? String(profile.firstTermId) : "")
    setAcademicLevel(profile?.academicLevel ?? "undergraduate")
    setStudentActive(student.active ?? true)
    setStudentTab("education")
  }
  const studentList = students
  const closeStudentAction = () => {
    if (busy) return
    setStudentAction(null)
    requestAnimationFrame(() => actionRef.current?.focus())
  }
  const applyStudentAction = async () => {
    if (!selectedStudent || !studentAction) return
    if (studentAction !== "reset") {
      await saveStudentChanges()
      return
    }
    const succeeded = await perform(
      () =>
        request(`/api/v1/staff/students/${selectedStudent.studentId}`, {
          ...json({ resetPassword: true }),
          method: "PATCH",
        }),
      "ตั้งรหัสผ่านเริ่มต้นแล้ว",
      "reset",
    )
    if (succeeded) {
      setStudentAction(null)
      requestAnimationFrame(() => actionRef.current?.focus())
    }
  }
  const saveStudentChanges = async () => {
    if (!selectedStudent || busy) return
    const succeeded = await perform(
      () =>
        request(`/api/v1/staff/students/${selectedStudent.studentId}/editor`, {
          method: "PUT",
          body: JSON.stringify({
            advisorId: advisorId || null,
            firstTermId: Number(firstTermId),
            academicLevel,
            ...(selectedStudent.active === null ? {} : { active: studentActive }),
          }),
        }),
      "บันทึกข้อมูลนิสิตแล้ว",
      "student",
    )
    if (succeeded) {
      setStudentAction(null)
      setSelectedStudent(null)
      requestAnimationFrame(() => editorTrigger.current?.focus({ preventScroll: true }))
    }
  }
  const submitStudent = (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedStudent || busy) return
    if (!firstTermId) {
      setError("กรุณาเลือกภาคการศึกษาแรก")
      setStudentTab("education")
      return
    }
    if (selectedStudent.active !== null && studentActive !== selectedStudent.active) {
      setError("")
      setStudentAction(studentActive ? "enable" : "disable")
      return
    }
    void saveStudentChanges()
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">การจัดการ</p>
          <h1>บัญชีผู้ใช้</h1>
          <p className="muted">จัดการบัญชีเจ้าหน้าที่และข้อมูลนิสิต</p>
        </div>
      </div>
      {error && !accountOpen && !selectedStudent && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && !accountOpen && !selectedStudent && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {loading ? (
        <p className="muted">กำลังโหลดข้อมูล...</p>
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>เจ้าหน้าที่และอาจารย์</h2>
                <p className="muted">กำหนดบัญชีสำหรับเข้าใช้งานระบบ</p>
              </div>
              <Button
                variant="primary"
                isDisabled={busy}
                onPress={(event) => openAccount(null, event.target as HTMLElement)}
              >
                เพิ่มบัญชี
              </Button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ชื่อผู้ใช้</th>
                    <th>ชื่อ</th>
                    <th>สิทธิ์</th>
                    <th>สถานะ</th>
                    <th>
                      <span className="sr-only">จัดการ</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td>{account.username}</td>
                      <td>{account.displayName}</td>
                      <td>{account.role === "admin" ? "ผู้ดูแลระบบ" : "อาจารย์ที่ปรึกษา"}</td>
                      <td>{account.active ? "ใช้งาน" : "ระงับ"}</td>
                      <td>
                        <div className="actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            isDisabled={busy}
                            onPress={(event) => openAccount(account, event.target as HTMLElement)}
                          >
                            แก้ไข
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            isDisabled={busy || account.username === "administrator"}
                            isPending={pendingAction === `staff:${account.id}`}
                            onPress={() =>
                              void perform(
                                () =>
                                  request(
                                    `/api/v1/staff/accounts/${encodeURIComponent(account.id)}`,
                                    { ...json({ active: !account.active }), method: "PATCH" },
                                  ),
                                account.active ? "ระงับบัญชีแล้ว" : "เปิดใช้งานบัญชีแล้ว",
                                `staff:${account.id}`,
                              )
                            }
                          >
                            {account.active ? "ระงับ" : "เปิดใช้งาน"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>นิสิต</h2>
                <p className="muted">เลือกนิสิตเพื่อกำหนดอาจารย์ที่ปรึกษาและข้อมูลการศึกษา</p>
              </div>
            </div>
            <TextField className="field">
              <Label>ค้นหาด้วยเลขประจำตัวนิสิต</Label>
              <Input
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                inputMode="numeric"
              />
            </TextField>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>เลขประจำตัวนิสิต</th>
                    <th>อาจารย์ที่ปรึกษา</th>
                    <th>
                      <span className="sr-only">จัดการ</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentList.map((student) => (
                    <tr key={student.studentId}>
                      <td>{student.studentId}</td>
                      <td>{student.advisorName || "ยังไม่ได้กำหนด"}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={busy}
                          onPress={(event) => selectStudent(student, event.target as HTMLElement)}
                        >
                          จัดการ
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {studentList.length === 0 && <p className="muted">ไม่พบนิสิต</p>}
            </div>
            <EditorModal
              isOpen={Boolean(selectedStudent)}
              title={`ข้อมูลนิสิต ${selectedStudent?.studentId ?? ""}`}
              onClose={closeEditor}
              busy={busy || Boolean(studentAction)}
              error={studentAction ? "" : error}
              message={message}
              footer={
                <>
                  <Button variant="secondary" isDisabled={busy} onPress={closeEditor}>
                    ยกเลิก
                  </Button>
                  <Button
                    type="submit"
                    form="student-editor-form"
                    variant="primary"
                    isDisabled={busy}
                    isPending={pendingAction === "student"}
                    onPress={(event) => {
                      actionRef.current = event.target as HTMLButtonElement
                    }}
                  >
                    {pendingAction === "student" ? "กำลังบันทึก..." : "บันทึกและปิด"}
                  </Button>
                </>
              }
            >
              {selectedStudent && (
                <form id="student-editor-form" onSubmit={submitStudent}>
                  <Tabs
                    className="editor-tabs"
                    selectedKey={studentTab}
                    onSelectionChange={(key) => setStudentTab(String(key))}
                  >
                    <Tabs.ListContainer>
                      <Tabs.List aria-label="ข้อมูลนิสิต">
                        <Tabs.Tab id="education" isDisabled={busy}>
                          ข้อมูลการศึกษา
                          <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="account" isDisabled={busy}>
                          บัญชี
                          <Tabs.Indicator />
                        </Tabs.Tab>
                      </Tabs.List>
                    </Tabs.ListContainer>
                    <Tabs.Panel id="education" className="editor-tab-panel">
                      <SelectBox
                        label="อาจารย์ที่ปรึกษา"
                        value={advisorId || "none"}
                        onChange={(value) => setAdvisorId(value === "none" ? "" : value)}
                        disabled={busy}
                        options={[
                          { value: "none", label: "ยังไม่กำหนด" },
                          ...accounts
                            .filter((account) => account.role === "advisor" && account.active)
                            .map((account) => ({
                              value: String(account.id),
                              label: account.displayName,
                            })),
                        ]}
                      />
                      <div className="form-grid">
                        <SelectBox
                          label="ภาคการศึกษาแรก"
                          value={firstTermId}
                          onChange={setFirstTermId}
                          disabled={busy}
                          options={terms.map((term) => ({
                            value: String(term.id),
                            label: term.label,
                          }))}
                        />
                        <SelectBox
                          label="ระดับการศึกษา"
                          value={academicLevel}
                          onChange={setAcademicLevel}
                          disabled={busy}
                          options={[
                            { value: "undergraduate", label: "ปริญญาตรี" },
                            { value: "graduate", label: "บัณฑิตศึกษา" },
                          ]}
                        />
                      </div>
                    </Tabs.Panel>
                    <Tabs.Panel id="account" className="editor-tab-panel">
                      <SelectBox
                        label="สถานะบัญชี"
                        value={studentActive ? "active" : "disabled"}
                        onChange={(value) => setStudentActive(value === "active")}
                        disabled={busy || selectedStudent.active === null}
                        options={[
                          { value: "active", label: "ใช้งาน" },
                          { value: "disabled", label: "ระงับ" },
                        ]}
                      />
                      {selectedStudent.active === null && (
                        <p className="muted">บัญชีนี้ยังไม่เคยเข้าสู่ระบบ</p>
                      )}
                      <section>
                        <h3>รหัสผ่าน</h3>
                        <Button
                          type="button"
                          variant="secondary"
                          isDisabled={busy || selectedStudent.active === null}
                          onPress={(event) => {
                            actionRef.current = event.target as HTMLButtonElement
                            setStudentAction("reset")
                          }}
                        >
                          ตั้งรหัสผ่านเริ่มต้น
                        </Button>
                      </section>
                    </Tabs.Panel>
                  </Tabs>
                </form>
              )}
            </EditorModal>
          </section>
        </>
      )}
      <EditorModal
        isOpen={accountOpen}
        onClose={closeEditor}
        title={editing ? `แก้ไข ${editing.username}` : "เพิ่มบัญชีเจ้าหน้าที่"}
        busy={busy}
        error={error}
        footer={
          <>
            <Button variant="secondary" isDisabled={busy} onPress={closeEditor}>
              ยกเลิก
            </Button>
            <Button
              type="submit"
              form="staff-account-form"
              variant="primary"
              isDisabled={busy}
              isPending={busy}
            >
              {busy ? "กำลังบันทึก..." : "บันทึกและปิด"}
            </Button>
          </>
        }
      >
        <form
          id="staff-account-form"
          onSubmit={(event) => void saveAccount(event)}
          className="form-grid"
        >
          {!editing && (
            <TextField className="field" isRequired isDisabled={busy}>
              <Label>ชื่อผู้ใช้</Label>
              <Input
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="off"
              />
            </TextField>
          )}
          <TextField className="field" isRequired isDisabled={busy}>
            <Label>ชื่อที่แสดง</Label>
            <Input
              autoFocus={Boolean(editing)}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </TextField>
          {editing?.username !== "administrator" && (
            <SelectBox
              label="สิทธิ์"
              value={role}
              onChange={setRole}
              disabled={busy}
              options={[
                { value: "advisor", label: "อาจารย์ที่ปรึกษา" },
                { value: "admin", label: "ผู้ดูแลระบบ" },
              ]}
            />
          )}
          <TextField className="field" isRequired={!editing} isDisabled={busy}>
            <Label>{editing ? "รหัสผ่านใหม่ (หากต้องการเปลี่ยน)" : "รหัสผ่าน"}</Label>
            <Input
              type="password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </TextField>
        </form>
      </EditorModal>
      <EditorModal
        alert
        isOpen={Boolean(studentAction)}
        onClose={closeStudentAction}
        busy={busy}
        error={error}
        ariaLabel="ยืนยันการจัดการบัญชีนิสิต"
        title={
          studentAction === "reset"
            ? "ตั้งรหัสผ่านเริ่มต้น"
            : studentAction === "disable"
              ? "ระงับบัญชี"
              : "เปิดใช้งานบัญชี"
        }
        footer={
          <>
            <Button variant="secondary" isDisabled={busy} onPress={closeStudentAction}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              isDisabled={busy}
              isPending={busy}
              onPress={() => void applyStudentAction()}
            >
              ยืนยัน
            </Button>
          </>
        }
      >
        <p>
          {studentAction === "reset"
            ? `รหัสผ่านของนิสิต ${selectedStudent?.studentId} จะถูกตั้งเป็นรหัสผ่านเริ่มต้น`
            : `ยืนยันการ${studentAction === "disable" ? "ระงับ" : "เปิดใช้งาน"}บัญชี ${selectedStudent?.studentId}`}
        </p>
      </EditorModal>
    </div>
  )
}
