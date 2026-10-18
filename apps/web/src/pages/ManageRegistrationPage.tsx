import { AlertDialog, Checkbox, Chip, TextArea, toast } from "@heroui/react"
import type { BatchDropPreviewDto, WithdrawalFormPreviewDto } from "@regchula/api/public-types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, CircleMinus, FileText, Printer, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router"
import { Button, Status } from "../components/ui"
import { useI18n } from "../i18n"
import {
  confirmBatchDrop,
  createWithdrawalForm,
  getRegistrations,
  getMe,
  previewBatchDrop,
  previewWithdrawalForm,
} from "../lib/api"
import { readWithdrawalDraft, saveWithdrawalDraft } from "../lib/withdrawal-draft"
import styles from "./ManageRegistration.module.css"
import pageStyles from "./pages.module.css"

type ActionPreview = BatchDropPreviewDto | WithdrawalFormPreviewDto

const css = (value: string | undefined) => value ?? ""

export function ManageRegistrationPage({ action }: { action: "drop" | "withdraw" }) {
  const { language, t, text } = useI18n()
  const queryClient = useQueryClient()
  const registrations = useQuery({ queryKey: ["registrations"], queryFn: getRegistrations })
  const me = useQuery({ queryKey: ["me"], queryFn: getMe })
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null)
  const [draftError, setDraftError] = useState(false)
  const [preview, setPreview] = useState<ActionPreview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [printableFormUrl, setPrintableFormUrl] = useState<string | null>(null)
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null)

  const active = useMemo(
    () =>
      registrations.data?.registrations.filter(
        (registration) => registration.status === "active",
      ) ?? [],
    [registrations.data],
  )
  const selected = active.filter((registration) =>
    selectedIds.includes(registration.registrationId),
  )
  const isDrop = action === "drop"
  const draftOwner = me.data?.studentId
  const draftTermId = registrations.data?.term?.id
  const draftKey = !isDrop && draftOwner && draftTermId ? `${draftOwner}:${draftTermId}` : null

  useEffect(() => {
    if (!draftKey || !draftOwner || !draftTermId || loadedDraftKey === draftKey) return
    try {
      const draft = readWithdrawalDraft(draftOwner, draftTermId)
      const activeIds = new Set(active.map((registration) => registration.registrationId))
      setSelectedIds(draft.selectedIds.filter((id) => activeIds.has(id)))
      setReasons(
        Object.fromEntries(
          Object.entries(draft.reasons).filter(([id]) => activeIds.has(Number(id))),
        ),
      )
      setDraftError(false)
    } catch {
      setDraftError(true)
    }
    setLoadedDraftKey(draftKey)
  }, [active, draftKey, draftOwner, draftTermId, loadedDraftKey])

  useEffect(() => {
    if (!draftKey || !draftOwner || !draftTermId || loadedDraftKey !== draftKey) return
    try {
      saveWithdrawalDraft(draftOwner, draftTermId, { selectedIds, reasons })
      setDraftError(false)
    } catch {
      setDraftError(true)
    }
  }, [draftKey, draftOwner, draftTermId, loadedDraftKey, selectedIds, reasons])
  const ActionIcon = isDrop ? CircleMinus : FileText
  const title = isDrop
    ? text({ th: "ลดรายวิชา", en: "Drop courses", zh: "退选课程" })
    : text({ th: "ถอนรายวิชา", en: "Withdraw courses", zh: "退课" })
  const description = isDrop
    ? text({
        th: "เลือกรายวิชาหนึ่งรายการหรือหลายรายการ แล้วลดพร้อมกันหลังยืนยันเพียงครั้งเดียว",
        en: "Select one or more courses, then drop them together with one confirmation.",
        zh: "选择一门或多门课程，并在一次确认后一起退选。",
      })
    : text({
        th: "เลือกรายวิชาหนึ่งรายการหรือหลายรายการ ระบุเหตุผลแต่ละรายวิชา แล้วพิมพ์คำร้องส่งคณะ",
        en: "Select one or more courses, give a reason for each, then print a form to submit to your faculty.",
        zh: "选择一门或多门课程，分别填写原因，然后打印表格交给学院。",
      })
  const consequence = isDrop
    ? text({
        th: "เมื่อยืนยัน ระบบจะลดทุกรายวิชาที่เลือกและคืนที่นั่งของตอนเรียนในระบบตัวอย่าง",
        en: "Confirmation drops every selected course and returns those demo seats.",
        zh: "确认后将退选全部所选课程，并归还演示班次名额。",
      })
    : text({
        th: "การสร้างแบบฟอร์มจะไม่เปลี่ยนสถานะลงทะเบียน ไม่คืนที่นั่ง และไม่ถือว่าอนุมัติการถอน",
        en: "Creating a form does not change enrollment, return seats, or approve a withdrawal.",
        zh: "生成表格不会改变选课状态、归还名额或批准退课。",
      })
  const courseName = (registration: { nameTh: string; nameEn: string }) =>
    language === "th"
      ? registration.nameTh || registration.nameEn
      : registration.nameEn || registration.nameTh
  const creditsLabel = (value: number) =>
    text({
      th: String(value) + " หน่วยกิต",
      en: String(value) + " credits",
      zh: String(value) + " 学分",
    })
  const selectedCountLabel = text({
    th: String(selected.length) + " รายวิชา",
    en: String(selected.length) + " courses",
    zh: String(selected.length) + " 门课程",
  })
  const allSelected = active.length > 0 && selected.length === active.length
  const partlySelected = selected.length > 0 && !allSelected

  useEffect(() => {
    return () => {
      if (printableFormUrl) URL.revokeObjectURL(printableFormUrl)
    }
  }, [printableFormUrl])

  const toggleSelection = (registrationId: number, selectedValue: boolean) => {
    setSelectedIds((current) =>
      selectedValue
        ? [...new Set([...current, registrationId])]
        : current.filter((id) => id !== registrationId),
    )
    setMessage(null)
  }

  const toggleAll = (selectedValue: boolean) => {
    setSelectedIds(selectedValue ? active.map((registration) => registration.registrationId) : [])
    setMessage(null)
  }

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (selected.length === 0) {
        throw new Error(
          text({
            th: "เลือกรายวิชาอย่างน้อยหนึ่งรายการ",
            en: "Select at least one course.",
            zh: "请至少选择一门课程。",
          }),
        )
      }
      if (isDrop)
        return previewBatchDrop(selected.map((registration) => registration.registrationId))
      return previewWithdrawalForm(
        selected.map((registration) => ({
          registrationId: registration.registrationId,
          reason: (reasons[registration.registrationId] ?? "").trim(),
        })),
      )
    },
    onSuccess(data) {
      setPreview(data)
    },
    onError(error) {
      toast.danger(
        text({
          th: "ตรวจสอบรายการไม่ได้",
          en: "Could not review selections",
          zh: "无法检查所选课程",
        }),
        { description: error instanceof Error ? error.message : undefined, timeout: 6_000 },
      )
    },
  })

  const dropMutation = useMutation({
    mutationFn: async () => {
      if (preview?.action !== "drop") {
        throw new Error(
          text({
            th: "ข้อมูลยืนยันไม่ครบ",
            en: "Confirmation details are incomplete.",
            zh: "确认信息不完整。",
          }),
        )
      }
      return confirmBatchDrop(preview.confirmationToken)
    },
    async onSuccess(data) {
      setPreview(null)
      setSelectedIds([])
      setReasons({})
      setMessage(
        text({
          th: "ลดรายวิชาที่เลือกแล้ว " + String(data.registrationIds.length) + " รายวิชา",
          en: "Dropped " + String(data.registrationIds.length) + " selected courses.",
          zh: "已退选 " + String(data.registrationIds.length) + " 门课程。",
        }),
      )
      toast.success(text({ th: "ลดรายวิชาแล้ว", en: "Courses dropped", zh: "课程已退选" }), {
        timeout: 4_500,
      })
      await queryClient.invalidateQueries({ queryKey: ["registrations"] })
    },
    onError(error) {
      toast.danger(text({ th: "ลดรายวิชาไม่ได้", en: "Could not drop courses", zh: "无法退选课程" }), {
        description: error instanceof Error ? error.message : undefined,
        timeout: 6_000,
      })
    },
  })

  const formMutation = useMutation({
    mutationFn: async () => {
      if (preview?.action !== "withdrawal-form") {
        throw new Error(
          text({
            th: "ข้อมูลคำร้องไม่ครบ",
            en: "Withdrawal details are incomplete.",
            zh: "退课信息不完整。",
          }),
        )
      }
      const blob = await createWithdrawalForm(preview.confirmationToken)
      return URL.createObjectURL(blob)
    },
    onSuccess(url) {
      setPrintableFormUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return url
      })
      setPreview(null)
      setMessage(
        text({
          th: "สร้างคำร้องแล้ว การลงทะเบียนของคุณยังคงเดิม โปรดพิมพ์และส่งคณะ",
          en: "The form is ready. Your enrollment is unchanged; print and submit it to your faculty.",
          zh: "表格已生成。您的选课状态未变；请打印后交给学院。",
        }),
      )
      toast.success(
        text({ th: "สร้างแบบฟอร์มแล้ว", en: "Printable form created", zh: "可打印表格已生成" }),
        {
          timeout: 4_500,
        },
      )
    },
    onError(error) {
      toast.danger(
        text({ th: "สร้างแบบฟอร์มไม่ได้", en: "Could not create form", zh: "无法生成表格" }),
        {
          description: error instanceof Error ? error.message : undefined,
          timeout: 6_000,
        },
      )
    },
  })

  const closeConfirmation = () => {
    setPreview(null)
    window.requestAnimationFrame(() => actionTriggerRef.current?.focus({ preventScroll: true }))
  }

  const submitSelection = (trigger: HTMLButtonElement) => {
    actionTriggerRef.current = trigger
    previewMutation.mutate()
  }

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBody}>
          <p className={pageStyles.context}>
            {text({
              th: "จัดการรายวิชาในภาคปัจจุบัน",
              en: "Manage courses in the current term",
              zh: "管理当前学期课程",
            })}
          </p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
      {!isDrop && loadedDraftKey === draftKey && draftKey && !draftError ? (
        <p className={pageStyles.muted}>
          {text({
            th: "บันทึกรายการที่เลือกและเหตุผลให้อัตโนมัติบนอุปกรณ์นี้",
            en: "Your selections and reasons are saved automatically on this device.",
            zh: "所选课程和原因会自动保存在此设备上。",
          })}
        </p>
      ) : null}
      {draftError ? (
        <Status tone="warning">
          {text({
            th: "เบราว์เซอร์บันทึกคำร้องฉบับร่างไม่ได้ โปรดพิมพ์ก่อนออกจากหน้านี้",
            en: "This browser could not save the draft. Print the form before leaving this page.",
            zh: "浏览器无法保存草稿。请在离开此页面前打印表格。",
          })}
        </Status>
      ) : null}

      {message ? (
        <Status tone="success">
          {message}
          {printableFormUrl ? (
            <span className={styles.printableLinks}>
              <a href={printableFormUrl} rel="noreferrer" target="_blank">
                <Printer aria-hidden="true" size={16} />
                {text({ th: "เปิดแบบฟอร์มเพื่อพิมพ์", en: "Open form to print", zh: "打开表格打印" })}
              </a>
              <a download="withdrawal-form.pdf" href={printableFormUrl}>
                {text({ th: "ดาวน์โหลด PDF", en: "Download PDF", zh: "下载 PDF" })}
              </a>
            </span>
          ) : null}
        </Status>
      ) : null}
      {registrations.isError ? (
        <Status tone="error">
          {text({
            th: "โหลดรายการลงทะเบียนไม่ได้ ลองรีเฟรชหน้าอีกครั้ง",
            en: "Could not load registrations. Refresh the page and try again.",
            zh: "无法加载选课记录。请刷新页面后重试。",
          })}
        </Status>
      ) : null}

      <section
        className={styles.managementForm}
        aria-labelledby="manageable-courses-heading"
        data-testid="management-form"
      >
        <header className={styles.formHeader}>
          <div>
            <h2 id="manageable-courses-heading">
              {text({
                th: "เลือกรายวิชาที่ดำเนินการ",
                en: "Select courses to manage",
                zh: "选择要处理的课程",
              })}
            </h2>
            <p>{consequence}</p>
          </div>
        </header>

        {active.length === 0 && !registrations.isPending ? (
          <div className={pageStyles.empty}>
            <CircleMinus aria-hidden="true" size={22} />
            <div>
              <h2>
                {text({ th: "ไม่มีรายวิชาที่ลงทะเบียนอยู่", en: "No active courses", zh: "没有已选课程" })}
              </h2>
              <p>
                {text({
                  th: "กลับไปหน้าลงทะเบียนเพื่อเพิ่มรายวิชาในภาคปัจจุบัน",
                  en: "Return to registration to add a course for the current term.",
                  zh: "返回选课页面，为当前学期添加课程。",
                })}
              </p>
            </div>
            <Link className={pageStyles.primaryAction} to="/register">
              <ArrowRight aria-hidden="true" size={17} />
              {text({ th: "เปิดหน้าลงทะเบียน", en: "Open registration", zh: "打开选课页面" })}
            </Link>
          </div>
        ) : null}
        {registrations.isPending ? (
          <p className={pageStyles.muted}>
            {text({ th: "กำลังโหลดรายการ", en: "Loading registrations", zh: "正在加载选课记录" })}
          </p>
        ) : null}
        {active.length > 0 ? (
          <>
            <div className={styles.managementTable} data-testid="management-table">
              <div className={styles.managementTableHeader}>
                <Checkbox
                  aria-label={text({
                    th: "เลือกทุกรายวิชา",
                    en: "Select all courses",
                    zh: "选择全部课程",
                  })}
                  className={css(styles.selectionCheckbox)}
                  isIndeterminate={partlySelected}
                  isSelected={allSelected}
                  onChange={toggleAll}
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
                <span>#</span>
                <span>{text({ th: "รายวิชา", en: "Course", zh: "课程" })}</span>
                <span>{text({ th: "ตอน", en: "Section", zh: "班次" })}</span>
                <span>{text({ th: "หน่วยกิต", en: "Credits", zh: "学分" })}</span>
                <span>
                  {isDrop
                    ? text({ th: "ผลหลังยืนยัน", en: "After confirmation", zh: "确认后" })
                    : text({ th: "เหตุผลการถอน", en: "Withdrawal reason", zh: "退课原因" })}
                </span>
              </div>
              {active.map((registration, index) => {
                const isSelected = selectedIds.includes(registration.registrationId)
                return (
                  <article
                    className={styles.managementRow}
                    data-selected={isSelected}
                    key={registration.registrationId}
                  >
                    <Checkbox
                      aria-label={text({
                        th: "เลือก " + registration.courseCode,
                        en: "Select " + registration.courseCode,
                        zh: "选择 " + registration.courseCode,
                      })}
                      className={css(styles.selectionCheckbox)}
                      isSelected={isSelected}
                      onChange={(value) => toggleSelection(registration.registrationId, value)}
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                    <span className={styles.rowIndex}>{index + 1}</span>
                    <div className={styles.managementCourse}>
                      <strong>{registration.courseCode}</strong>
                      <span>{courseName(registration)}</span>
                    </div>
                    <Chip color="accent" size="sm" variant="soft">
                      {text({ th: "ตอน ", en: "Section ", zh: "第 " })}
                      {registration.sectionNo}
                    </Chip>
                    <strong className={styles.rowCredit}>
                      {registration.credits}
                      <span className={styles.mobileCreditLabel}>
                        {text({ th: " หน่วยกิต", en: " credits", zh: " 学分" })}
                      </span>
                    </strong>
                    {isDrop ? (
                      <span className={styles.courseConsequence}>
                        {text({
                          th: "ลดแล้วคืนที่นั่งในระบบตัวอย่าง",
                          en: "Drops and returns the demo seat",
                          zh: "退选并归还演示名额",
                        })}
                      </span>
                    ) : (
                      <div className={styles.reasonCell}>
                        {isSelected ? (
                          <div>
                            <span>
                              {text({
                                th: "เหตุผลสำหรับ " + registration.courseCode,
                                en: "Reason for " + registration.courseCode,
                                zh: registration.courseCode + " 的原因",
                              })}
                            </span>
                            <TextArea
                              aria-label={text({
                                th: "เหตุผลถอน " + registration.courseCode,
                                en: "Withdrawal reason for " + registration.courseCode,
                                zh: registration.courseCode + " 的退课原因",
                              })}
                              className={css(styles.reasonInput)}
                              maxLength={1_000}
                              onChange={(event) =>
                                setReasons((current) => ({
                                  ...current,
                                  [registration.registrationId]: event.target.value,
                                }))
                              }
                              placeholder={text({
                                th: "ระบุเหตุผลการถอนรายวิชา",
                                en: "Explain why you are requesting withdrawal",
                                zh: "说明申请退课的原因",
                              })}
                              value={reasons[registration.registrationId] ?? ""}
                            />
                          </div>
                        ) : (
                          <span className={styles.reasonPlaceholder}>
                            {text({
                              th: "เลือกเพื่อระบุเหตุผล",
                              en: "Select this course to add a reason",
                              zh: "选择课程后填写原因",
                            })}
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>

            <div className={styles.selectionActions}>
              <span aria-live="polite">
                {selected.length > 0
                  ? text({
                      th: "เลือกแล้ว " + selectedCountLabel,
                      en: selectedCountLabel + " selected",
                      zh: "已选择 " + selectedCountLabel,
                    })
                  : text({
                      th: "ยังไม่ได้เลือกรายวิชา",
                      en: "No courses selected",
                      zh: "尚未选择课程",
                    })}
              </span>
              <Button
                disabled={selected.length === 0 || previewMutation.isPending}
                loading={previewMutation.isPending}
                onClick={(event) => submitSelection(event.currentTarget as HTMLButtonElement)}
                type="button"
                variant="primary"
              >
                <ActionIcon aria-hidden="true" size={17} />
                {isDrop
                  ? text({ th: "ลดรายวิชาที่เลือก", en: "Drop selected courses", zh: "退选所选课程" })
                  : text({
                      th: "ตรวจสอบคำร้องที่เลือก",
                      en: "Review selected request",
                      zh: "检查所选申请",
                    })}
              </Button>
            </div>
          </>
        ) : null}
      </section>

      <AlertDialog.Backdrop
        className={css(styles.overlay)}
        isDismissable={false}
        isKeyboardDismissDisabled={dropMutation.isPending || formMutation.isPending}
        isOpen={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open && !dropMutation.isPending && !formMutation.isPending) closeConfirmation()
        }}
      >
        <AlertDialog.Container className={css(styles.dialogContainer)} placement="center">
          <AlertDialog.Dialog
            aria-label={
              isDrop
                ? text({ th: "ยืนยันการลดรายวิชา", en: "Confirm course drop", zh: "确认退选课程" })
                : text({
                    th: "ยืนยันการสร้างคำร้องถอน",
                    en: "Confirm withdrawal form",
                    zh: "确认退课表格",
                  })
            }
            className={css(styles.dialog)}
          >
            <AlertDialog.Header className={css(styles.dialogHeader)}>
              <span className={styles.dialogIcon} data-action={action}>
                <ActionIcon aria-hidden="true" size={20} />
              </span>
              <div className={styles.dialogHeading}>
                <AlertDialog.Heading>
                  {isDrop
                    ? text({
                        th: "ยืนยันลด " + selectedCountLabel,
                        en: "Confirm drop for " + selectedCountLabel,
                        zh: "确认退选 " + selectedCountLabel,
                      })
                    : text({
                        th: "ยืนยันสร้างคำร้อง " + selectedCountLabel,
                        en: "Confirm form for " + selectedCountLabel,
                        zh: "确认生成 " + selectedCountLabel + " 表格",
                      })}
                </AlertDialog.Heading>
                <p>
                  {text({
                    th: "ตรวจสอบทุกรายวิชาก่อนดำเนินการ",
                    en: "Review every selected course before continuing.",
                    zh: "继续前请检查全部所选课程。",
                  })}
                </p>
              </div>
              <Button
                aria-label={t("common.close")}
                className={css(styles.closeButton)}
                onClick={closeConfirmation}
                type="button"
                variant="quiet"
              >
                <X aria-hidden="true" size={18} />
              </Button>
            </AlertDialog.Header>
            <AlertDialog.Body className={css(styles.dialogBody)}>
              <div className={styles.confirmationNote} data-action={action}>
                <ActionIcon aria-hidden="true" size={16} />
                <span>{consequence}</span>
              </div>
              <div className={styles.previewList}>
                {preview?.registrations.map((registration) => (
                  <article key={registration.registrationId}>
                    <div>
                      <strong>{registration.courseCode}</strong>
                      <span>{courseName(registration)}</span>
                      <small>
                        {text({ th: "ตอน ", en: "Section ", zh: "第 " })}
                        {registration.sectionNo} · {creditsLabel(registration.credits)}
                      </small>
                    </div>
                    {preview.action === "withdrawal-form" && "reason" in registration ? (
                      <p>
                        <span>{text({ th: "เหตุผล", en: "Reason", zh: "原因" })}</span>
                        {registration.reason}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </AlertDialog.Body>
            <AlertDialog.Footer className={css(styles.actions)}>
              <Button onClick={closeConfirmation} type="button" variant="quiet">
                {t("common.cancel")}
              </Button>
              {isDrop ? (
                <Button
                  loading={dropMutation.isPending}
                  onClick={() => dropMutation.mutate()}
                  type="button"
                  variant="primary"
                >
                  {text({
                    th: "ยืนยันลดรายวิชาที่เลือก",
                    en: "Confirm selected drop",
                    zh: "确认退选所选课程",
                  })}
                </Button>
              ) : (
                <Button
                  loading={formMutation.isPending}
                  onClick={() => formMutation.mutate()}
                  type="button"
                  variant="primary"
                >
                  <Printer aria-hidden="true" size={17} />
                  {text({
                    th: "สร้างแบบฟอร์มเพื่อพิมพ์",
                    en: "Create printable form",
                    zh: "生成可打印表格",
                  })}
                </Button>
              )}
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  )
}
