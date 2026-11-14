import type { MeDto } from "@regchula/api/public-types"
import { FieldError, Input, Label, TextField } from "@heroui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarClock, CircleAlert, KeyRound, UserRoundCheck } from "lucide-react"
import { type FormEvent, type ReactNode, useId, useState } from "react"
import { PageLoading } from "../components/PageLoading"
import { Button, Status } from "../components/ui"
import uiStyles from "../components/ui.module.css"
import { useI18n } from "../i18n"
import { ApiError } from "../lib/api"
import pageStyles from "./pages.module.css"
import styles from "./StudentAccess.module.css"
import { getRegistrationAccess, submitRegistrationCode } from "./student-access-api"

export function RegistrationAccess({ children }: { children: () => ReactNode }) {
  const { text } = useI18n()
  const client = useQueryClient()
  const studentId = client.getQueryData<MeDto>(["me"])?.studentId
  const queryKey = ["registration-access", studentId]
  const [code, setCode] = useState("")
  const fieldId = useId()
  const access = useQuery({ queryKey, queryFn: getRegistrationAccess, retry: false })
  const submit = useMutation({
    mutationFn: submitRegistrationCode,
    onSuccess(data) {
      setCode("")
      client.setQueryData(queryKey, data)
    },
  })

  if (access.isPending) return <PageLoading />
  if (access.data?.status === "open" && access.data.authorized) return children()

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (code.trim() && !submit.isPending) submit.mutate(code.trim())
  }
  const invalidCode =
    submit.error instanceof ApiError && submit.error.code === "REGISTRATION_CODE_INVALID"
  const needsCode = access.data?.status === "code_required"
  const needsProfile = access.data?.status === "profile_required"
  const StateIcon = access.isError
    ? CircleAlert
    : needsCode
      ? KeyRound
      : needsProfile
        ? UserRoundCheck
        : CalendarClock
  const title = access.isError
    ? text({ th: "ตรวจสอบสิทธิ์ไม่สำเร็จ", en: "Access check unavailable", zh: "无法检查选课权限" })
    : needsCode
      ? text({ th: "ยืนยันสิทธิ์ลงทะเบียน", en: "Ready to register", zh: "准备开始选课" })
      : needsProfile
        ? text({ th: "ตรวจสอบข้อมูลนิสิต", en: "Your student information", zh: "检查学生信息" })
        : text({ th: "ยังไม่เปิดลงทะเบียน", en: "Registration is closed", zh: "选课尚未开放" })

  return (
    <div className={`${pageStyles.page} ${styles.accessPage}`}>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBody}>
          <h1>{text({ th: "ลงทะเบียนรายวิชา", en: "Course registration", zh: "课程注册" })}</h1>
        </div>
      </header>
      <div className={styles.gateStage}>
        <section
          className={`${styles.panel} ${styles.gatePanel}`}
          aria-labelledby="registration-access-title"
        >
          <span className={styles.stateIcon} aria-hidden="true">
            <StateIcon size={28} />
          </span>
          <div className={styles.gateIntro}>
            <h2 id="registration-access-title">{title}</h2>
            {needsCode && (
              <p>
                {text({
                  th: "กรอกรหัสที่ได้รับจากอาจารย์ที่ปรึกษาเพื่อเริ่มลงทะเบียน",
                  en: "Enter the code from your academic advisor to begin registration.",
                  zh: "请输入学业导师提供的代码以开始选课。",
                })}
              </p>
            )}
          </div>
          {access.isError ? (
            <>
              <Status tone="error">
                {text({
                  th: "ตรวจสอบสิทธิ์ลงทะเบียนไม่สำเร็จ",
                  en: "Could not check registration access.",
                  zh: "无法检查选课权限。",
                })}
              </Status>
              <Button onClick={() => void access.refetch()} loading={access.isFetching}>
                {text({ th: "ลองอีกครั้ง", en: "Try again", zh: "重试" })}
              </Button>
            </>
          ) : needsCode ? (
            <form className={styles.gateForm} onSubmit={onSubmit}>
              <TextField
                className={styles.codeField ?? ""}
                isInvalid={invalidCode}
                isDisabled={submit.isPending}
              >
                <Label className={uiStyles.label} htmlFor={fieldId}>
                  {text({ th: "รหัสลงทะเบียน", en: "Registration code", zh: "选课代码" })}
                </Label>
                <div className={styles.codeRow}>
                  <Input
                    className={`${uiStyles.input} ${styles.codeInput}`}
                    id={fieldId}
                    aria-describedby={invalidCode ? `${fieldId}-error` : undefined}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={128}
                    name="registration-code"
                    onChange={(event) => {
                      setCode(event.currentTarget.value)
                      if (submit.isError) submit.reset()
                    }}
                    type="text"
                    value={code}
                  />
                  <Button
                    disabled={!code.trim()}
                    loading={submit.isPending}
                    type="submit"
                    variant="primary"
                  >
                    {text({ th: "ดำเนินการต่อ", en: "Continue", zh: "继续" })}
                  </Button>
                </div>
                {invalidCode && (
                  <FieldError className={styles.codeError ?? ""} id={`${fieldId}-error`}>
                    {text({
                      th: "รหัสลงทะเบียนไม่ถูกต้อง",
                      en: "The registration code is incorrect.",
                      zh: "选课代码不正确。",
                    })}
                  </FieldError>
                )}
              </TextField>
              {submit.isError && !invalidCode ? (
                <Status tone="error">
                  {text({
                    th: "ตรวจสอบรหัสไม่สำเร็จ โปรดลองอีกครั้ง",
                    en: "Could not verify the code. Please try again.",
                    zh: "无法验证代码，请重试。",
                  })}
                </Status>
              ) : null}
            </form>
          ) : needsProfile ? (
            <Status tone="warning">
              {text({
                th: "กรุณาติดต่อสำนักงานทะเบียนเพื่อตรวจสอบข้อมูลนิสิตและอาจารย์ที่ปรึกษา",
                en: "Contact the registrar to update your student and advisor information.",
                zh: "请联系注册办公室更新您的学生和导师信息。",
              })}
            </Status>
          ) : (
            <Status>
              {text({
                th: "ขณะนี้ไม่อยู่ในช่วงลงทะเบียนเรียน",
                en: "Registration is not open at this time.",
                zh: "当前不在选课时间内。",
              })}
            </Status>
          )}
          {!access.isError && ["closed", "profile_required"].includes(access.data?.status ?? "") ? (
            <Button onClick={() => void access.refetch()} loading={access.isFetching}>
              {text({ th: "ตรวจสอบอีกครั้ง", en: "Check again", zh: "重新检查" })}
            </Button>
          ) : null}
        </section>
      </div>
    </div>
  )
}
