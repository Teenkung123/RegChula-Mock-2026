import {
  AlertDialog,
  Chip,
  ComboBox,
  ErrorMessage,
  Input,
  ListBox,
  ProgressBar,
  toast,
} from "@heroui/react"
import type {
  BatchRegistrationPreviewDto,
  BatchRegistrationPreviewItemDto,
  CourseSummaryDto,
  RuleIssueDto,
  SectionDto,
} from "@regchula/api/public-types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, ChevronDown, CirclePlus, Search, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router"
import type { CourseReferenceContext } from "../components/CourseReference"
import { isAdvisoryIssue, RegistrationWarnings } from "../components/RegistrationWarnings"
import { Button, SelectField, Status } from "../components/ui"
import { useI18n } from "../i18n"
import {
  ApiError,
  confirmBatchRegistration,
  getCourse,
  getCourses,
  getRegistrations,
  previewBatchRegistration,
} from "../lib/api"
import { courseLabel, courseSearchText } from "../lib/course-label"
import { useFavorites } from "../lib/personal-planning"
import { randomId } from "../lib/random-id"
import { MAX_REGISTRATION_CREDITS } from "../lib/registration-credits"
import { occupiedSeatCount, sectionSeatLabel } from "../lib/section-seats"
import pageStyles from "./pages.module.css"
import { RegistrationAccess } from "./RegistrationAccess"
import styles from "./RegistrationPage.module.css"

type SectionRelation = "only" | "to" | "or" | "T" | "G"

type DraftRow = {
  id: string
  query: string
  course: CourseSummaryDto | null
  sections: SectionDto[]
  sectionId: string
  relation: SectionRelation
  alternateSectionId: string
  errors: string[]
  loadingSections: boolean
}

type DeleteTarget = { id: string; label: string } | null

const relationValues: readonly SectionRelation[] = ["only", "to", "or", "T", "G"]
const css = (value: string | undefined) => value ?? ""

const issueMessage = (issue: RuleIssueDto): string => {
  const required = issue.details?.missingCourseCodes ?? issue.details?.requiredCourseCodes
  if (Array.isArray(required) && required.length)
    return issue.message + ": " + required.map(String).join(", ")
  const condition = issue.details?.prerequisiteText
  return typeof condition === "string" && condition.trim()
    ? issue.message + ": " + condition
    : issue.message
}

const newDraftRow = (): DraftRow => ({
  id: randomId(),
  query: "",
  course: null,
  sections: [],
  sectionId: "",
  relation: "only",
  alternateSectionId: "",
  errors: [],
  loadingSections: false,
})

const isSectionAvailable = (section: SectionDto) =>
  section.active && !section.closed && section.remainingSeats > 0

const rowSelection = (row: DraftRow) =>
  JSON.stringify([
    row.course?.courseCode,
    row.query,
    row.sectionId,
    row.relation,
    row.alternateSectionId,
  ])

const seatPercent = (section: SectionDto) =>
  section.capacity > 0 ? Math.round((occupiedSeatCount(section) / section.capacity) * 100) : 100

function SeatStatus({ section }: { section: SectionDto }) {
  const available = isSectionAvailable(section)
  return (
    <div className={styles.seatStatus}>
      <Chip color={available ? "success" : "danger"} size="sm" variant="soft">
        {available ? `เหลือ ${section.remainingSeats}` : "ไม่ว่าง"}
      </Chip>
      <ProgressBar
        aria-label={`จำนวนที่นั่งตอน ${section.sectionNo}`}
        className={css(styles.seatMeter)}
        maxValue={Math.max(section.capacity, 1)}
        value={occupiedSeatCount(section)}
      >
        <ProgressBar.Track>
          <ProgressBar.Fill style={{ width: `${seatPercent(section)}%` }} />
        </ProgressBar.Track>
      </ProgressBar>
    </div>
  )
}

function CourseLookup({
  lookup,
  loading,
  onFocus,
  onInputChange,
  onSelect,
  row,
}: {
  lookup: CourseSummaryDto[]
  loading: boolean
  onFocus: () => void
  onInputChange: (value: string) => void
  onSelect: (course: CourseSummaryDto) => void
  row: DraftRow
}) {
  const { courseName, language, text } = useI18n()
  return (
    <ComboBox
      allowsEmptyCollection
      aria-label={text({ th: "รหัสหรือชื่อรายวิชา", en: "Course code or title", zh: "课程代码或名称" })}
      defaultFilter={() => true}
      inputValue={row.query}
      menuTrigger="focus"
      onInputChange={onInputChange}
      onSelectionChange={(key) => {
        const course = lookup.find((item) => item.courseCode === String(key))
        if (course) onSelect(course)
      }}
      selectedKey={row.course?.courseCode ?? null}
    >
      <ComboBox.InputGroup className={css(styles.lookupControl)} data-inline-control="combobox">
        <Input
          onFocus={onFocus}
          aria-describedby={`registration-feedback-${row.id}`}
          aria-label={text({
            th: "รหัสหรือชื่อรายวิชา",
            en: "Course code or title",
            zh: "课程代码或名称",
          })}
          className={css(styles.lookupInput)}
          placeholder={text({
            th: "พิมพ์รหัส ชื่อไทย ชื่ออังกฤษ หรือชื่อย่อ",
            en: "Type a code, Thai or English name, or abbreviation",
            zh: "输入课程代码、泰文或英文名称、或缩写",
          })}
        />
        <ComboBox.Trigger
          aria-label={text({ th: "แสดงวิชาที่พบ", en: "Show matches", zh: "显示匹配课程" })}
        >
          <ChevronDown aria-hidden="true" size={16} />
        </ComboBox.Trigger>
      </ComboBox.InputGroup>
      <ComboBox.Popover className={css(styles.lookupPopover)} placement="bottom start">
        <ListBox
          className={css(styles.lookupList)}
          renderEmptyState={() =>
            text(
              loading
                ? { th: "กำลังค้นหารายวิชา", en: "Searching courses", zh: "正在搜索课程" }
                : { th: "ไม่พบรายวิชาที่ตรงกับคำค้น", en: "No matching courses", zh: "没有匹配的课程" },
            )
          }
        >
          {lookup.map((course) => (
            <ListBox.Item
              id={course.courseCode}
              key={course.courseCode}
              textValue={courseSearchText(course)}
            >
              <span className={styles.lookupCode}>{course.courseCode}</span>
              <span>
                <strong>{courseName(course)}</strong>
                <small>{language === "th" ? course.nameEn : course.nameTh}</small>
              </span>
              <small>{course.credits} หน่วยกิต</small>
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  )
}

function RowFeedback({
  row,
  localIssues,
  preview,
  checking,
  failed,
  courses,
  term,
}: CourseReferenceContext & {
  row: DraftRow
  localIssues: string[]
  preview: BatchRegistrationPreviewItemDto | undefined
  checking: boolean
  failed: boolean
}) {
  const { text } = useI18n()
  const messages = [
    ...new Set([
      ...localIssues,
      ...row.errors,
      ...(preview?.issues.filter((issue) => !isAdvisoryIssue(issue)).map(issueMessage) ?? []),
    ]),
  ]
  return (
    <div id={`registration-feedback-${row.id}`} className={styles.rowFeedback}>
      <div aria-live="polite">
        {checking ? (
          <small>
            {text({
              th: "กำลังตรวจสอบทั้งแบบร่าง",
              en: "Checking the whole draft…",
              zh: "正在检查整个草稿…",
            })}
          </small>
        ) : null}
        {failed ? (
          <small>
            {text({
              th: "ตรวจสอบไม่ได้ชั่วคราว ระบบจะลองอีกครั้งเมื่อบันทึก",
              en: "Check unavailable. Saving will retry the check.",
              zh: "暂时无法检查，保存时将重试。",
            })}
          </small>
        ) : null}
        {messages.map((message) => (
          <ErrorMessage key={message} className={css(styles.feedbackMessage)}>
            {message}
          </ErrorMessage>
        ))}
      </div>
      {row.course ? (
        <RegistrationWarnings
          courseCode={row.course.courseCode}
          prerequisiteText={row.course.prerequisiteText}
          issues={preview?.issues ?? []}
          courses={courses}
          term={term}
        />
      ) : null}
      {preview?.eligible && String(preview.section.id) !== row.sectionId ? (
        <small>
          {text({
            th: `ตอนแรกใช้ไม่ได้ ระบบเลือกตอนทางเลือก ${preview.section.sectionNo}`,
            en: `The first section is unavailable. Alternative section ${preview.section.sectionNo} is selected.`,
            zh: `首选班次不可用，已选择备选班次 ${preview.section.sectionNo}。`,
          })}
        </small>
      ) : null}
      {!checking && !failed && preview?.eligible && messages.length === 0 ? (
        <small className={styles.feedbackReady}>
          {text(
            preview.issues.some(isAdvisoryIssue)
              ? {
                  th: "ลงทะเบียนได้ แม้มีคำเตือน",
                  en: "You can register with these warnings",
                  zh: "可以带着这些提醒选课",
                }
              : { th: "ตรวจสอบแล้ว พร้อมบันทึก", en: "Checked; ready to save", zh: "已检查，可以保存" },
          )}
        </small>
      ) : null}
    </div>
  )
}

export function RegistrationPage() {
  return <RegistrationAccess>{() => <RegistrationEditor />}</RegistrationAccess>
}

function RegistrationEditor() {
  const { courseName, language, text } = useI18n()
  const queryClient = useQueryClient()
  const registrations = useQuery({ queryKey: ["registrations"], queryFn: getRegistrations })
  const favorites = useFavorites(registrations.data?.term?.id)
  const [rows, setRows] = useState<DraftRow[]>([newDraftRow()])
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const registrationsRef = useRef(registrations.data?.registrations)
  registrationsRef.current = registrations.data?.registrations
  const [lookupRowId, setLookupRowId] = useState<string | null>(null)
  const [lookupQuery, setLookupQuery] = useState("")
  const [debouncedLookup, setDebouncedLookup] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [review, setReview] = useState<BatchRegistrationPreviewDto | null>(null)
  const detailRequests = useRef(new Map<string, string>())
  const saveAttempt = useRef<{
    token: string
    key: string
    rows: DraftRow[]
    uncertain?: boolean
  } | null>(null)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedLookup(lookupQuery.trim()), 200)
    return () => window.clearTimeout(timeout)
  }, [lookupQuery])

  const lookup = useQuery({
    queryKey: ["registration-course-lookup", debouncedLookup],
    queryFn: ({ signal }) =>
      getCourses({ q: debouncedLookup, page: 1, pageSize: 8, mode: "autocomplete" }, signal),
    staleTime: 30_000,
  })
  const activeRegistrations =
    registrations.data?.registrations.filter((registration) => registration.status === "active") ??
    []
  const existingCourseCodes = new Set([
    ...activeRegistrations.map((registration) => registration.courseCode),
    ...rows.flatMap((row) => (row.course ? [row.course.courseCode] : [])),
  ])
  const favoritesToImport = (favorites.data ?? []).filter(
    (course) => course.offered && !existingCourseCodes.has(course.courseCode),
  )
  const existingFavorites = (favorites.data ?? []).filter(
    (course) => course.offered && existingCourseCodes.has(course.courseCode),
  )
  const unavailableFavorites = (favorites.data ?? []).filter((course) => !course.offered)
  const activeCredits = activeRegistrations.reduce(
    (total, registration) => total + registration.credits,
    0,
  )
  const draftCredits = rows.reduce((total, row) => total + (row.course ? row.course.credits : 0), 0)
  const totalCredits = activeCredits + draftCredits
  const hasChanges = rows.some((row) => row.query.trim() || row.course !== null)
  const previewRows = rows.filter(
    (row) =>
      row.course &&
      row.sectionId &&
      !row.loadingSections &&
      !((row.relation === "or" || row.relation === "to") && !row.alternateSectionId),
  )
  const choices = previewRows.map((row) => ({
    sectionId: Number(row.sectionId),
    ...((row.relation === "or" || row.relation === "to") && row.alternateSectionId
      ? { alternateSectionId: Number(row.alternateSectionId) }
      : {}),
  }))
  const livePreview = useQuery({
    queryKey: [
      "registration-live-preview",
      registrations.dataUpdatedAt,
      previewRows.map((row) => row.id),
      choices,
    ],
    enabled: choices.length > 0 && !saveOpen && !saveAttempt.current?.uncertain,
    queryFn: () => previewBatchRegistration(choices),
    retry: false,
    staleTime: 10_000,
  })

  const currentLookup = debouncedLookup === lookupQuery.trim() ? (lookup.data?.data ?? []) : []
  const rowIssues = (row: DraftRow): string[] => {
    if (!row.course && !row.query.trim()) return []
    if (!row.course)
      return [
        text({
          th: "เลือกรายวิชาที่ตรงกันจากรายการแนะนำ",
          en: "Choose a matching course from the suggestions",
          zh: "请从建议中选择匹配课程",
        }),
      ]
    const issues: string[] = []
    if (!row.loadingSections && row.sections.length > 0 && !row.sectionId)
      issues.push(text({ th: "กรุณาเลือกตอนเรียน", en: "Choose a section", zh: "请选择班次" }))
    if (!row.loadingSections && !row.sections.some(isSectionAvailable))
      issues.push(
        text({
          th: "ยังไม่มีตอนเรียนที่เปิดรับและมีที่นั่งว่าง",
          en: "No open sections have available seats",
          zh: "暂无开放且有空位的班次",
        }),
      )
    if ((row.relation === "to" || row.relation === "or") && !row.alternateSectionId)
      issues.push(
        text({
          th: "เลือกรายการตอนทางเลือกให้ครบ",
          en: "Choose the alternative section",
          zh: "请选择备选班次",
        }),
      )
    if (
      activeRegistrations.some(
        (registration) => registration.courseCode === row.course?.courseCode,
      ) ||
      rows.some(
        (other) => other.id !== row.id && other.course?.courseCode === row.course?.courseCode,
      )
    )
      issues.push(
        text({
          th: "มีรายวิชานี้ในรายการแล้ว",
          en: "This course is already in your list",
          zh: "该课程已在列表中",
        }),
      )
    if (totalCredits > MAX_REGISTRATION_CREDITS)
      issues.push(
        text({
          th: `หน่วยกิตรวมเกิน ${MAX_REGISTRATION_CREDITS} หน่วยกิต`,
          en: `Total credits exceed ${MAX_REGISTRATION_CREDITS}`,
          zh: `总学分超过${MAX_REGISTRATION_CREDITS}`,
        }),
      )
    return issues
  }
  const relationOptions = useMemo(
    () =>
      relationValues.map((value) => ({
        value,
        label:
          value === "only"
            ? text({ th: "เฉพาะ", en: "Only", zh: "仅此" })
            : value === "to"
              ? text({ th: "ถึง", en: "To", zh: "至" })
              : value === "or"
                ? text({ th: "หรือ", en: "Or", zh: "或" })
                : value,
      })),
    [text],
  )

  const updateRow = (id: string, update: (row: DraftRow) => DraftRow) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...update(row), errors: [] } : row)),
    )
  }

  const selectCourse = async (rowId: string, course: CourseSummaryDto) => {
    const requestId = randomId()
    detailRequests.current.set(rowId, requestId)
    updateRow(rowId, (row) => ({
      ...row,
      course,
      query: `${course.courseCode} · ${courseName(course)}`,
      sectionId: "",
      alternateSectionId: "",
      sections: [],
      errors: [],
      loadingSections: true,
    }))
    setLookupRowId(null)
    try {
      const detail = await getCourse(course.courseCode, {})
      if (detailRequests.current.get(rowId) !== requestId) return
      detailRequests.current.delete(rowId)
      updateRow(rowId, (row) =>
        row.course?.courseCode === course.courseCode
          ? {
              ...row,
              course: {
                ...row.course,
                shortName: detail.offering.shortName,
                prerequisiteText: detail.offering.prerequisiteText,
              },
              sections: detail.sections,
              loadingSections: false,
            }
          : row,
      )
    } catch (error) {
      if (detailRequests.current.get(rowId) !== requestId) return
      detailRequests.current.delete(rowId)
      setRows((current) =>
        current.map((row) =>
          row.id === rowId && row.course?.courseCode === course.courseCode
            ? {
                ...row,
                loadingSections: false,
                errors: [
                  text({
                    th: "โหลดตอนเรียนไม่ได้ กรุณาเลือกรายวิชาอีกครั้ง",
                    en: "Could not load sections. Choose the course again.",
                    zh: "无法加载班次，请重新选择课程。",
                  }),
                ],
              }
            : row,
        ),
      )
      toast.danger(
        text({ th: "โหลดตอนเรียนไม่ได้", en: "Could not load sections", zh: "无法加载班次" }),
        {
          description: error instanceof Error ? error.message : undefined,
          timeout: 5_000,
        },
      )
    }
  }

  const importPlan = useMutation({
    mutationFn: async () => {
      const term = registrations.data?.term
      if (!term || !favorites.data) throw new Error("The favorites list is unavailable")
      const offered = favoritesToImport
      const results = await Promise.allSettled(
        offered.map((course) =>
          getCourse(course.courseCode, {
            academicYear: term.academicYear,
            semester: term.semester,
          }),
        ),
      )
      return {
        details: results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
        unavailable: [
          ...favorites.data.filter((course) => !course.offered).map((course) => course.courseCode),
          ...offered.flatMap((course, index) =>
            results[index]?.status === "rejected" ? [course.courseCode] : [],
          ),
        ],
      }
    },
    onSuccess({ details, unavailable }) {
      const existing = new Set([
        ...rowsRef.current.flatMap((row) => (row.course ? [row.course.courseCode] : [])),
        ...(registrationsRef.current ?? [])
          .filter((item) => item.status === "active")
          .map((item) => item.courseCode),
      ])
      const additions = details
        .filter((detail) => !existing.has(detail.offering.courseCode))
        .map((detail) => ({
          ...newDraftRow(),
          course: detail.offering,
          query: `${detail.offering.courseCode} · ${courseName(detail.offering)}`,
          sections: detail.sections,
        }))
      if (additions.length) {
        setRows((current) => [
          ...current.filter((row) => row.course || row.query.trim()),
          ...additions,
        ])
      }
      const description = unavailable.length
        ? text({
            th: `นำเข้าไม่ได้: ${unavailable.join(", ")}`,
            en: `Could not import: ${unavailable.join(", ")}`,
            zh: `无法导入：${unavailable.join(", ")}`,
          })
        : text({
            th: "เลือกตอนเรียนและบันทึกเมื่อพร้อม",
            en: "Choose sections and save when ready.",
            zh: "请选择班次，准备好后保存。",
          })
      toast[unavailable.length ? "danger" : "success"](
        text({
          th: `นำเข้า ${additions.length} รายวิชา`,
          en: `Imported ${additions.length} courses`,
          zh: `已导入 ${additions.length} 门课程`,
        }),
        { description, timeout: 6_000 },
      )
    },
    onError(error) {
      toast.danger(
        text({ th: "นำเข้ารายการไม่ได้", en: "Could not import course list", zh: "无法导入课程列表" }),
        {
          description: error instanceof Error ? error.message : undefined,
          timeout: 6_000,
        },
      )
    },
  })

  const applyRowErrors = (next: Map<string, string[]>) => {
    setRows((current) => current.map((row) => ({ ...row, errors: next.get(row.id) ?? [] })))
  }

  const prepareMutation = useMutation({
    mutationFn: async () => {
      const errors = new Map<string, string[]>()
      let hasBlockingError = false
      const pendingRows: DraftRow[] = []
      for (const row of rows) {
        if (!row.course && !row.query.trim()) continue
        const currentIssues = rowIssues(row)
        if (row.loadingSections || currentIssues.length) {
          hasBlockingError = true
          errors.set(
            row.id,
            currentIssues.length
              ? currentIssues
              : [
                  text({
                    th: "รอโหลดตอนเรียนให้เสร็จ",
                    en: "Wait for sections to load",
                    zh: "请等待班次加载",
                  }),
                ],
          )
          continue
        }
        if (!row.course) {
          hasBlockingError = true
          errors.set(row.id, [
            text({
              th: "เลือกรายวิชาจากรายการแนะนำ",
              en: "Choose a suggested course",
              zh: "请从建议列表选择课程",
            }),
          ])
          continue
        }
        if (!row.sectionId) {
          hasBlockingError = true
          errors.set(row.id, [
            text({ th: "เลือกตอนเรียน", en: "Choose a section", zh: "请选择班次" }),
          ])
          continue
        }
        pendingRows.push(row)
      }
      applyRowErrors(errors)
      if (hasBlockingError) {
        throw new Error(
          text({
            th: "แก้ไขข้อผิดพลาดก่อนบันทึก",
            en: "Resolve blocking errors before saving",
            zh: "请先解决阻止保存的问题",
          }),
        )
      }

      const preview = await previewBatchRegistration(
        pendingRows.map((row) => ({
          sectionId: Number(row.sectionId),
          ...((row.relation === "or" || row.relation === "to") && row.alternateSectionId
            ? { alternateSectionId: Number(row.alternateSectionId) }
            : {}),
        })),
      )
      for (const item of preview.items) {
        const row = pendingRows[item.requestIndex]
        if (row)
          errors.set(
            row.id,
            item.issues.filter((issue) => !isAdvisoryIssue(issue)).map(issueMessage),
          )
      }
      applyRowErrors(errors)
      return preview
    },
    onSuccess(preview) {
      saveAttempt.current = preview.confirmationToken
        ? {
            token: preview.confirmationToken,
            key: randomId(),
            rows: rows.filter((row) => row.course && row.sectionId),
          }
        : null
      setReview(preview)
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!review?.eligible || !review.confirmationToken)
        throw new Error(
          text({
            th: "ตรวจสอบรายการอีกครั้งก่อนบันทึก",
            en: "Review the draft again before saving",
            zh: "保存前请重新检查草稿",
          }),
        )
      const attempt = saveAttempt.current
      if (!attempt || attempt.token !== review.confirmationToken)
        throw new Error(
          text({
            th: "ตรวจสอบรายการอีกครั้ง",
            en: "Review the draft again",
            zh: "请重新检查草稿",
          }),
        )
      const result = await confirmBatchRegistration(attempt.token, attempt.key)
      return result.registrations.length
    },
    async onSuccess(count) {
      const submitted = new Map(saveAttempt.current?.rows.map((row) => [row.id, rowSelection(row)]))
      setSaveOpen(false)
      setReview(null)
      saveAttempt.current = null
      setRows((current) => {
        const remaining = current.filter((row) => submitted.get(row.id) !== rowSelection(row))
        return remaining.length ? remaining : [newDraftRow()]
      })
      await queryClient.invalidateQueries({ queryKey: ["registrations"] })
      toast.success(
        text({ th: "บันทึกรายการแล้ว", en: "Registration draft saved", zh: "选课草稿已保存" }),
        {
          description: text({
            th: `ดำเนินการ ${count} รายการ`,
            en: `${count} changes applied`,
            zh: `已应用 ${count} 项更改`,
          }),
          timeout: 4_500,
        },
      )
    },
    async onError(error) {
      if (error instanceof ApiError && error.status < 500) {
        setReview(null)
        saveAttempt.current = null
      } else if (saveAttempt.current) {
        saveAttempt.current.uncertain = true
      }
      await queryClient.invalidateQueries({ queryKey: ["registrations"] })
      toast.danger(
        text({
          th: "บันทึกรายการไม่ได้",
          en: "Could not save registration draft",
          zh: "无法保存选课草稿",
        }),
        {
          description: error instanceof Error ? error.message : undefined,
          timeout: 6_000,
        },
      )
    },
  })

  const openReview = () => {
    if (saveAttempt.current && review && saveMutation.isError) {
      setSaveOpen(true)
      return
    }
    setReview(null)
    saveAttempt.current = null
    saveMutation.reset()
    setSaveOpen(true)
    prepareMutation.mutate()
  }

  const selectedSection = (row: DraftRow) =>
    row.sections.find((section) => String(section.id) === row.sectionId) ?? null
  const sectionOptions = (row: DraftRow) =>
    row.sections.map((section) => ({
      value: String(section.id),
      label: sectionSeatLabel(section),
      disabled: !isSectionAvailable(section),
    }))

  const removeTarget = () => {
    if (!deleteTarget) return
    detailRequests.current.delete(deleteTarget.id)
    setRows((current) => current.filter((row) => row.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  return (
    <div className={styles.workspace}>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBody}>
          <p className={pageStyles.context}>
            {text({ th: "ภาคปัจจุบัน", en: "Current term", zh: "当前学期" })}
          </p>
          <h1>
            {text({ th: "แก้ไขรายการลงทะเบียน", en: "Edit registration draft", zh: "编辑选课草稿" })}
          </h1>
          <p>
            {text({
              th: "เพิ่มรายวิชาจากช่องเติมอัตโนมัติ เลือกตอนเรียน แล้วบันทึกการแก้ไขพร้อมกัน",
              en: "Add courses from autocomplete, choose sections, then save the whole draft together.",
              zh: "通过自动完成添加课程、选择班次，然后一起保存草稿。",
            })}
          </p>
        </div>
        <Link className={styles.searchLink} to="/search">
          <Search aria-hidden="true" size={16} />
          {text({ th: "ไปค้นหารายวิชา", en: "Open course search", zh: "打开课程搜索" })}
        </Link>
      </header>

      <section
        className={styles.creditPanel}
        aria-label={text({ th: "สรุปหน่วยกิต", en: "Credit summary", zh: "学分摘要" })}
      >
        <div>
          <span>{text({ th: "หน่วยกิตหลังบันทึก", en: "Credits after save", zh: "保存后的学分" })}</span>
          <strong>
            {totalCredits}/{MAX_REGISTRATION_CREDITS}
          </strong>
          <small>
            {text({ th: "คำนวณอัตโนมัติ", en: "Calculated automatically", zh: "自动计算" })}
          </small>
        </div>
        <ProgressBar
          aria-label={text({ th: "หน่วยกิต", en: "Credits", zh: "学分" })}
          className={css(styles.creditMeter)}
          maxValue={MAX_REGISTRATION_CREDITS}
          value={Math.min(totalCredits, MAX_REGISTRATION_CREDITS)}
        >
          <ProgressBar.Track>
            <ProgressBar.Fill
              style={{
                width: `${Math.min(100, (totalCredits / MAX_REGISTRATION_CREDITS) * 100)}%`,
              }}
            />
          </ProgressBar.Track>
        </ProgressBar>
      </section>

      {registrations.isError ? (
        <Status tone="error">
          {text({
            th: "โหลดรายการเดิมไม่ได้",
            en: "Could not load current registrations",
            zh: "无法加载当前选课",
          })}
        </Status>
      ) : null}
      {favorites.isError ? (
        <Status tone="error">
          {text({
            th: "โหลดรายวิชาที่ชื่นชอบไม่ได้",
            en: "Could not load your favorite courses",
            zh: "无法加载收藏课程",
          })}{" "}
          <Button onClick={() => void favorites.refetch()} type="button" variant="quiet">
            {text({ th: "ลองอีกครั้ง", en: "Try again", zh: "重试" })}
          </Button>
        </Status>
      ) : null}

      <div className={styles.courseToolbar}>
        <h2>{text({ th: "รายการรายวิชา", en: "Courses", zh: "课程" })}</h2>
        <div className={styles.courseActions}>
          <Button
            disabled={!registrations.isSuccess || !favorites.data?.length || importPlan.isPending}
            loading={importPlan.isPending}
            onClick={() => setImportOpen(true)}
            type="button"
            variant="outline"
          >
            {text({ th: "นำเข้ารายวิชาที่ชื่นชอบ", en: "Import favorites", zh: "导入收藏课程" })}
          </Button>
          <Button
            onClick={() => setRows((current) => [...current, newDraftRow()])}
            type="button"
            variant="outline"
          >
            <CirclePlus aria-hidden="true" size={17} />
            {text({ th: "เพิ่มรายวิชา", en: "Add course", zh: "添加课程" })}
          </Button>
        </div>
      </div>

      <section
        className={styles.repeater}
        data-testid="registration-repeater"
        aria-label={text({ th: "รายการรายวิชา", en: "Course rows", zh: "课程行" })}
      >
        <div className={styles.tableHeader} data-testid="registration-table-header">
          <span>#</span>
          <span>{text({ th: "รหัส / รายวิชา", en: "Course", zh: "课程" })}</span>
          <span>{text({ th: "ตอนเรียน", en: "Section", zh: "班次" })}</span>
          <span>{text({ th: "รูปแบบ", en: "Mode", zh: "方式" })}</span>
          <span>{text({ th: "หน่วยกิต", en: "Credits", zh: "学分" })}</span>
          <span>{text({ th: "การทำงาน", en: "Action", zh: "操作" })}</span>
        </div>

        {activeRegistrations.map((registration, index) => (
          <article
            className={styles.row}
            data-existing="true"
            data-testid="registration-active-row"
            key={registration.registrationId}
          >
            <span className={styles.index}>{index + 1}</span>
            <div className={styles.courseReadOnly}>
              <strong>{registration.courseCode}</strong>
              <span>
                {language === "th"
                  ? registration.nameTh || registration.nameEn
                  : registration.nameEn || registration.nameTh}
              </span>
              <small>{text({ th: "ลงทะเบียนแล้ว", en: "Already registered", zh: "已选课程" })}</small>
            </div>
            <div className={styles.sectionReadOnly}>
              <span className={styles.mobileLabel}>
                {text({ th: "ตอนเรียน", en: "Section", zh: "班次" })}
              </span>
              <Chip color="accent" size="sm" variant="soft">
                {registration.sectionNo}
              </Chip>
            </div>
            <div className={styles.relationReadOnly}>
              <span className={styles.mobileLabel}>
                {text({ th: "รูปแบบ", en: "Mode", zh: "方式" })}
              </span>
              <span>{text({ th: "เฉพาะ", en: "Only", zh: "仅此" })}</span>
            </div>
            <div className={styles.credit}>
              <span className={styles.mobileLabel}>
                {text({ th: "หน่วยกิต", en: "Credits", zh: "学分" })}
              </span>
              <strong>{registration.credits}</strong>
            </div>
          </article>
        ))}

        {rows.map((row, offset) => {
          const currentSection = selectedSection(row)
          const showAlternate = row.relation === "to" || row.relation === "or"
          return (
            <article className={styles.row} data-testid="registration-draft-row" key={row.id}>
              <span className={styles.index}>
                {activeRegistrations.length + offset + 1}
                <span className={styles.mobileLabel}>
                  {text({ th: "แบบร่าง", en: "Draft", zh: "草稿" })}
                </span>
              </span>
              <div className={styles.courseCell}>
                <CourseLookup
                  lookup={lookupRowId === row.id ? currentLookup : []}
                  loading={lookup.isFetching}
                  onFocus={() => {
                    setLookupRowId(row.id)
                    setLookupQuery(row.course?.courseCode ?? row.query)
                  }}
                  onInputChange={(value) => {
                    if (row.course && !value.startsWith(row.course.courseCode))
                      detailRequests.current.delete(row.id)
                    setLookupRowId(row.id)
                    setLookupQuery(value)
                    updateRow(row.id, (current) => ({
                      ...current,
                      query: value,
                      ...(current.course && !value.startsWith(current.course.courseCode)
                        ? {
                            course: null,
                            sections: [],
                            sectionId: "",
                            alternateSectionId: "",
                            loadingSections: false,
                          }
                        : {}),
                    }))
                  }}
                  onSelect={(course) => void selectCourse(row.id, course)}
                  row={row}
                />
              </div>
              <div className={styles.sectionCell}>
                <SelectField
                  disabled={!row.course || row.sections.length === 0}
                  label={text({ th: "ตอน", en: "Section", zh: "班次" })}
                  onValueChange={(value) =>
                    updateRow(row.id, (current) => ({ ...current, sectionId: value }))
                  }
                  options={[
                    { value: "", label: text({ th: "เลือกตอน", en: "Choose", zh: "选择" }) },
                    ...sectionOptions(row),
                  ]}
                  value={row.sectionId}
                />
                {currentSection ? <SeatStatus section={currentSection} /> : null}
              </div>
              <div className={styles.relationCell}>
                <SelectField
                  label={text({ th: "รูปแบบ", en: "Mode", zh: "方式" })}
                  onValueChange={(value) =>
                    updateRow(row.id, (current) => ({
                      ...current,
                      relation: value as SectionRelation,
                      alternateSectionId:
                        value === "to" || value === "or" ? current.alternateSectionId : "",
                    }))
                  }
                  options={relationOptions}
                  value={row.relation}
                />
                {showAlternate ? (
                  <>
                    <SelectField
                      disabled={!row.course || row.sections.length === 0}
                      label={
                        row.relation === "or"
                          ? text({ th: "ตอนทางเลือก", en: "Alternative", zh: "备选班次" })
                          : text({ th: "ถึงตอน", en: "To section", zh: "至班次" })
                      }
                      onValueChange={(value) =>
                        updateRow(row.id, (current) => ({ ...current, alternateSectionId: value }))
                      }
                      options={[
                        { value: "", label: text({ th: "ไม่เลือก", en: "None", zh: "不选择" }) },
                        ...sectionOptions(row),
                      ]}
                      value={row.alternateSectionId}
                    />
                    <small className={styles.alternateHint}>
                      {text({
                        th: "ระบบจะลองตอนนี้เมื่อตอนแรกใช้ไม่ได้",
                        en: "Used only when the first section is unavailable.",
                        zh: "仅在首选班次不可用时使用。",
                      })}
                    </small>
                  </>
                ) : null}
              </div>
              <div className={styles.credit}>
                <span className={styles.mobileLabel}>
                  {text({ th: "หน่วยกิต", en: "Credits", zh: "学分" })}
                </span>
                <strong>{row.course?.credits ?? "—"}</strong>
              </div>
              <Button
                aria-label={text({ th: "ลบแถว", en: "Remove row", zh: "删除行" })}
                className={css(styles.deleteButton)}
                isIconOnly
                onClick={() =>
                  setDeleteTarget({
                    id: row.id,
                    label: row.course
                      ? courseLabel(row.course, language)
                      : text({ th: "แถวใหม่", en: "new row", zh: "新行" }),
                  })
                }
                type="button"
                variant="quiet"
              >
                <Trash2 aria-hidden="true" size={16} />
              </Button>
              <RowFeedback
                row={row}
                courses={[
                  ...activeRegistrations,
                  ...rows.flatMap((draft) => (draft.course ? [draft.course] : [])),
                ]}
                term={registrations.data?.term}
                localIssues={rowIssues(row)}
                preview={livePreview.data?.items.find(
                  (item) => previewRows[item.requestIndex]?.id === row.id,
                )}
                checking={row.loadingSections || (Boolean(row.sectionId) && livePreview.isFetching)}
                failed={Boolean(row.sectionId) && livePreview.isError}
              />
            </article>
          )
        })}
      </section>

      <div className={styles.actions}>
        <Button
          disabled={
            (!hasChanges && !saveAttempt.current) || saveMutation.isPending || importPlan.isPending
          }
          loading={saveMutation.isPending}
          onClick={openReview}
          type="button"
          variant="primary"
        >
          <Check aria-hidden="true" size={17} />
          {text(
            saveMutation.isError && review
              ? { th: "ตรวจสอบการบันทึกค้างอยู่", en: "Review pending save", zh: "检查待确认的保存" }
              : { th: "บันทึกการแก้ไข", en: "Save changes", zh: "保存更改" },
          )}
        </Button>
      </div>

      <AlertDialog.Backdrop
        className={css(styles.dialogBackdrop)}
        isDismissable={false}
        isOpen={importOpen}
        onOpenChange={setImportOpen}
      >
        <AlertDialog.Container className={css(styles.dialogContainer)} placement="center">
          <AlertDialog.Dialog
            aria-label={text({
              th: "นำเข้ารายวิชาที่ชื่นชอบ",
              en: "Import favorites",
              zh: "导入收藏课程",
            })}
          >
            <AlertDialog.Header>
              <AlertDialog.Heading>
                {text({
                  th: "นำเข้ารายวิชาที่ชื่นชอบ?",
                  en: "Import favorite courses?",
                  zh: "导入收藏课程？",
                })}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                {text({
                  th: "เพิ่มรายวิชาที่เปิดสอนในภาคปัจจุบันลงในรายการ โดยยังไม่ลงทะเบียน เลือกตอนเรียนและบันทึกเมื่อพร้อม",
                  en: "Add courses offered this term to your draft. Choose sections and save when ready.",
                  zh: "将本学期开设的课程加入草稿。请选择班次，准备好后保存。",
                })}
              </p>
              <div className={styles.importGroups}>
                {[
                  {
                    id: "import-courses",
                    label: text({ th: "รายการที่จะนำเข้า", en: "To import", zh: "将导入" }),
                    courses: favoritesToImport,
                  },
                  ...(existingFavorites.length
                    ? [
                        {
                          id: "existing-courses",
                          label: text({
                            th: "มีในรายการแล้ว",
                            en: "Already in your list",
                            zh: "已在列表中",
                          }),
                          courses: existingFavorites,
                        },
                      ]
                    : []),
                  {
                    id: "unavailable-courses",
                    label: text({
                      th: "ไม่เปิดสอนภาคนี้",
                      en: "Not offered this term",
                      zh: "本学期未开课",
                    }),
                    courses: unavailableFavorites,
                  },
                ].map((group) => (
                  <section key={group.id} aria-labelledby={group.id} className={styles.importGroup}>
                    <h3 id={group.id}>{group.label}</h3>
                    {group.courses.length ? (
                      <ul>
                        {group.courses.map((course) => {
                          const name = courseName({
                            nameTh: course.nameTh ?? "",
                            nameEn: course.nameEn ?? "",
                          })
                          return (
                            <li key={course.courseCode}>
                              <strong>{course.courseCode}</strong>
                              {name ? ` · ${name}` : ""}
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p>{text({ th: "ไม่มี", en: "None", zh: "无" })}</p>
                    )}
                  </section>
                ))}
              </div>
            </AlertDialog.Body>
            <AlertDialog.Footer className={styles.dialogActions}>
              <Button onClick={() => setImportOpen(false)} type="button" variant="quiet">
                {text({ th: "ยกเลิก", en: "Cancel", zh: "取消" })}
              </Button>
              <Button
                disabled={!favoritesToImport.length}
                onClick={() => {
                  setImportOpen(false)
                  importPlan.mutate()
                }}
                type="button"
                variant="primary"
              >
                {text({ th: "นำเข้า", en: "Import", zh: "导入" })}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      <AlertDialog.Backdrop
        className={css(styles.dialogBackdrop)}
        isDismissable={false}
        isKeyboardDismissDisabled={saveMutation.isPending}
        isOpen={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialog.Container className={css(styles.dialogContainer)} placement="center">
          <AlertDialog.Dialog
            aria-label={text({ th: "ยืนยันการลบ", en: "Confirm removal", zh: "确认删除" })}
          >
            <AlertDialog.Header>
              <AlertDialog.Heading>
                {text({ th: "ลบจากรายการ", en: "Remove from draft", zh: "从草稿删除" })}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>{deleteTarget?.label}</p>
            </AlertDialog.Body>
            <AlertDialog.Footer className={styles.dialogActions}>
              <Button onClick={() => setDeleteTarget(null)} type="button" variant="quiet">
                {text({ th: "ยกเลิก", en: "Cancel", zh: "取消" })}
              </Button>
              <Button onClick={removeTarget} type="button" variant="primary">
                {text({ th: "ลบ", en: "Remove", zh: "删除" })}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      <AlertDialog.Backdrop
        className={css(styles.dialogBackdrop)}
        isDismissable={false}
        isKeyboardDismissDisabled={saveMutation.isPending || prepareMutation.isPending}
        isOpen={saveOpen}
        onOpenChange={setSaveOpen}
      >
        <AlertDialog.Container className={css(styles.dialogContainer)} placement="center">
          <AlertDialog.Dialog
            aria-label={text({ th: "ยืนยันการบันทึก", en: "Confirm save", zh: "确认保存" })}
          >
            <AlertDialog.Header>
              <AlertDialog.Heading>
                {text({ th: "ยืนยันการบันทึก", en: "Confirm save", zh: "确认保存" })}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <div className={styles.reviewBody} aria-busy={prepareMutation.isPending}>
                <p>
                  {text({
                    th: "เงื่อนไขรายวิชาและเวลาทับซ้อนเป็นคำเตือนเท่านั้น คุณตัดสินใจลงทะเบียนได้และรับผิดชอบตรวจสอบความเหมาะสมด้วยตนเอง",
                    en: "Course requirements and time conflicts are warnings. You can proceed and are responsible for checking that your choices work for you.",
                    zh: "课程要求和时间冲突仅作提醒。你可以继续选课，并自行负责确认安排是否合适。",
                  })}
                </p>
                {prepareMutation.isPending ? (
                  <Status>
                    {text({
                      th: "กำลังตรวจสอบรายการล่าสุด…",
                      en: "Checking the latest draft…",
                      zh: "正在检查最新草稿…",
                    })}
                  </Status>
                ) : null}
                {prepareMutation.isError ? (
                  <Status tone="error">{prepareMutation.error.message}</Status>
                ) : null}
                {saveMutation.isError ? (
                  <Status tone="error">{saveMutation.error.message}</Status>
                ) : null}
                {saveMutation.isError && review ? (
                  <p>
                    {text({
                      th: "ยังยืนยันผลการบันทึกไม่ได้ ลองบันทึกอีกครั้งด้วยรายการเดิมได้อย่างปลอดภัย ระบบจะไม่เพิ่มรายการซ้ำ",
                      en: "The save outcome is unconfirmed. Retry this same save safely; it will not add duplicate registrations.",
                      zh: "保存结果尚未确认。可以安全重试同一次保存，不会重复选课。",
                    })}
                  </p>
                ) : null}
                {review?.items.map((item) => (
                  <section className={styles.reviewCourse} key={item.requestIndex}>
                    <strong>
                      {item.course.courseCode} · {courseName(item.course)}
                    </strong>
                    <span>
                      {text({ th: "ตอนเรียน", en: "Section", zh: "班次" })} {item.section.sectionNo}{" "}
                      · {item.course.credits} {text({ th: "หน่วยกิต", en: "credits", zh: "学分" })}
                    </span>
                    {item.issues
                      .filter((issue) => !isAdvisoryIssue(issue))
                      .map((issue) => (
                        <Status key={issue.code} tone="error">
                          {issueMessage(issue)}
                        </Status>
                      ))}
                    <RegistrationWarnings
                      courseCode={item.course.courseCode}
                      courses={[
                        ...activeRegistrations,
                        ...(saveAttempt.current?.rows ?? rows).flatMap((draft) =>
                          draft.course ? [draft.course] : [],
                        ),
                      ]}
                      term={registrations.data?.term}
                      issues={item.issues}
                      prerequisiteText={
                        (saveAttempt.current?.rows ?? rows).find(
                          (row) => row.course?.courseCode === item.course.courseCode,
                        )?.course?.prerequisiteText
                      }
                      defaultExpanded
                    />
                  </section>
                ))}
                {review && !review.eligible ? (
                  <Status tone="error">
                    {text({
                      th: "แก้ไขข้อผิดพลาดเรื่องตอนเรียน รายวิชาซ้ำ หรือหน่วยกิตก่อนบันทึก คำเตือนไม่ได้ขัดขวางการลงทะเบียน",
                      en: "Resolve section, duplicate-course, or credit errors before saving. Warnings do not prevent registration.",
                      zh: "请先解决班次、重复课程或学分错误。提醒不会阻止选课。",
                    })}
                  </Status>
                ) : null}
              </div>
            </AlertDialog.Body>
            <AlertDialog.Footer className={styles.dialogActions}>
              <Button
                disabled={saveMutation.isPending || prepareMutation.isPending}
                onClick={() => setSaveOpen(false)}
                type="button"
                variant="quiet"
              >
                {text({ th: "กลับไปแก้ไข", en: "Keep editing", zh: "继续编辑" })}
              </Button>
              <Button
                disabled={
                  prepareMutation.isPending ||
                  (review !== null && (!review.eligible || !review.confirmationToken))
                }
                loading={saveMutation.isPending}
                onClick={() => {
                  if (review?.confirmationToken) saveMutation.mutate()
                  else {
                    saveMutation.reset()
                    prepareMutation.mutate()
                  }
                }}
                type="button"
                variant="primary"
              >
                {text(
                  review === null
                    ? { th: "ตรวจสอบอีกครั้ง", en: "Retry check", zh: "重新检查" }
                    : saveMutation.isError
                      ? { th: "ลองบันทึกอีกครั้ง", en: "Retry save", zh: "重试保存" }
                      : review.items.some((item) => item.issues.some(isAdvisoryIssue))
                        ? { th: "บันทึกแม้มีคำเตือน", en: "Save anyway", zh: "仍然保存" }
                        : { th: "บันทึก", en: "Save", zh: "保存" },
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  )
}
