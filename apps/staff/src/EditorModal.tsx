import { AlertDialog, Button, Modal } from "./ui"
import { X } from "lucide-react"
import type { ReactNode } from "react"

interface EditorModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer: ReactNode
  busy?: boolean
  wide?: boolean
  error?: string
  message?: string
  alert?: boolean
  ariaLabel?: string
}

export function EditorModal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  busy = false,
  wide = false,
  error,
  message,
  alert = false,
  ariaLabel,
}: EditorModalProps) {
  const Dialog = alert ? AlertDialog : Modal
  return (
    <Dialog.Backdrop
      className="overlay"
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
      isDismissable={!alert && !busy}
      isKeyboardDismissDisabled={busy}
    >
      <Dialog.Container
        className="staff-editor-container"
        placement="center"
        {...(!alert ? { scroll: "inside" as const } : {})}
      >
        <Dialog.Dialog
          className={`staff-editor${wide ? " staff-editor-wide" : ""}`}
          aria-label={ariaLabel ?? title}
        >
          <Dialog.Header className="staff-editor-header">
            <Dialog.Heading>{title}</Dialog.Heading>
            <Button
              className="staff-editor-close"
              variant="ghost"
              isIconOnly
              aria-label="ปิด"
              isDisabled={busy}
              onPress={onClose}
            >
              <X size={18} aria-hidden="true" />
            </Button>
          </Dialog.Header>
          {(error || message) && (
            <div className="staff-editor-feedback">
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {message && (
                <p className="success" role="status">
                  {message}
                </p>
              )}
            </div>
          )}
          <Dialog.Body className="staff-editor-body">{children}</Dialog.Body>
          <Dialog.Footer className="staff-editor-footer">{footer}</Dialog.Footer>
        </Dialog.Dialog>
      </Dialog.Container>
    </Dialog.Backdrop>
  )
}
