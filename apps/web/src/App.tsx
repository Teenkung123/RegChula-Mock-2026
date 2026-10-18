import { useQuery } from "@tanstack/react-query"
import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router"
import { AppearanceProvider } from "./appearance/AppearanceProvider"
import { SessionTimeout } from "./auth/SessionTimeout"
import { AppShell } from "./components/AppShell"
import { LocaleProvider } from "./i18n"
import { ApiError, getMe } from "./lib/api"
import { Button, Status } from "./components/ui"
import { PageLoading } from "./components/PageLoading"

const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })),
)
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
)
const CourseExplorerPage = lazy(() =>
  import("./pages/CourseExplorerPage").then((module) => ({
    default: module.CourseExplorerPage,
  })),
)
const RegistrationPage = lazy(() =>
  import("./pages/RegistrationPage").then((module) => ({ default: module.RegistrationPage })),
)
const ManageRegistrationPage = lazy(() =>
  import("./pages/ManageRegistrationPage").then((module) => ({
    default: module.ManageRegistrationPage,
  })),
)
const SchedulePage = lazy(() =>
  import("./pages/SchedulePage").then((module) => ({ default: module.SchedulePage })),
)
const NavigationPage = lazy(() =>
  import("./pages/NavigationPage").then((module) => ({ default: module.NavigationPage })),
)
const ExamPage = lazy(() =>
  import("./pages/ExamPage").then((module) => ({ default: module.ExamPage })),
)
const BuildingsPage = lazy(() =>
  import("./pages/BuildingsPage").then((module) => ({ default: module.BuildingsPage })),
)
const FacultiesPage = lazy(() =>
  import("./pages/FacultiesPage").then((module) => ({ default: module.FacultiesPage })),
)
const AppearancePage = lazy(() =>
  import("./pages/AppearancePage").then((module) => ({ default: module.AppearancePage })),
)
const FeedbackRegion = lazy(() =>
  import("./components/FeedbackRegion").then((module) => ({ default: module.FeedbackRegion })),
)

function ProtectedApp() {
  const me = useQuery({ queryKey: ["me"], queryFn: getMe, retry: false })
  if (me.isPending)
    return (
      <main>
        <PageLoading fullPage label="กำลังตรวจสอบเซสชัน" />
      </main>
    )
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401)
      return <Navigate to="/login" replace />
    return (
      <main className="boot-state">
        <Status tone="error">เชื่อมต่อระบบไม่ได้ โปรดลองอีกครั้ง</Status>
        <Button onClick={() => void me.refetch()} loading={me.isFetching}>
          ลองอีกครั้ง
        </Button>
      </main>
    )
  }
  if (!me.data) {
    return (
      <main className="boot-state">
        <Status tone="error">ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่</Status>
      </main>
    )
  }
  return (
    <SessionTimeout rememberMe={me.data.rememberMe}>
      <AppearanceProvider studentId={me.data.studentId}>
        <AppShell studentId={me.data.studentId} />
      </AppearanceProvider>
    </SessionTimeout>
  )
}

export function App() {
  return (
    <LocaleProvider language="th">
      <Suspense
        fallback={
          <main>
            <PageLoading fullPage />
          </main>
        }
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedApp />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/search" element={<CourseExplorerPage />} />
            <Route path="/register" element={<RegistrationPage />} />
            <Route path="/drop" element={<ManageRegistrationPage key="drop" action="drop" />} />
            <Route
              path="/withdraw"
              element={<ManageRegistrationPage key="withdraw" action="withdraw" />}
            />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/navigation" element={<NavigationPage />} />
            <Route path="/exams" element={<ExamPage />} />
            <Route path="/buildings" element={<BuildingsPage />} />
            <Route path="/faculties" element={<FacultiesPage />} />
            <Route path="/appearance" element={<AppearancePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
      <Suspense fallback={null}>
        <FeedbackRegion />
      </Suspense>
    </LocaleProvider>
  )
}
