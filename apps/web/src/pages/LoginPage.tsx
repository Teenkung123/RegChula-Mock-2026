import { Checkbox, InputOTP, REGEXP_ONLY_DIGITS } from "@heroui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, RefreshCw } from "lucide-react"
import { type FormEvent, useState } from "react"
import { Navigate, useNavigate } from "react-router"
import { Button, Field, Status } from "../components/ui"
import { useI18n } from "../i18n"
import { ApiError, getChallenge, getMe, login } from "../lib/api"
import styles from "./LoginPage.module.css"

const challengePositions = ["first", "second", "third", "fourth"] as const

export function LoginPage() {
  const { text } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ["me"], queryFn: getMe, retry: false })
  const challenge = useQuery({ queryKey: ["challenge"], queryFn: getChallenge })
  const [studentId, setStudentId] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [challengeCode, setChallengeCode] = useState("")
  const [touched, setTouched] = useState({ studentId: false, password: false, challenge: false })

  const loginMutation = useMutation({
    mutationFn: login,
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ["me"] })
      navigate("/dashboard", { replace: true })
    },
    async onError() {
      setChallengeCode("")
      setTouched((value) => ({ ...value, challenge: false }))
      await challenge.refetch()
    },
  })

  if (me.isSuccess) return <Navigate to="/dashboard" replace />

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched({ studentId: true, password: true, challenge: true })
    if (!/^\d{10}$/.test(studentId) || !password || !/^\d{4}$/.test(challengeCode)) return
    const challengeToken = challenge.data?.token
    if (!challengeToken) return
    loginMutation.mutate({ studentId, password, rememberMe, challengeCode, challengeToken })
  }

  const mutationError =
    loginMutation.error instanceof ApiError
      ? loginMutation.error.message
      : loginMutation.error
        ? text({
            th: "เชื่อมต่อระบบไม่ได้ โปรดลองอีกครั้ง",
            en: "Could not connect. Please try again.",
            zh: "无法连接，请重试。",
          })
        : null
  const challengeDigits = challenge.data?.code.split("") ?? []
  const challengeIsReady = challengeDigits.length === 4 && !challenge.isFetching
  const challengeEntryError =
    touched.challenge && !/^\d{4}$/.test(challengeCode)
      ? text({
          th: "กรอกตัวเลขให้ครบ 4 หลักตามรหัสด้านบน",
          en: "Enter all four digits shown above.",
          zh: "请输入上方显示的全部四位数字。",
        })
      : undefined
  const policyItems = [
    text({
      th: "นิสิตจะต้องดำเนินการด้วยตนเอง และห้ามดำเนินการแทนนิสิตผู้อื่น มิฉะนั้นนิสิตจะถูกลงโทษทางวินัย",
      en: "Students must complete registration themselves and must not act for another student. Violations may lead to disciplinary action.",
      zh: "学生必须自行办理选课，不得代替他人操作；违规者可能受到纪律处分。",
    }),
    text({
      th: "นิสิตต้องตรวจสอบผลการลงทะเบียนเรียนทันทีทุกครั้งหลังจากที่ทำการลงทะเบียนเรียนสาย เพิ่ม-ลดรายวิชา หรือเปลี่ยนตอนเรียนผ่านทางอินเทอร์เน็ตและควรพิมพ์ผลการลงทะเบียนเรียน (CR54) หลังหมดกำหนดการเพิ่ม-ลดรายวิชา เพื่อตรวจสอบและเก็บไว้เป็นหลักฐาน",
      en: "After late registration, add/drop, or an online section change, students must verify the result immediately. Print the CR54 record after the add/drop deadline and retain it as evidence.",
      zh: "完成延迟选课、加退选或在线更换班次后，学生必须立即核对结果。加退选截止后应打印 CR54 记录并妥善保存。",
    }),
    text({
      th: "ห้ามมิให้นิสิตกระทำการใดๆ อันเป็นการเข้าถึงระบบคอมพิวเตอร์โดยมิชอบ การลักลอบสำเนาหรือโอนถ่ายข้อมูล การก่อกวนระบบคอมพิวเตอร์ หรือการอื่นใดซึ่งอาจทำให้ระบบคอมพิวเตอร์เสียหาย (ระเบียบจุฬาลงกรณ์มหาวิทยาลัย ว่าด้วยวินัยนิสิต ฉบับที่ ๒ ข้อ ๘/๒)เช่นเขียนโปรแกรมยืนยันผลการลงทะเบียนเรียนแทนตัวนิสิต เป็นต้น นิสิตจะถูกลงโทษทางวินัย และ ห้ามเข้าระบบ",
      en: "Do not access computer systems without authorization, copy or transfer data without permission, disrupt systems, or cause damage. Under Chulalongkorn University's student disciplinary regulations, automated programs that confirm registration for a student are prohibited. Violations may lead to disciplinary action and blocked system access.",
      zh: "不得未经授权访问计算机系统、擅自复制或传输数据、干扰系统或造成损害。根据朱拉隆功大学学生纪律规定，禁止使用程序代替学生确认选课。违规者可能受到纪律处分并被禁止访问系统。",
    }),
    text({
      th: "สามารถรองรับการใช้งานได้ทุก Browser",
      en: "The registration service supports use in all browsers.",
      zh: "选课服务可在所有浏览器中使用。",
    }),
  ]

  return (
    <main className={styles.page}>
      <section className={styles.loginPanel}>
        <div className={styles.wordmark}>
          <span>R</span>
          RegChula
        </div>
        <div className={styles.heading}>
          <h1>{text({ th: "เข้าสู่ระบบ", en: "Sign in", zh: "登录" })}</h1>
          <p>
            {text({
              th: "กรอกรหัสนิสิตและรหัสผ่านเพื่อเข้าสู่ระบบ",
              en: "Enter your student ID and password to sign in.",
              zh: "请输入学号和密码登录。",
            })}
          </p>
        </div>
        {mutationError ? <Status tone="error">{mutationError}</Status> : null}
        <form className={styles.form} onSubmit={submit} noValidate>
          <Field
            autoComplete="username"
            error={
              touched.studentId && !/^\d{10}$/.test(studentId)
                ? text({
                    th: "กรอกรหัสนิสิตให้ครบ 10 หลัก",
                    en: "Enter your 10-digit student ID.",
                    zh: "请输入 10 位学号。",
                  })
                : undefined
            }
            id="student-id"
            label={text({ th: "รหัสนิสิต", en: "Student ID", zh: "学号" })}
            inputMode="numeric"
            maxLength={10}
            onBlur={() => setTouched((value) => ({ ...value, studentId: true }))}
            onChange={(event) => setStudentId(event.target.value)}
            placeholder={text({
              th: "รหัสนิสิต 10 หลัก",
              en: "10-digit student ID",
              zh: "10 位学号",
            })}
            value={studentId}
          />
          <Field
            autoComplete="current-password"
            error={
              touched.password && !password
                ? text({
                    th: "กรอกรหัสผ่านอย่างน้อย 1 ตัวอักษร",
                    en: "Enter at least one password character.",
                    zh: "请输入至少一个密码字符。",
                  })
                : undefined
            }
            id="password"
            label={text({ th: "รหัสผ่าน", en: "Password", zh: "密码" })}
            maxLength={128}
            onBlur={() => setTouched((value) => ({ ...value, password: true }))}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
          <Checkbox
            className={styles.rememberMe ?? ""}
            isSelected={rememberMe}
            onChange={setRememberMe}
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator>
                  <Check aria-hidden="true" size={14} />
                </Checkbox.Indicator>
              </Checkbox.Control>
              <span>
                {text({
                  th: "จดจำการเข้าสู่ระบบบนอุปกรณ์นี้",
                  en: "Remember this sign-in on this device",
                  zh: "在此设备记住登录状态",
                })}
              </span>
            </Checkbox.Content>
          </Checkbox>
          <p className={styles.sessionNote}>
            {text({
              th: "หากไม่เลือก ระบบจะออกจากระบบหลังไม่มีการใช้งาน 10 นาที",
              en: "Without Remember Me, you will be signed out after 10 minutes of inactivity.",
              zh: "未选择记住登录时，系统会在 10 分钟无操作后退出登录。",
            })}
          </p>
          <div className={styles.challenge}>
            <div className={styles.challengeHeader}>
              <div className={styles.challengeTitle}>
                <strong>
                  {text({
                    th: "รหัสยืนยัน 4 หลัก",
                    en: "Four-digit verification code",
                    zh: "四位验证码",
                  })}
                </strong>
              </div>
            </div>
            <div className={styles.challengeControls}>
              <div
                aria-busy={challenge.isFetching}
                aria-label={
                  challengeIsReady
                    ? text({
                        th: `รหัสยืนยัน ${challengeDigits.join(" ")}`,
                        en: `Verification code ${challengeDigits.join(" ")}`,
                        zh: `验证码 ${challengeDigits.join(" ")}`,
                      })
                    : text({
                        th: "กำลังสร้างรหัสยืนยัน",
                        en: "Generating verification code",
                        zh: "正在生成验证码",
                      })
                }
                aria-live="polite"
                className={styles.challengeVisual}
                data-testid="challenge-code"
                role="img"
              >
                {challengeIsReady ? (
                  challengePositions.map((position, index) => (
                    <span className={styles.challengeDigit} key={position}>
                      {challengeDigits[index]}
                    </span>
                  ))
                ) : (
                  <span className={styles.challengePending}>
                    {text({ th: "กำลังสร้าง", en: "Generating", zh: "正在生成" })}
                  </span>
                )}
              </div>
              <Button
                aria-label={text({
                  th: "สร้างรหัสยืนยันใหม่",
                  en: "Generate a new verification code",
                  zh: "生成新验证码",
                })}
                disabled={challenge.isFetching}
                type="button"
                variant="quiet"
                onClick={() => {
                  setChallengeCode("")
                  setTouched((value) => ({ ...value, challenge: false }))
                  void challenge.refetch()
                }}
              >
                <span className={styles.refreshContent}>
                  <RefreshCw aria-hidden="true" focusable="false" />
                  {text({ th: "ขอรหัสใหม่", en: "Get a new code", zh: "获取新验证码" })}
                </span>
              </Button>
            </div>
          </div>
          <div className={styles.challengeEntry}>
            <label className={styles.challengeEntryLabel} htmlFor="challenge" id="challenge-label">
              {text({ th: "กรอกรหัสยืนยัน", en: "Enter verification code", zh: "输入验证码" })}
            </label>
            <InputOTP
              aria-describedby={
                challengeEntryError
                  ? "challenge-entry-description challenge-entry-error"
                  : "challenge-entry-description"
              }
              aria-labelledby="challenge-label"
              className={styles.challengeOtp}
              data-testid="challenge-otp"
              id="challenge"
              inputMode="numeric"
              isDisabled={!challenge.data || challenge.isFetching}
              isInvalid={Boolean(challengeEntryError)}
              maxLength={4}
              onBlur={() => setTouched((value) => ({ ...value, challenge: true }))}
              onChange={(value) => setChallengeCode(value.replace(/\D/g, ""))}
              pattern={REGEXP_ONLY_DIGITS}
              validationErrors={challengeEntryError ? [challengeEntryError] : []}
              value={challengeCode}
            >
              <InputOTP.Group className={styles.challengeOtpGroup}>
                {challengePositions.map((position, index) => (
                  <InputOTP.Slot className={styles.challengeOtpSlot} index={index} key={position} />
                ))}
              </InputOTP.Group>
            </InputOTP>
            <span className={styles.challengeEntryDescription} id="challenge-entry-description">
              {text({
                th: "กรอกตัวเลข 4 หลักตามภาพด้านบน",
                en: "Enter the four digits shown in the image above.",
                zh: "请输入上方图片中的四位数字。",
              })}
            </span>
            {challengeEntryError ? (
              <span className={styles.challengeEntryError} id="challenge-entry-error" role="alert">
                {challengeEntryError}
              </span>
            ) : null}
          </div>
          <Button
            loading={loginMutation.isPending}
            type="submit"
            variant="primary"
            disabled={!challenge.data}
          >
            {text({ th: "เข้าสู่ระบบ", en: "Sign in", zh: "登录" })}
          </Button>
        </form>
      </section>
      <aside className={styles.policy} aria-labelledby="login-policy-title">
        <header className={styles.policyHeader}>
          <h2 id="login-policy-title">
            {text({
              th: "ข้อกำหนดการเข้าสู่ระบบการลงทะเบียนเรียน",
              en: "Registration sign-in requirements",
              zh: "选课登录要求",
            })}
          </h2>
          <p>
            {text({
              th: "การเข้าสู่ระบบการลงทะเบียนเรียนของสำนักงานการทะเบียน มีข้อกำหนดดังนี้",
              en: "The Office of the Registrar applies the following requirements for registration sign-in.",
              zh: "教务处对选课登录适用以下要求。",
            })}
          </p>
        </header>

        <ul className={styles.policyList}>
          {policyItems.map((item, index) => (
            <li key={String(index)}>{item}</li>
          ))}
        </ul>

        <section
          className={styles.contacts}
          aria-label={text({ th: "ข้อมูลติดต่อ", en: "Contact information", zh: "联系信息" })}
        >
          <div className={styles.contactSection}>
            <h3>
              {text({
                th: "หากลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบ",
                en: "If you forget your password, contact the system administrator.",
                zh: "如忘记密码，请联系系统管理员。",
              })}
            </h3>
          </div>
          <div className={styles.contactSection}>
            <h3>
              {text({
                th: 'หากนิสิตมีปัญหาเกี่ยวกับ "รหัสลงทะเบียนเรียน" / "รหัสรายวิชา" ติดต่อที่ทะเบียนคณะของนิสิต',
                en: 'For questions about a "registration code" or "course code", contact your faculty registrar.',
                zh: "如对“选课代码”或“课程代码”有疑问，请联系所在学院的注册部门。",
              })}
            </h3>
          </div>
        </section>
      </aside>
    </main>
  )
}
