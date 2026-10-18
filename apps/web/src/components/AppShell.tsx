import { Suspense } from "react"
import { PageLoading } from "./PageLoading"
import { Drawer, Dropdown, Popover, Separator } from "@heroui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CN, GB, TH } from "country-flag-icons/react/3x2"
import {
  Building2,
  Route,
  CalendarDays,
  Check,
  CircleMinus,
  CirclePlus,
  Clock3,
  FileText,
  GraduationCap,
  Landmark,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  Search,
  SlidersHorizontal,
  Sun,
  UserRound,
} from "lucide-react"
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router"
import { clearAppearanceCache, useAppearance } from "../appearance/AppearanceProvider"
import { useI18n } from "../i18n"
import { getTerms, logout } from "../lib/api"
import { QuickCourseSearch } from "./QuickCourseSearch"
import styles from "./Shell.module.css"
import { SidebarIdentity } from "./SidebarIdentity"
import { useMobileSidebar } from "./useMobileSidebar"

type RouteItem = {
  to: string
  labelKey: string
  icon: ReactNode
}

const routeGroups: Array<{ labelKey: string; items: RouteItem[] }> = [
  {
    labelKey: "nav.work",
    items: [
      {
        to: "/dashboard",
        labelKey: "nav.dashboard",
        icon: <LayoutDashboard aria-hidden="true" size={17} />,
      },
      {
        to: "/search",
        labelKey: "nav.search",
        icon: <Search aria-hidden="true" size={17} />,
      },
      {
        to: "/register",
        labelKey: "nav.register",
        icon: <CirclePlus aria-hidden="true" size={17} />,
      },
    ],
  },
  {
    labelKey: "nav.manage",
    items: [
      { to: "/drop", labelKey: "nav.drop", icon: <CircleMinus aria-hidden="true" size={17} /> },
      {
        to: "/withdraw",
        labelKey: "nav.withdraw",
        icon: <FileText aria-hidden="true" size={17} />,
      },
    ],
  },
  {
    labelKey: "nav.plan",
    items: [
      {
        to: "/schedule",
        labelKey: "nav.schedule",
        icon: <CalendarDays aria-hidden="true" size={17} />,
      },
      {
        to: "/navigation",
        labelKey: "nav.navigation",
        icon: <Route aria-hidden="true" size={17} />,
      },
      { to: "/exams", labelKey: "nav.exams", icon: <Clock3 aria-hidden="true" size={17} /> },
      {
        to: "/buildings",
        labelKey: "nav.buildings",
        icon: <Building2 aria-hidden="true" size={17} />,
      },
      {
        to: "/faculties",
        labelKey: "nav.faculties",
        icon: <Landmark aria-hidden="true" size={17} />,
      },
    ],
  },
]

const languageOptions = [
  { language: "th", label: "ไทย", Flag: TH },
  { language: "en", label: "English", Flag: GB },
  { language: "zh", label: "中文", Flag: CN },
] as const

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n()
  return (
    <nav className={styles.routeGroups} aria-label={t("shell.primaryNavigation")}>
      {routeGroups.map((group) => (
        <section className={styles.routeGroup} key={group.labelKey}>
          <h2>{t(group.labelKey)}</h2>
          <div>
            {group.items.map((route) => (
              <NavLink
                className={({ isActive }) =>
                  (styles.routeLink ?? "") + (isActive ? " " + (styles.routeLinkActive ?? "") : "")
                }
                data-inline-control="navigation"
                key={route.to}
                onClick={onNavigate}
                to={route.to}
              >
                <span className={styles.routeIcon}>{route.icon}</span>
                <span>{t(route.labelKey)}</span>
              </NavLink>
            ))}
          </div>
        </section>
      ))}
    </nav>
  )
}

function Brand() {
  const { t } = useI18n()
  return (
    <div className={styles.brand}>
      <span className={styles.brandMark}>
        <GraduationCap aria-hidden="true" size={18} />
      </span>
      <span>
        <strong>{t("app.name")}</strong>
        <small>{t("app.demo")}</small>
      </span>
    </div>
  )
}

const css = (value: string | undefined) => value ?? ""

export function AppShell({ studentId }: { studentId: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const { settings, update } = useAppearance()
  const { t } = useI18n()
  const {
    isOpen: mobileSidebarOpen,
    setOpen: setMobileSidebarOpen,
    backdropRef,
  } = useMobileSidebar()
  const previousPath = useRef<string | null>(null)
  const routeScrollPending = useRef(false)
  useLayoutEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname
      routeScrollPending.current = true
    }
    // Wait for the drawer's scroll lock to release before resetting the new page.
    if (!mobileSidebarOpen && routeScrollPending.current) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" })
      routeScrollPending.current = false
    }
  }, [pathname, mobileSidebarOpen])
  const [searchOpen, setSearchOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [topbarScrolled, setTopbarScrolled] = useState(false)
  const [wideProfileMenu, setWideProfileMenu] = useState(
    () => window.matchMedia("(min-width: 40rem)").matches,
  )
  const topbarSentinel = useRef<HTMLSpanElement | null>(null)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  )
  const isDark = settings.theme === "dark" || (settings.theme === "system" && systemDark)
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const sync = () => setSystemDark(media.matches)
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])
  useEffect(() => {
    const media = window.matchMedia("(min-width: 40rem)")
    const sync = () => setWideProfileMenu(media.matches)
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])
  useEffect(() => {
    const sentinel = topbarSentinel.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => setTopbarScrolled(entry ? !entry.isIntersecting : false),
      { threshold: 1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])
  const terms = useQuery({ queryKey: ["terms"], queryFn: getTerms })
  const currentTerm = terms.data?.find((term) => term.current)
  const preferenceLabel =
    settings.theme === "dark"
      ? t("appearance.dark")
      : settings.theme === "light"
        ? t("appearance.light")
        : t("appearance.system")
  const currentLanguage =
    languageOptions.find((option) => option.language === settings.language) ?? languageOptions[0]
  const CurrentLanguageFlag = currentLanguage.Flag
  const themeOptions = [
    {
      theme: "light" as const,
      label: t("appearance.light"),
      icon: <Sun aria-hidden="true" size={17} />,
    },
    {
      theme: "dark" as const,
      label: t("appearance.dark"),
      icon: <Moon aria-hidden="true" size={17} />,
    },
    {
      theme: "system" as const,
      label: t("appearance.system"),
      icon: <Monitor aria-hidden="true" size={17} />,
    },
  ] as const
  const currentTheme =
    themeOptions.find((option) => option.theme === settings.theme) ?? themeOptions[2]
  const termLabel = currentTerm
    ? currentTerm.academicYear + "/" + currentTerm.semester
    : t("common.loading")
  const toggleTheme = () => {
    update({ theme: isDark ? "light" : "dark" })
  }

  const logoutMutation = useMutation({
    mutationFn: logout,
    async onSuccess() {
      queryClient.clear()
      clearAppearanceCache()
      navigate("/login", { replace: true })
    },
  })

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [])

  return (
    <div className={styles.shell}>
      <span aria-hidden="true" className={styles.topbarSentinel} ref={topbarSentinel} />
      <a href="#main-content" className={styles.skipLink}>
        {t("shell.skipContent")}
      </a>
      <aside className={styles.sidebar}>
        <Brand />
        <Navigation />
        <SidebarIdentity studentId={studentId} />
      </aside>

      <header className={styles.topbar} data-scrolled={topbarScrolled ? "true" : undefined}>
        <Drawer.Root isOpen={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <Drawer.Trigger
            aria-label={t("shell.allMenu")}
            className={`${css(styles.utilityButton)} ${css(styles.mobileSidebarTrigger)}`}
            data-testid="mobile-sidebar-trigger"
          >
            <Menu aria-hidden="true" size={20} />
          </Drawer.Trigger>
          <Drawer.Backdrop
            ref={backdropRef}
            className={css(styles.mobileSidebarBackdrop)}
            isDismissable
          >
            <Drawer.Content className={css(styles.mobileSidebarPosition)} placement="left">
              <Drawer.Dialog
                aria-label={t("shell.allMenu")}
                className={css(styles.mobileSidebarDialog)}
                style={{ touchAction: "pan-y" }}
                onPointerDown={() => {}}
                onPointerMove={() => {}}
                onPointerUp={() => {}}
              >
                <Drawer.Header className={css(styles.mobileSidebarHeader)}>
                  <Brand />
                  <button
                    aria-label={t("shell.closeNavigation")}
                    className={styles.mobileSidebarClose}
                    onClick={() => setMobileSidebarOpen(false)}
                    type="button"
                  >
                    <PanelLeftClose aria-hidden="true" size={18} />
                  </button>
                </Drawer.Header>
                <Drawer.Body className={css(styles.mobileSidebarBody)}>
                  <Navigation onNavigate={() => setMobileSidebarOpen(false)} />
                </Drawer.Body>
                <div className={styles.mobileSidebarIdentity}>
                  <SidebarIdentity studentId={studentId} />
                </div>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer.Root>
        <div className={styles.topbarActions}>
          <Popover isOpen={searchOpen} onOpenChange={setSearchOpen}>
            <Popover.Trigger
              aria-label={t("nav.search")}
              className={css(styles.utilityButton)}
              data-inline-control="search-trigger"
            >
              <Search aria-hidden="true" size={16} />
            </Popover.Trigger>
            <Popover.Content className={css(styles.quickSearchPopover)} placement="bottom end">
              <Popover.Dialog
                aria-label={t("nav.search")}
                className={css(styles.quickSearchDialog)}
              >
                <QuickCourseSearch onNavigate={() => setSearchOpen(false)} />
              </Popover.Dialog>
            </Popover.Content>
          </Popover>

          <button
            aria-label={t("shell.toggleTheme")}
            className={css(styles.utilityButton)}
            data-inline-control="theme-toggle"
            onClick={toggleTheme}
            type="button"
          >
            {isDark ? <Sun aria-hidden="true" size={17} /> : <Moon aria-hidden="true" size={17} />}
          </button>

          <Dropdown isOpen={profileOpen} onOpenChange={setProfileOpen}>
            <Dropdown.Trigger
              aria-label={studentId}
              className={css(styles.utilityButton)}
              data-inline-control="account-menu"
            >
              <UserRound aria-hidden="true" size={18} />
            </Dropdown.Trigger>
            <Dropdown.Popover className={css(styles.menuContent)} placement="bottom end">
              <div className={styles.profileSummary}>
                <span className={styles.profileAvatar}>{studentId.slice(0, 2).toUpperCase()}</span>
                <span className={styles.profileCopy}>
                  <strong>{studentId}</strong>
                  <small>{preferenceLabel}</small>
                </span>
              </div>
              <div className={styles.profileTerm}>
                <CalendarDays aria-hidden="true" size={16} />
                <span>{t("common.currentTerm")}</span>
                <strong>{termLabel}</strong>
              </div>
              <Separator className={css(styles.menuSeparator)} />
              <Dropdown.Menu
                aria-label={studentId}
                onAction={(key) => {
                  if (String(key) === "appearance") {
                    navigate("/appearance")
                  } else if (String(key) === "logout") {
                    logoutMutation.mutate()
                  }
                }}
              >
                <Dropdown.SubmenuTrigger>
                  <Dropdown.Item
                    className={css(styles.menuItem)}
                    id="mode-menu"
                    textValue={t("shell.mode")}
                  >
                    {currentTheme.icon}
                    <span className={styles.menuLabel}>{t("shell.mode")}</span>
                    <span className={styles.menuValue}>{preferenceLabel}</span>
                  </Dropdown.Item>
                  <Dropdown.Popover
                    className={`${css(styles.menuContent)} ${css(styles.submenuContent)}`}
                    placement={wideProfileMenu ? "left top" : "bottom end"}
                  >
                    <Dropdown.Menu
                      aria-label={t("shell.mode")}
                      disallowEmptySelection
                      onAction={(key) => {
                        const theme = String(key)
                        if (theme === "system" || theme === "light" || theme === "dark") {
                          update({ theme })
                          setProfileOpen(false)
                        }
                      }}
                      selectedKeys={[settings.theme]}
                      selectionMode="single"
                    >
                      {themeOptions.map((option) => (
                        <Dropdown.Item
                          className={css(styles.menuItem)}
                          id={option.theme}
                          key={option.theme}
                          textValue={option.label}
                        >
                          {option.icon}
                          <span className={styles.menuLabel}>{option.label}</span>
                          {settings.theme === option.theme ? (
                            <Check aria-hidden="true" className={styles.menuCheck} size={15} />
                          ) : null}
                        </Dropdown.Item>
                      ))}
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown.SubmenuTrigger>
                <Dropdown.SubmenuTrigger>
                  <Dropdown.Item
                    className={css(styles.menuItem)}
                    id="language-menu"
                    textValue={t("shell.language")}
                  >
                    <Languages aria-hidden="true" size={16} />
                    <span className={styles.menuLabel}>{t("shell.language")}</span>
                    <span className={styles.menuValue}>
                      {currentLanguage.label}
                      <CurrentLanguageFlag aria-hidden="true" className={styles.languageFlag} />
                    </span>
                  </Dropdown.Item>
                  <Dropdown.Popover
                    className={`${css(styles.menuContent)} ${css(styles.submenuContent)}`}
                    placement={wideProfileMenu ? "left top" : "bottom end"}
                  >
                    <Dropdown.Menu
                      aria-label={t("shell.language")}
                      disallowEmptySelection
                      onAction={(key) => {
                        const language = String(key)
                        if (language === "th" || language === "en" || language === "zh") {
                          update({ language })
                          setProfileOpen(false)
                        }
                      }}
                      selectedKeys={[settings.language]}
                      selectionMode="single"
                    >
                      {languageOptions.map((option) => {
                        const Flag = option.Flag
                        return (
                          <Dropdown.Item
                            className={css(styles.menuItem)}
                            id={option.language}
                            key={option.language}
                            textValue={option.label}
                          >
                            <Flag aria-hidden="true" className={styles.languageFlag} />
                            <span className={styles.menuLabel}>{option.label}</span>
                            {settings.language === option.language ? (
                              <Check aria-hidden="true" className={styles.menuCheck} size={15} />
                            ) : null}
                          </Dropdown.Item>
                        )
                      })}
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown.SubmenuTrigger>
                <Separator className={css(styles.menuSeparator)} />
                <Dropdown.Item
                  className={css(styles.menuItem)}
                  id="appearance"
                  textValue={t("shell.appearance")}
                >
                  <SlidersHorizontal aria-hidden="true" size={16} />
                  <span className={styles.menuLabel}>{t("shell.appearance")}</span>
                </Dropdown.Item>
                <Separator className={css(styles.menuSeparator)} />
                <Dropdown.Item
                  className={css(styles.menuItem)}
                  id="logout"
                  textValue={t("shell.logout")}
                >
                  <LogOut aria-hidden="true" size={16} />
                  <span className={styles.menuLabel}>{t("shell.logout")}</span>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className={styles.main}>
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
        <footer className={styles.footer}>
          <span>{t("app.name")} Mock</span>
          <span>{t("shell.importedData")}</span>
        </footer>
      </main>
    </div>
  )
}
