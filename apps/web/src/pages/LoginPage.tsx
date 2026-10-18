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
  const [touched, setTouched] = useState(false)

  const loginMutation = useMutation({
    mutationFn: login,
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ["me"] })
      navigate("/dashboard", { replace: true })
    },
  })

  if (me.isSuccess) return <Navigate to="/dashboard" replace />

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!studentId.trim() || !password || !/^\d{4}$/.test(challengeCode)) return
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
    touched && !/^\d{4}$/.test(challengeCode)
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
      th: "ระบบจริงต้องยืนยันตัวตนผ่าน CUNET ก่อนอนุญาตให้ลงทะเบียน โหมดนี้เป็นข้อมูลจำลองในเครื่องเท่านั้น",
      en: "A real deployment must verify identity through CUNET before registration; this mode uses local mock data only.",
      zh: "正式部署必须先通过 CUNET 验证身份；此模式仅使用本地模拟数据。",
    }),
    text({
      th: "สำนักงานการทะเบียนกำหนดให้นิสิตแต่ละคนยืนยันการลงทะเบียนเรียนได้ไม่เกินวันละ 10 ครั้ง",
      en: "Each student may confirm registration no more than 10 times per day.",
      zh: "每位学生每天确认选课不得超过 10 次。",
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
          <h1>{text({ th: "เข้าสู่ระบบทดลอง", en: "Demo sign in", zh: "演示登录" })}</h1>
          <p>
            {text({
              th: "โหมดจำลองในเครื่องนี้ให้เลือกรหัสนิสิตสำหรับโปรไฟล์ทดสอบเท่านั้น ไม่ได้ยืนยันตัวตนหรือเชื่อมต่อ CUNET",
              en: "This local demo selects a student ID only as a test profile. It does not verify identity or connect to CUNET.",
              zh: "此本地演示仅将学号用作测试配置，不验证身份，也不连接 CUNET。",
            })}
          </p>
        </div>
        {mutationError ? <Status tone="error">{mutationError}</Status> : null}
        <form className={styles.form} onSubmit={submit} noValidate>
          <Field
            autoComplete="username"
            error={
              touched && !studentId.trim()
                ? text({
                    th: "กรอกรหัสนิสิตเพื่อระบุข้อมูลของคุณ",
                    en: "Enter your student ID to identify your data.",
                    zh: "请输入学号以识别你的数据。",
                  })
                : undefined
            }
            id="student-id"
            label={text({ th: "รหัสนิสิต", en: "Student ID", zh: "学号" })}
            maxLength={32}
            onBlur={() => setTouched(true)}
            onChange={(event) => setStudentId(event.target.value)}
            placeholder={text({
              th: "เช่น 6630000000",
              en: "For example, 6630000000",
              zh: "例如 6630000000",
            })}
            value={studentId}
          />
          <Field
            autoComplete="current-password"
            error={
              touched && !password
                ? text({
                    th: "กรอกรหัสผ่านอย่างน้อย 1 ตัวอักษร",
                    en: "Enter at least one password character.",
                    zh: "请输入至少一个密码字符。",
                  })
                : undefined
            }
            helper={text({
              th: "จำเป็นตามข้อกำหนดของหน้าลงทะเบียน แต่โหมดจำลองจะไม่จัดเก็บหรือตรวจสอบรหัสผ่านนี้",
              en: "Required by the registration specification; this local mock does not store or verify it.",
              zh: "选课规范要求填写；此本地模拟不会存储或验证该密码。",
            })}
            id="password"
            label={text({ th: "รหัสผ่าน", en: "Password", zh: "密码" })}
            maxLength={128}
            onBlur={() => setTouched(true)}
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
              en: "Without Remember Me, this demo signs out after 10 minutes of inactivity.",
              zh: "未选择记住登录时，此演示会在 10 分钟无操作后退出登录。",
            })}
          </p>
          <div className={styles.challenge}>
            <div className={styles.challengeHeader}>
              <div className={styles.challengeTitle}>
                <strong>
                  {text({
                    th: "รหัสภาพป้องกันบอต 4 หลัก",
                    en: "Four-digit bot-check image",
                    zh: "四位防机器人验证码",
                  })}
                </strong>
                <span>{text({ th: "CAPTCHA สาธิต", en: "Demo CAPTCHA", zh: "演示 CAPTCHA" })}</span>
              </div>
              <p id="challenge-demo-note">
                {text({
                  th: "ใช้ทดสอบขั้นตอนป้องกันบอตเท่านั้น ไม่ใช่การยืนยันตัวตนจริงของจุฬาฯ",
                  en: "This only demonstrates a bot-check step; it is not real Chulalongkorn authentication.",
                  zh: "这仅用于演示防机器人步骤，并非朱拉隆功大学的真实身份验证。",
                })}
              </p>
            </div>
            <div className={styles.challengeControls}>
              <div
                aria-busy={challenge.isFetching}
                aria-describedby="challenge-demo-note"
                aria-label={
                  challengeIsReady
                    ? text({
                        th: `รหัส CAPTCHA สำหรับระบบตัวอย่าง ${challengeDigits.join(" ")}`,
                        en: `Demo CAPTCHA code ${challengeDigits.join(" ")}`,
                        zh: `演示 CAPTCHA 验证码 ${challengeDigits.join(" ")}`,
                      })
                    : text({
                        th: "กำลังสร้างรหัส CAPTCHA สำหรับระบบตัวอย่าง",
                        en: "Generating the demo CAPTCHA code",
                        zh: "正在生成演示 CAPTCHA 验证码",
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
                  th: "สร้างรหัส CAPTCHA สำหรับระบบตัวอย่างใหม่",
                  en: "Generate a new demo CAPTCHA code",
                  zh: "生成新的演示 CAPTCHA 验证码",
                })}
                disabled={challenge.isFetching}
                type="button"
                variant="quiet"
                onClick={() => {
                  setChallengeCode("")
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
              onBlur={() => setTouched(true)}
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
                th: "กรณีนิสิตลืมรหัสผ่าน CUNET สำหรับการเข้าสู่ระบบ ติดต่อที่สำนักบริหารเทคโนโลยีสารสนเทศ",
                en: "For a forgotten CUNET sign-in password, contact the Office of Information Technology Administration.",
                zh: "如忘记 CUNET 登录密码，请联系信息技术管理办公室。",
              })}
            </h3>
            <address>
              {text({
                th: "อาคารจามจุรี 3 ชั้น 4.",
                en: "Chamchuri 3 Building, 4th floor.",
                zh: "Chamchuri 3 大楼 4 楼。",
              })}
              <br />
              {text({ th: "โทร. ", en: "Tel. ", zh: "电话：" })}
              <a href="tel:+6622183314">02-218-3314</a>{" "}
              {text({ th: "อีเมล์ ", en: "Email ", zh: "电子邮件：" })}
              <a href="mailto:help@chula.ac.th">help@chula.ac.th</a>
            </address>
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
