import { useCallback, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"

const desktopMedia = "(min-width: 60rem)"
const settleDuration = 200

function ownsGesture(target: EventTarget | null) {
  if (!(target instanceof Element)) return true
  if (
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="slider"], [data-slot="slider"], [data-slot="color-slider"], [data-sidebar-swipe="ignore"], [data-horizontal-scroll]',
    )
  )
    return true
  for (let node: Element | null = target; node; node = node.parentElement) {
    if (
      /auto|scroll/.test(getComputedStyle(node).overflowX) &&
      node.scrollWidth > node.clientWidth + 1
    )
      return true
  }
  return false
}

/** HeroUI owns focus/scroll locking; this hook owns only the drawer's horizontal motion. */
export function useMobileSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const opened = useRef(false)
  const progress = useRef(0)
  const frame = useRef<number | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clearPending = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    clearTimeout(timer.current)
  }, [])
  const paint = useCallback((value: number, dragging: boolean) => {
    progress.current = Math.max(0, Math.min(1, value))
    const backdrop = backdropRef.current
    if (!backdrop) return
    backdrop.dataset.dragging = String(dragging)
    backdrop.style.setProperty("--sidebar-progress", String(progress.current))
  }, [])
  const mount = useCallback(() => {
    if (!opened.current) {
      opened.current = true
      flushSync(() => setIsOpen(true))
    }
  }, [])
  const settle = useCallback(
    (open: boolean) => {
      clearPending()
      paint(open ? 1 : 0, false)
      if (!open) {
        timer.current = setTimeout(() => {
          opened.current = false
          setIsOpen(false)
        }, settleDuration)
      }
    },
    [clearPending, paint],
  )
  const setOpen = useCallback(
    (open: boolean) => {
      clearPending()
      if (!open) return settle(false)
      if (window.matchMedia(desktopMedia).matches) return
      if (opened.current) return settle(true)
      mount()
      paint(0, true)
      // Establish the offscreen position before transitioning, without a deferred entrance fade.
      backdropRef.current?.getBoundingClientRect()
      frame.current = requestAnimationFrame(() => settle(true))
    },
    [clearPending, mount, paint, settle],
  )

  useEffect(() => {
    let gesture:
      | {
          x: number
          y: number
          lastX: number
          time: number
          velocity: number
          width: number
          initial: number
          active: boolean
        }
      | undefined
    const width = () =>
      backdropRef.current?.querySelector('[data-slot="drawer-dialog"]')?.getBoundingClientRect()
        .width ??
      Math.min(
        17.5 * parseFloat(getComputedStyle(document.documentElement).fontSize),
        innerWidth - 40,
      )
    const start = (event: TouchEvent) => {
      if (gesture?.active) settle(gesture.initial === 1)
      gesture = undefined
      if (
        event.touches.length !== 1 ||
        window.matchMedia(desktopMedia).matches ||
        ownsGesture(event.target)
      )
        return
      const target = event.target as Element
      if (
        !opened.current &&
        (target.closest(
          'button, a, [role="button"], [role="dialog"], [role="listbox"], [role="menu"]',
        ) ||
          document.querySelector('[aria-modal="true"]'))
      )
        return
      if (
        opened.current &&
        target.closest('[role="dialog"]') &&
        !backdropRef.current?.contains(target)
      )
        return
      const touch = event.touches[0]
      if (!touch) return
      gesture = {
        x: touch.clientX,
        y: touch.clientY,
        lastX: touch.clientX,
        time: event.timeStamp,
        velocity: 0,
        width: width(),
        initial: opened.current ? 1 : 0,
        active: false,
      }
    }
    const move = (event: TouchEvent) => {
      if (!gesture) return
      if (event.touches.length !== 1) return cancel()
      const touch = event.touches[0]
      if (!touch) return
      const dx = touch.clientX - gesture.x
      const dy = touch.clientY - gesture.y
      if (!gesture.active) {
        if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
          gesture = undefined
          return
        }
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return
        if ((gesture.initial === 0 && dx < 0) || (gesture.initial === 1 && dx > 0)) {
          gesture = undefined
          return
        }
        gesture.active = true
        clearPending()
        mount()
      }
      if (event.cancelable) event.preventDefault()
      const elapsed = event.timeStamp - gesture.time
      if (elapsed > 0) gesture.velocity = (touch.clientX - gesture.lastX) / elapsed
      gesture.lastX = touch.clientX
      gesture.time = event.timeStamp
      paint(gesture.initial + dx / gesture.width, true)
    }
    const end = (event: TouchEvent) => {
      if (!gesture) return
      if (gesture.active) {
        const dx = (event.changedTouches[0]?.clientX ?? gesture.lastX) - gesture.x
        const velocity = event.timeStamp - gesture.time < 120 ? gesture.velocity : 0
        const directedDistance = gesture.initial === 0 ? dx : -dx
        const commit =
          directedDistance >= 48 || (directedDistance >= 24 && Math.abs(velocity) >= 0.35)
        const reversing = gesture.initial === 0 ? velocity < -0.35 : velocity > 0.35
        settle(commit && !reversing ? gesture.initial === 0 : gesture.initial === 1)
      }
      gesture = undefined
    }
    const cancel = () => {
      if (gesture?.active) settle(gesture.initial === 1)
      gesture = undefined
    }
    const media = window.matchMedia(desktopMedia)
    const resize = () => {
      if (!media.matches) return
      gesture = undefined
      clearPending()
      opened.current = false
      setIsOpen(false)
    }
    document.addEventListener("touchstart", start, { capture: true, passive: true })
    document.addEventListener("touchmove", move, { capture: true, passive: false })
    document.addEventListener("touchend", end, true)
    document.addEventListener("touchcancel", cancel, true)
    media.addEventListener("change", resize)
    return () => {
      clearPending()
      document.removeEventListener("touchstart", start, true)
      document.removeEventListener("touchmove", move, true)
      document.removeEventListener("touchend", end, true)
      document.removeEventListener("touchcancel", cancel, true)
      media.removeEventListener("change", resize)
    }
  }, [clearPending, mount, paint, settle])

  return { isOpen, setOpen, backdropRef }
}
