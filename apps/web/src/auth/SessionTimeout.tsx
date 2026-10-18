import { useCallback, useEffect, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { clearAppearanceCache } from "../appearance/AppearanceProvider"
import { logout } from "../lib/api"

const idleMs = 10 * 60_000

export function SessionTimeout({
  children,
  rememberMe,
}: {
  children: ReactNode
  rememberMe: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const expire = useCallback(() => {
    if (rememberMe) return
    void logout().catch(() => undefined)
    queryClient.clear()
    clearAppearanceCache()
    navigate("/login", { replace: true })
  }, [navigate, queryClient, rememberMe])

  useEffect(() => {
    if (rememberMe) return
    let timeout = window.setTimeout(expire, idleMs)
    const renew = () => {
      window.clearTimeout(timeout)
      timeout = window.setTimeout(expire, idleMs)
    }
    const events = ["keydown", "pointerdown", "scroll", "touchstart", "focus"] as const
    for (const event of events) window.addEventListener(event, renew, { passive: true })
    return () => {
      window.clearTimeout(timeout)
      for (const event of events) window.removeEventListener(event, renew)
    }
  }, [expire, rememberMe])

  return children
}
