import { Button, Drawer, Dropdown, Separator } from "@heroui/react"
import {
  CalendarDays,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Users,
  BookOpen,
  PanelLeftClose,
  UserRound,
} from "lucide-react"
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router"
import { AdvisorCodes } from "./AdvisorCodes"
import { Catalog } from "./Catalog"
import { Enrollment } from "./Enrollment"
import { People } from "./People"
import { Terms } from "./Terms"
import { ApiError, errorMessage, request, staffSessionExpiredEvent } from "./api"
import { Button as StudentButton, Field, Status } from "../../web/src/components/ui"
import { useMobileSidebar } from "../../web/src/components/useMobileSidebar"
import shell from "../../web/src/components/Shell.module.css"
import identity from "../../web/src/components/SidebarIdentity.module.css"
import login from "../../web/src/pages/LoginPage.module.css"
import { FeedbackRegion } from "../../web/src/components/FeedbackRegion"

const css = (value: string | undefined) => value ?? ""

type Staff = { id: string; username: string; displayName: string; role: "admin" | "advisor" }
type NavItem = { path: string; label: string; icon: ReactNode; admin?: boolean }
const nav: NavItem[] = [
  { path: "/", label: "ภาพรวม", icon: <LayoutDashboard size={18} /> },
  { path: "/students", label: "การลงทะเบียนนิสิต", icon: <Search size={18} />, admin: true },
  { path: "/catalog", label: "รายวิชา", icon: <BookOpen size={18} />, admin: true },
  { path: "/terms", label: "ภาคการศึกษา", icon: <CalendarDays size={18} />, admin: true },
  { path: "/accounts", label: "บัญชีผู้ใช้", icon: <Users size={18} />, admin: true },
  { path: "/advisor-codes", label: "รหัสลงทะเบียน", icon: <KeyRound size={18} /> },
]

function Brand() {
  return (
    <div className={shell.brand}>
      <span className={shell.brandMark}>
        <GraduationCap aria-hidden="true" size={18} />
      </span>
      <span>
        <strong>RegChula</strong>
        <small>ระบบสำหรับบุคลากร</small>
      </span>
    </div>
  )
}

function Navigation({ staff, close }: { staff: Staff; close?: () => void }) {
  const groups = [
    {
      label: "การทำงาน",
      items: nav.filter((item) => ["/", "/students", "/advisor-codes"].includes(item.path)),
    },
    {
      label: "จัดการ",
      items: nav.filter((item) => ["/catalog", "/terms", "/accounts"].includes(item.path)),
    },
  ]
  return (
    <nav className={shell.routeGroups} aria-label="เมนูหลัก">
      {groups.map((group) => {
        const items = group.items.filter((item) => !item.admin || staff.role === "admin")
        if (!items.length) return null
        return (
          <section key={group.label} className={shell.routeGroup}>
            <h2>{group.label}</h2>
            <div>
              {items.map((item) => (
                <NavLink
                  end={item.path === "/"}
                  key={item.path}
                  to={item.path}
                  onClick={close}
                  className={({ isActive }) =>
                    `${shell.routeLink}${isActive ? ` ${shell.routeLinkActive}` : ""}`
                  }
                >
                  <span className={shell.routeIcon} aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </section>
        )
      })}
    </nav>
  )
}

function Login({ onLogin }: { onLogin: (staff: Staff) => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      onLogin(
        await request<Staff>("/api/v1/staff/auth/login", {
          method: "POST",
          body: JSON.stringify({ username: username.trim(), password }),
        }),
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className={login.page}>
      <section className={login.loginPanel}>
        <div className={login.wordmark}>
          <span>R</span>RegChula
        </div>
        <div className={login.heading}>
          <h1>เข้าสู่ระบบ</h1>
          <p>กรอกชื่อผู้ใช้และรหัสผ่านสำหรับบุคลากร</p>
        </div>
        {error && <Status tone="error">{error}</Status>}
        <form className={login.form} onSubmit={(event) => void submit(event)}>
          <Field
            label="ชื่อผู้ใช้"
            autoComplete="username"
            required
            disabled={busy}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Field
            label="รหัสผ่าน"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <StudentButton
            type="submit"
            variant="primary"
            loading={busy}
            disabled={busy || !username.trim() || !password}
          >
            เข้าสู่ระบบ
          </StudentButton>
        </form>
      </section>
      <aside className={login.policy}>
        <div className={login.policyHeader}>
          <h2>ระบบทะเบียนสำหรับบุคลากร</h2>
          <p>จัดการข้อมูลรายวิชา ภาคการศึกษา และการลงทะเบียนของนิสิตตามสิทธิ์ของคุณ</p>
        </div>
        <ul className={login.policyList}>
          <li>ผู้ดูแลระบบจัดการข้อมูลและบัญชีผู้ใช้ รวมถึงบันทึกผลคำร้องที่ได้รับอนุมัติแล้ว</li>
          <li>อาจารย์ที่ปรึกษาดูรหัสลงทะเบียนของนิสิตในความดูแล</li>
        </ul>
      </aside>
    </main>
  )
}

function Dashboard({ staff }: { staff: Staff }) {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">พื้นที่ทำงาน</p>
          <h1>สวัสดี, {staff.displayName}</h1>
          <p>เลือกงานที่ต้องการดำเนินการ</p>
        </div>
      </div>
      <div className="panel dashboard-panel">
        <div className="panel-heading">
          <div>
            <h2>งานของคุณ</h2>
            <p className="muted">เข้าถึงข้อมูลที่ใช้บ่อย</p>
          </div>
        </div>
        <div className="dashboard-links">
          {nav
            .filter((item) => item.path !== "/" && (!item.admin || staff.role === "admin"))
            .map((item) => (
              <NavLink to={item.path} key={item.path} className="dashboard-link">
                <span className="dashboard-icon">{item.icon}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>เปิดข้อมูล</small>
                </span>
                <span aria-hidden="true">→</span>
              </NavLink>
            ))}
        </div>
      </div>
    </section>
  )
}

function Workspace({ staff, onLogout }: { staff: Staff; onLogout: () => void }) {
  const { isOpen: open, setOpen, backdropRef } = useMobileSidebar()
  const [logoutError, setLogoutError] = useState("")
  const [logoutPending, setLogoutPending] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const sentinel = useRef<HTMLSpanElement>(null)
  const location = useLocation()
  const previousPath = useRef(location.pathname)
  const roleLabel = staff.role === "admin" ? "ผู้ดูแลระบบ" : "อาจารย์ที่ปรึกษา"
  useEffect(() => {
    if (previousPath.current === location.pathname) return
    previousPath.current = location.pathname
    setOpen(false)
    window.scrollTo({ top: 0 })
  }, [location.pathname, setOpen])
  useEffect(() => {
    const target = sentinel.current
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry?.isIntersecting))
    observer.observe(target)
    return () => observer.disconnect()
  }, [])
  async function logout() {
    setLogoutPending(true)
    try {
      await request("/api/v1/staff/auth/logout", { method: "POST" })
      onLogout()
    } catch (err) {
      setLogoutError(errorMessage(err))
    } finally {
      setLogoutPending(false)
    }
  }
  const staffIdentity = (
    <section className={identity.identity} aria-label="ข้อมูลบุคลากร">
      <dl className={identity.details}>
        <div>
          <dt>ชื่อผู้ใช้</dt>
          <dd>{staff.username}</dd>
        </div>
        <div>
          <dt>ชื่อ</dt>
          <dd>{staff.displayName}</dd>
        </div>
        <div>
          <dt>สิทธิ์</dt>
          <dd>{roleLabel}</dd>
        </div>
      </dl>
    </section>
  )
  return (
    <div className={shell.shell}>
      <span className={shell.topbarSentinel} aria-hidden="true" ref={sentinel} />
      <a className={shell.skipLink} href="#main">
        ข้ามไปยังเนื้อหา
      </a>
      <aside className={shell.sidebar}>
        <Brand />
        <Navigation staff={staff} />
        {staffIdentity}
      </aside>
      <header className={shell.topbar} data-scrolled={scrolled ? "true" : undefined}>
        <Drawer.Root isOpen={open} onOpenChange={setOpen}>
          <Drawer.Trigger
            className={`${shell.utilityButton} ${shell.mobileSidebarTrigger}`}
            aria-label="เปิดเมนู"
          >
            <Menu size={20} aria-hidden="true" />
          </Drawer.Trigger>
          <Drawer.Backdrop
            ref={backdropRef}
            className={css(shell.mobileSidebarBackdrop)}
            isDismissable
          >
            <Drawer.Content className={css(shell.mobileSidebarPosition)} placement="left">
              <Drawer.Dialog className={css(shell.mobileSidebarDialog)} aria-label="เมนูหลัก">
                <Drawer.Header className={css(shell.mobileSidebarHeader)}>
                  <Brand />
                  <button
                    className={shell.mobileSidebarClose}
                    aria-label="ปิดเมนู"
                    type="button"
                    onClick={() => setOpen(false)}
                  >
                    <PanelLeftClose size={18} aria-hidden="true" />
                  </button>
                </Drawer.Header>
                <Drawer.Body className={css(shell.mobileSidebarBody)}>
                  <Navigation staff={staff} close={() => setOpen(false)} />
                </Drawer.Body>
                <div className={shell.mobileSidebarIdentity}>{staffIdentity}</div>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer.Root>
        <div className={shell.topbarActions}>
          <Dropdown>
            <Dropdown.Trigger className={css(shell.utilityButton)} aria-label="บัญชีผู้ใช้">
              <UserRound size={18} aria-hidden="true" />
            </Dropdown.Trigger>
            <Dropdown.Popover className={css(shell.menuContent)} placement="bottom end">
              <div className={shell.profileSummary}>
                <span className={shell.profileAvatar}>
                  {staff.displayName.slice(0, 2).toUpperCase()}
                </span>
                <span className={shell.profileCopy}>
                  <strong>{staff.displayName}</strong>
                  <small>{roleLabel}</small>
                </span>
              </div>
              <Separator className={css(shell.menuSeparator)} />
              <Dropdown.Menu
                aria-label="บัญชีผู้ใช้"
                onAction={(key) => {
                  if (key === "logout") void logout()
                }}
              >
                <Dropdown.Item
                  id="logout"
                  className={css(shell.menuItem)}
                  textValue="ออกจากระบบ"
                  isDisabled={logoutPending}
                >
                  <LogOut size={16} aria-hidden="true" />
                  <span>{logoutPending ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}</span>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      </header>
      <main id="main" className={shell.main}>
        {logoutError && (
          <p className="error" role="alert">
            {logoutError}
          </p>
        )}
        <Routes>
          <Route path="/" element={<Dashboard staff={staff} />} />
          <Route path="/advisor-codes" element={<AdvisorCodes />} />
          {staff.role === "admin" && (
            <>
              <Route path="/students" element={<Enrollment />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/accounts" element={<People />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <footer className={shell.footer}>
          <span>RegChula</span>
          <span>ระบบสำหรับบุคลากร</span>
        </footer>
      </main>
    </div>
  )
}

function SessionApp() {
  const [staff, setStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => {
    let cancelled = false
    const expireSession = () => {
      setStaff(null)
      setError("")
    }
    window.addEventListener(staffSessionExpiredEvent, expireSession)
    request<Staff>("/api/v1/staff/auth/me")
      .then((data) => {
        if (!cancelled) setStaff(data)
      })
      .catch((err: unknown) => {
        if (!cancelled && !(err instanceof ApiError && err.status === 401))
          setError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      window.removeEventListener(staffSessionExpiredEvent, expireSession)
    }
  }, [])
  if (loading)
    return (
      <main className="boot" role="status">
        กำลังตรวจสอบการเข้าสู่ระบบ...
      </main>
    )
  if (error)
    return (
      <main className="boot">
        <p className="error" role="alert">
          {error}
        </p>
        <Button onPress={() => window.location.reload()}>ลองอีกครั้ง</Button>
      </main>
    )
  return staff ? (
    <Workspace staff={staff} onLogout={() => setStaff(null)} />
  ) : (
    <Login onLogin={setStaff} />
  )
}

export function App() {
  return (
    <>
      <SessionApp />
      <FeedbackRegion />
    </>
  )
}
