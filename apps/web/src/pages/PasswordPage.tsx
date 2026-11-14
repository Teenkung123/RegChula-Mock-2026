import { useMutation } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { Button, Field, Status } from "../components/ui"
import { useI18n } from "../i18n"
import { ApiError } from "../lib/api"
import pageStyles from "./pages.module.css"
import styles from "./StudentAccess.module.css"
import { changePassword } from "./student-access-api"

export function PasswordPage() {
  const { text } = useI18n()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const mutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess() {
      setCurrentPassword("")
      setNewPassword("")
      setConfirmation("")
      setSubmitted(false)
    },
  })
  const incorrectCurrent =
    mutation.error instanceof ApiError && mutation.error.code === "INVALID_CREDENTIALS"
  const clearFeedback = () => {
    if (mutation.isError || mutation.isSuccess) mutation.reset()
  }
  const validPassword = newPassword.length >= 8 && newPassword.length <= 128
  const matches = newPassword === confirmation
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (!currentPassword || !validPassword || !matches) return
    mutation.mutate()
  }

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBody}>
          <h1>{text({ th: "เปลี่ยนรหัสผ่าน", en: "Change password", zh: "更改密码" })}</h1>
        </div>
      </header>
      <section className={styles.panel}>
        <form className={styles.form} onSubmit={onSubmit}>
          <Field
            autoComplete="current-password"
            disabled={mutation.isPending}
            error={
              incorrectCurrent
                ? text({
                    th: "รหัสผ่านปัจจุบันไม่ถูกต้อง",
                    en: "The current password is incorrect.",
                    zh: "当前密码不正确。",
                  })
                : undefined
            }
            label={text({ th: "รหัสผ่านปัจจุบัน", en: "Current password", zh: "当前密码" })}
            maxLength={128}
            onChange={(event) => {
              setCurrentPassword(event.currentTarget.value)
              clearFeedback()
            }}
            required
            type="password"
            value={currentPassword}
          />
          <Field
            autoComplete="new-password"
            disabled={mutation.isPending}
            error={
              submitted && !validPassword
                ? text({
                    th: "รหัสผ่านต้องมี 8–128 ตัวอักษร",
                    en: "Use 8–128 characters.",
                    zh: "请输入 8–128 个字符。",
                  })
                : undefined
            }
            label={text({ th: "รหัสผ่านใหม่", en: "New password", zh: "新密码" })}
            maxLength={128}
            onChange={(event) => {
              setNewPassword(event.currentTarget.value)
              clearFeedback()
            }}
            required
            type="password"
            value={newPassword}
          />
          <Field
            autoComplete="new-password"
            disabled={mutation.isPending}
            error={
              submitted && !matches
                ? text({
                    th: "รหัสผ่านไม่ตรงกัน",
                    en: "Passwords do not match.",
                    zh: "两次密码不一致。",
                  })
                : undefined
            }
            label={text({ th: "ยืนยันรหัสผ่านใหม่", en: "Confirm new password", zh: "确认新密码" })}
            maxLength={128}
            onChange={(event) => {
              setConfirmation(event.currentTarget.value)
              clearFeedback()
            }}
            required
            type="password"
            value={confirmation}
          />
          {mutation.isError && !incorrectCurrent ? (
            <Status tone="error">
              {text({
                th: "เปลี่ยนรหัสผ่านไม่สำเร็จ โปรดลองอีกครั้ง",
                en: "Could not change your password. Please try again.",
                zh: "无法更改密码，请重试。",
              })}
            </Status>
          ) : null}
          {mutation.isSuccess ? (
            <Status tone="success">
              {text({ th: "เปลี่ยนรหัสผ่านแล้ว", en: "Password changed.", zh: "密码已更改。" })}
            </Status>
          ) : null}
          <Button loading={mutation.isPending} type="submit" variant="primary">
            {text({ th: "บันทึกรหัสผ่าน", en: "Save password", zh: "保存密码" })}
          </Button>
        </form>
      </section>
    </div>
  )
}
