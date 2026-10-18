import { ToastProvider } from "@heroui/react"

export function FeedbackRegion() {
  return <ToastProvider maxVisibleToasts={3} placement="bottom end" />
}
