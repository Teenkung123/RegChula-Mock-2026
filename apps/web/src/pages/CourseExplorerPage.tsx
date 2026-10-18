import { CourseSectionCard } from "../components/CourseSectionCard"
import { CourseFavorites, FavoriteButton } from "../components/CourseFavorites"
import { useFavorites } from "../lib/personal-planning"
import { PageLoading } from "../components/PageLoading"
import {
  Accordion,
  Autocomplete,
  Chip,
  Drawer,
  Label,
  ListBox,
  Modal,
  Popover,
  SearchField,
  Select,
  TimeField,
  useFilter,
} from "@heroui/react"
import type { CourseSummaryDto, TermDto } from "@regchula/api/public-types"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, Clock3, Search, SlidersHorizontal, Star, X } from "lucide-react"
import { Time } from "@internationalized/date"
import {
  createElement,
  useCallback,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useSearchParams } from "react-router"
import { useAppearance } from "../appearance/AppearanceProvider"
import { useI18n, type AppLanguage } from "../i18n"
import { Button, Status } from "../components/ui"
import { RegistrationWarnings } from "../components/RegistrationWarnings"
import {
  type CourseQuery,
  getCatalogOptions,
  getCourse,
  getCourseReviews,
  getCourses,
  getTerms,
} from "../lib/api"
import { termLabel } from "../lib/term-label"
import styles from "./CourseExplorer.module.css"
import termStyles from "./CourseExplorerPage.module.css"
import pageStyles from "./pages.module.css"

const css = (value: string | undefined) => value ?? ""

const dayOrder = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const
const filterDayLabels: Record<AppLanguage, Record<(typeof dayOrder)[number], string>> = {
  th: { MO: "จ", TU: "อ", WE: "พ", TH: "พฤ", FR: "ศ", SA: "ส", SU: "อา" },
  en: { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" },
  zh: { MO: "一", TU: "二", WE: "三", TH: "四", FR: "五", SA: "六", SU: "日" },
}

function safeReviewHtml(source: string): ReactNode[] {
  const content = source.trim()
  if (!content) return []
  const document = new DOMParser().parseFromString(content, "text/html")
  const allowedTags = new Set(["A", "B", "BR", "EM", "I", "LI", "OL", "P", "STRONG", "UL"])
  const renderNode = (node: Node, key: string): ReactNode | ReactNode[] => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
    if (!(node instanceof HTMLElement)) return []
    const children = [...node.childNodes].flatMap((child, index) =>
      renderNode(child, `${key}-${index}`),
    )
    if (!allowedTags.has(node.tagName)) return children
    if (node.tagName === "BR") return createElement("br", { key })
    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? ""
      const props = /^(https?:|mailto:)/i.test(href)
        ? { href, key, rel: "noreferrer noopener", target: "_blank" }
        : { key }
      return createElement("a", props, children)
    }
    return createElement(node.tagName.toLowerCase(), { key }, children)
  }
  return [...document.body.childNodes].flatMap((node, index) => renderNode(node, String(index)))
}

const termQuery = (term?: TermDto) =>
  term ? { academicYear: term.academicYear, semester: term.semester } : {}

function CourseOverlay({
  ariaLabel,
  children,
  drawer,
  narrow,
  onOpenChange,
  open,
}: {
  ariaLabel: string
  children: ReactNode
  drawer: boolean
  narrow: boolean
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  if (drawer) {
    return (
      <Drawer.Backdrop
        className={styles.overlay ?? ""}
        isDismissable
        isOpen={open}
        onOpenChange={onOpenChange}
      >
        <Drawer.Content
          className={styles.dialogContainer ?? ""}
          data-presentation="drawer"
          placement={narrow ? "bottom" : "right"}
        >
          <Drawer.Dialog aria-label={ariaLabel} className={styles.dialog ?? ""}>
            {children}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    )
  }

  return (
    <Modal.Backdrop
      className={styles.overlay ?? ""}
      isDismissable
      isOpen={open}
      onOpenChange={onOpenChange}
    >
      <Modal.Container
        className={styles.dialogContainer ?? ""}
        data-presentation="modal"
        placement="center"
        scroll="inside"
      >
        <Modal.Dialog aria-label={ariaLabel} className={styles.dialog ?? ""}>
          {children}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

function CourseDialog({
  courseCode,
  selectedTerm,
  onClose,
}: {
  courseCode: string | null
  selectedTerm: TermDto | undefined
  onClose: () => void
}) {
  const { settings } = useAppearance()
  const { courseName, courseSecondaryName, text } = useI18n()
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 40rem)").matches,
  )
  const query = termQuery(selectedTerm)
  const detail = useQuery({
    queryKey: ["course", courseCode, query],
    queryFn: () => getCourse(courseCode ?? "", query),
    enabled: Boolean(courseCode),
  })
  const reviews = useQuery({
    queryKey: ["reviews", courseCode],
    queryFn: () => getCourseReviews(courseCode ?? "", { page: 1, pageSize: 20 }),
    enabled: Boolean(courseCode),
  })
  const drawerPresentation = isNarrow || settings.detailPresentation === "drawer"

  useEffect(() => {
    const media = window.matchMedia("(max-width: 40rem)")
    const updateViewport = () => setIsNarrow(media.matches)
    media.addEventListener("change", updateViewport)
    return () => media.removeEventListener("change", updateViewport)
  }, [])

  if (!courseCode) return null

  const detailsLabel = text({ th: "รายละเอียดรายวิชา", en: "Course details", zh: "课程详情" })

  return (
    <CourseOverlay
      ariaLabel={detailsLabel}
      drawer={drawerPresentation}
      narrow={isNarrow}
      onOpenChange={(open) => !open && onClose()}
      open={Boolean(courseCode)}
    >
      <div className={styles.dialogHeader}>
        <div>
          <h2>{detail.data ? courseName(detail.data.offering) : courseCode}</h2>
          <p className={styles.dialogDescription ?? ""}>
            {detail.data
              ? detail.data.offering.courseCode + " · " + courseSecondaryName(detail.data.offering)
              : text({ th: "กำลังโหลดรายละเอียด", en: "Loading details", zh: "正在加载详情" })}
          </p>
        </div>
        <Button
          aria-label={text({ th: "ปิดรายละเอียด", en: "Close details", zh: "关闭详情" })}
          className={styles.closeButton ?? ""}
          onClick={onClose}
          type="button"
          variant="quiet"
        >
          <X aria-hidden="true" size={18} />
        </Button>
      </div>

      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable course region needs keyboard scrolling. */}
      <section aria-label={detailsLabel} className={styles.dialogBody} tabIndex={0}>
        {detail.isError ? (
          <Status tone="error">
            {text({
              th: "โหลดรายละเอียดรายวิชาไม่ได้ ลองเปิดใหม่อีกครั้ง",
              en: "Could not load course details. Try again.",
              zh: "无法加载课程详情，请重试。",
            })}
          </Status>
        ) : null}

        {detail.data ? (
          <section aria-labelledby="course-metadata-heading" className={styles.detailSection}>
            <h3 id="course-metadata-heading">{detailsLabel}</h3>
            <dl className={styles.specList}>
              {[
                [text({ th: "ภาคการศึกษา", en: "Term", zh: "学期" }), detail.data.term.label],
                [
                  text({ th: "ชื่อย่อรายวิชา", en: "Short name", zh: "课程简称" }),
                  detail.data.offering.shortName,
                ],
                [text({ th: "หน่วยกิต", en: "Credits", zh: "学分" }), detail.data.offering.credits],
                [
                  text({ th: "ชั่วโมงเรียน", en: "Credit hours", zh: "学时" }),
                  detail.data.offering.creditHours,
                ],
                [text({ th: "คณะ", en: "Faculty", zh: "学院" }), detail.data.offering.faculty],
                [
                  text({ th: "ภาควิชา", en: "Department", zh: "系" }),
                  detail.data.offering.department,
                ],
                [
                  text({ th: "หมวดศึกษาทั่วไป", en: "General education", zh: "通识类别" }),
                  detail.data.offering.genEdType,
                ],
                [
                  text({ th: "หลักสูตร", en: "Programs", zh: "课程项目" }),
                  detail.data.offering.studyPrograms.join(", "),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {value === null || value === ""
                      ? text({ th: "ไม่ระบุ", en: "Not specified", zh: "未注明" })
                      : value}
                  </dd>
                </div>
              ))}
            </dl>
            <RegistrationWarnings
              courseCode={detail.data.offering.courseCode}
              courses={[detail.data.offering]}
              term={detail.data.term}
              prerequisiteText={detail.data.offering.prerequisiteText}
              issues={[]}
              defaultExpanded
            />
            {detail.data.offering.descriptionTh ? (
              <div className={styles.courseDescription}>
                <h4>
                  {text({
                    th: "คำอธิบายรายวิชา (ภาษาไทย)",
                    en: "Description (Thai)",
                    zh: "课程说明（泰语）",
                  })}
                </h4>
                <p lang="th">{detail.data.offering.descriptionTh}</p>
              </div>
            ) : null}
            {detail.data.offering.descriptionEn ? (
              <div className={styles.courseDescription}>
                <h4>
                  {text({
                    th: "คำอธิบายรายวิชา (ภาษาอังกฤษ)",
                    en: "Description (English)",
                    zh: "课程说明（英语）",
                  })}
                </h4>
                <p lang="en">{detail.data.offering.descriptionEn}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className={styles.courseColumns}>
          <section aria-labelledby="course-sections-heading" className={styles.detailSection}>
            <h3 id="course-sections-heading">
              {text({ th: "ตอนเรียน", en: "Sections", zh: "班次" })}
              {detail.data ? ` (${detail.data.sections.length})` : ""}
            </h3>
            {detail.isPending ? (
              <PageLoading
                label={text({ th: "กำลังโหลดตอนเรียน", en: "Loading sections", zh: "正在加载班次" })}
              />
            ) : null}
            <div className={styles.sectionList ?? ""}>
              {detail.data?.sections
                .toSorted((a, b) =>
                  a.sectionNo.localeCompare(b.sectionNo, undefined, { numeric: true }),
                )
                .map((section) => (
                  <CourseSectionCard key={section.id} section={section} />
                ))}
            </div>
            {detail.data?.sections.length === 0 ? (
              <p>
                {text({
                  th: "ไม่มีตอนเรียนในภาคการศึกษานี้",
                  en: "No sections in this term",
                  zh: "本学期没有班次",
                })}
              </p>
            ) : null}
          </section>
          <section aria-labelledby="course-reviews-heading" className={styles.detailSection}>
            <h3 id="course-reviews-heading">
              {text({ th: "รีวิว", en: "Reviews", zh: "评价" })}
              {detail.data ? ` (${detail.data.reviewSummary.count})` : ""}
            </h3>
            {detail.data?.reviewSummary.average != null ? (
              <p>
                {text({ th: "คะแนนเฉลี่ย", en: "Average rating", zh: "平均评分" })}:{" "}
                {detail.data.reviewSummary.average.toFixed(1)}/10
              </p>
            ) : null}
            {reviews.isError ? (
              <Status tone="error">
                {text({
                  th: "โหลดรีวิวไม่ได้ ลองเปิดใหม่อีกครั้ง",
                  en: "Could not load reviews. Try reopening the course.",
                  zh: "无法加载评价，请重新打开课程。",
                })}
              </Status>
            ) : null}
            {reviews.isPending ? (
              <p>{text({ th: "กำลังโหลดรีวิว", en: "Loading reviews", zh: "正在加载评价" })}</p>
            ) : null}
            {reviews.data?.data.length === 0 ? (
              <p>
                {text({
                  th: "ยังไม่มีรีวิวที่อนุมัติ",
                  en: "No approved reviews yet",
                  zh: "暂无已批准的评价",
                })}
              </p>
            ) : null}
            <div className={styles.reviewList ?? ""}>
              {reviews.data?.data.map((review) => (
                <article key={review.reviewId}>
                  <Chip color="accent" size="sm" variant="soft">
                    {review.rating}/10
                  </Chip>
                  {review.content ? (
                    <div className={styles.reviewHtml}>{safeReviewHtml(review.content)}</div>
                  ) : (
                    <p>{text({ th: "ไม่มีข้อความรีวิว", en: "No review text", zh: "没有评价内容" })}</p>
                  )}
                  <small>
                    {review.academicYear}/{review.semester} ·{" "}
                    {text({ th: "ถูกใจ ", en: "Likes ", zh: "点赞 " })}
                    {review.likeCount}
                  </small>
                </article>
              ))}
            </div>
            {reviews.data &&
            detail.data &&
            detail.data.reviewSummary.count > reviews.data.data.length ? (
              <p>
                {text({
                  th: `แสดง ${reviews.data.data.length} จาก ${detail.data.reviewSummary.count} รีวิว`,
                  en: `Showing ${reviews.data.data.length} of ${detail.data.reviewSummary.count} reviews`,
                  zh: `显示 ${reviews.data.data.length} 条评价，共 ${detail.data.reviewSummary.count} 条`,
                })}
              </p>
            ) : null}
          </section>
        </div>
      </section>
    </CourseOverlay>
  )
}

type InlineOption = {
  id: string
  label: string
}

function InlineSearchSelect({
  clearLabel,
  disabled = false,
  label,
  onValueChange,
  options,
  placeholder,
  testId,
  value,
}: {
  clearLabel: string
  disabled?: boolean
  label: string
  onValueChange: (value: string) => void
  options: InlineOption[]
  placeholder: string
  testId: string
  value: string
}) {
  const { contains } = useFilter({ sensitivity: "base" })
  return (
    <Autocomplete
      allowsEmptyCollection
      aria-label={label}
      className={css(styles.inlineSelect)}
      isDisabled={disabled}
      onChange={(key) => onValueChange(key === null ? "" : String(key))}
      onClear={() => onValueChange("")}
      placeholder={placeholder}
      value={value || null}
      variant="secondary"
    >
      <Label className={css(styles.inlineSelectLabel)}>{label}</Label>
      <Autocomplete.Trigger
        aria-label={label}
        className={css(styles.inlineSelectControl)}
        data-testid={testId}
      >
        <Autocomplete.Value />
        <Autocomplete.ClearButton aria-label={clearLabel}>
          <X aria-hidden="true" size={14} />
        </Autocomplete.ClearButton>
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover className={css(styles.inlineSelectPopover)} placement="bottom start">
        <Autocomplete.Filter filter={contains}>
          <SearchField aria-label={label}>
            <SearchField.Group className={css(styles.inlineSelectSearchGroup)}>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder={placeholder} />
            </SearchField.Group>
          </SearchField>
          <ListBox className={css(styles.inlineSelectList)}>
            {options.map((option) => (
              <ListBox.Item id={option.id} key={option.id} textValue={option.label}>
                {option.label}
              </ListBox.Item>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  )
}
function timeFromString(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return null
  return new Time(hour, minute)
}

function timeToString(value: { hour: number; minute: number }) {
  return String(value.hour).padStart(2, "0") + ":" + String(value.minute).padStart(2, "0")
}

function TimeRangeField({
  clearLabel,
  label,
  onChange,
  placeholder,
  testId,
  value,
}: {
  clearLabel: string
  label: string
  onChange: (value: string) => void
  placeholder: string
  testId: string
  value: string
}) {
  const time = timeFromString(value)
  return (
    <div className={styles.timeField} data-testid={testId}>
      <span>{label}</span>
      <Popover>
        <Popover.Trigger
          aria-label={label}
          className={css(styles.timePickerTrigger)}
          data-testid={testId + "-trigger"}
        >
          <span>{value || placeholder}</span>
          <Clock3 aria-hidden="true" size={16} />
        </Popover.Trigger>
        <Popover.Content className={css(styles.timePickerPopover)} placement="bottom start">
          <Popover.Dialog aria-label={label} className={css(styles.timePickerDialog)}>
            <TimeField
              aria-label={label}
              granularity="minute"
              hourCycle={24}
              onChange={(nextValue) => onChange(nextValue ? timeToString(nextValue) : "")}
              value={time}
            >
              <TimeField.Group className={css(styles.timeFieldGroup)}>
                <TimeField.Input>
                  {(segment) => (
                    <TimeField.Segment className={css(styles.timeFieldSegment)} segment={segment} />
                  )}
                </TimeField.Input>
              </TimeField.Group>
            </TimeField>
            <Button onClick={() => onChange("")} type="button" variant="quiet">
              {clearLabel}
            </Button>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  )
}
const genEdLabels: Record<string, Record<AppLanguage, string>> = {
  SC: { th: "หมวดวิทย์", en: "Science", zh: "科学" },
  SO: { th: "หมวดสังคม", en: "Social science", zh: "社会科学" },
  HU: { th: "หมวดมนุษย์", en: "Humanities", zh: "人文" },
  IN: { th: "หมวดสหฯ", en: "Interdisciplinary", zh: "跨学科" },
  NO: { th: "ไม่ใช่ GenEd", en: "Non-GenEd", zh: "非通识" },
}

type SearchFilterGroupId = "classes" | "exams" | "attributes"

function activeFilterGroups(params: URLSearchParams): Set<string> {
  const groups: Record<SearchFilterGroupId, string[]> = {
    classes: ["days", "startTime", "endTime"],
    exams: ["examDays", "examStartTime", "examEndTime"],
    attributes: ["faculty", "department", "courseGroup", "genEdTypes", "credits"],
  }
  return new Set(
    Object.entries(groups)
      .filter(([, fields]) => fields.some((field) => params.has(field)))
      .map(([group]) => group),
  )
}

function SearchFilterGroup({
  id,
  title,
  count,
  children,
}: {
  id: SearchFilterGroupId
  title: string
  count: number
  children: ReactNode
}) {
  const { text } = useI18n()
  return (
    <Accordion.Item className={css(styles.filterSection)} id={id}>
      <Accordion.Heading>
        <Accordion.Trigger
          className={css(styles.filterSectionTrigger)}
          data-testid={`filter-group-${id}`}
        >
          <span>{title}</span>
          {count > 0 ? (
            <span className={styles.activeFilterCount}>
              {text({ th: `${count} ตัวกรอง`, en: `${count} active`, zh: `已选 ${count}` })}
            </span>
          ) : null}
          <Accordion.Indicator>
            <ChevronDown aria-hidden="true" size={16} />
          </Accordion.Indicator>
        </Accordion.Trigger>
      </Accordion.Heading>
      <Accordion.Panel>
        <Accordion.Body className={css(styles.filterSectionBody)}>{children}</Accordion.Body>
      </Accordion.Panel>
    </Accordion.Item>
  )
}

export function CourseExplorerPage() {
  const { courseName, courseSecondaryName, language, text } = useI18n()
  const [params, navigateParams] = useSearchParams()
  const ownNavigation = useRef<string | null>(null)
  const setParams = useCallback(
    (next: URLSearchParams, options?: { replace?: boolean }) => {
      ownNavigation.current = next.toString()
      navigateParams(next, options)
    },
    [navigateParams],
  )
  const terms = useQuery({ queryKey: ["terms"], queryFn: getTerms })
  const currentTerm = terms.data?.find((term) => term.current)
  const selectedTerm = useMemo(() => {
    const year = Number(params.get("academicYear"))
    const semester = Number(params.get("semester"))
    return (
      terms.data?.find((term) => term.academicYear === year && term.semester === semester) ??
      currentTerm
    )
  }, [currentTerm, params, terms.data])
  const favorites = useFavorites(selectedTerm?.id)
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null)
  const draftFromParams = () => ({
    q: params.get("q") ?? "",
    faculty: params.get("faculty") ?? "",
    department: params.get("department") ?? "",
    genEdTypes: (params.get("genEdTypes") ?? "").split(",").filter(Boolean),
    courseGroup:
      params.get("courseGroup") === "general" || params.get("courseGroup") === "other"
        ? (params.get("courseGroup") as "general" | "other")
        : ("" as const),
    days: (params.get("days") ?? "").split(",").filter(Boolean),
    startTime: params.get("startTime") ?? "",
    endTime: params.get("endTime") ?? "",
    examDays: (params.get("examDays") ?? "").split(",").filter(Boolean),
    examStartTime: params.get("examStartTime") ?? "",
    examEndTime: params.get("examEndTime") ?? "",
    credits: params.get("credits") ?? "",
  })
  const [draft, setDraft] = useState(draftFromParams)
  const examStart = timeFromString(draft.examStartTime)
  const examEnd = timeFromString(draft.examEndTime)
  const examRangeInvalid = Boolean(examStart && examEnd && examStart.compare(examEnd) >= 0)
  const [draftSource, setDraftSource] = useState(params.toString())
  // Synchronize external navigation before the debounce effect can write an older draft back.
  if (draftSource !== params.toString()) {
    setDraftSource(params.toString())
    if (ownNavigation.current !== params.toString()) setDraft(draftFromParams())
  }
  const query = useMemo<CourseQuery>(() => {
    const result: CourseQuery = {
      ...termQuery(selectedTerm),
      page: Number(params.get("page") ?? 1),
      pageSize: 20,
    }
    for (const key of [
      "q",
      "faculty",
      "department",
      "genEdTypes",
      "days",
      "startTime",
      "endTime",
      "examDays",
      "examStartTime",
      "examEndTime",
    ] as const) {
      const value = params.get(key)
      if (value) result[key] = value
    }
    const courseGroup = params.get("courseGroup")
    if (courseGroup === "general" || courseGroup === "other") result.courseGroup = courseGroup
    const credits = Number(params.get("credits"))
    if (Number.isFinite(credits) && params.has("credits")) result.credits = credits
    return result
  }, [params, selectedTerm])
  const options = useQuery({
    queryKey: ["catalog-options", termQuery(selectedTerm)],
    queryFn: () => getCatalogOptions(termQuery(selectedTerm)),
    enabled: Boolean(selectedTerm),
  })
  const courses = useQuery({
    queryKey: ["courses", query],
    queryFn: ({ signal }) => getCourses(query, signal),
    enabled: Boolean(selectedTerm),
  })
  const visibleDepartments = (options.data?.departments ?? []).filter(
    (department) =>
      !draft.faculty || department.facultyIds.some((facultyId) => facultyId === draft.faculty),
  )
  const availableGenEdTypes = options.data?.genEdTypes ?? []
  const customCreditValue = ["1", "2", "3", "4"].includes(draft.credits) ? "" : draft.credits
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(() =>
    Boolean(
      params.get("advanced") === "1" ||
        params.get("faculty") ||
        params.get("department") ||
        params.get("genEdTypes") ||
        params.get("courseGroup") ||
        params.get("days") ||
        params.get("startTime") ||
        params.get("endTime") ||
        params.get("examDays") ||
        params.get("examStartTime") ||
        params.get("examEndTime") ||
        params.get("credits"),
    ),
  )
  const [expandedFilterGroups, setExpandedFilterGroups] = useState(() => activeFilterGroups(params))
  const groupNavigation = useRef(params.toString())
  useEffect(() => {
    const nextNavigation = params.toString()
    if (groupNavigation.current === nextNavigation) return
    groupNavigation.current = nextNavigation
    if (ownNavigation.current === nextNavigation) return
    const activeGroups = activeFilterGroups(params)
    setExpandedFilterGroups(activeGroups)
    if (activeGroups.size || params.get("advanced") === "1") setAdvancedFiltersOpen(true)
  }, [params])
  const filterCounts = {
    classes: [draft.days.length, draft.startTime, draft.endTime].filter(Boolean).length,
    exams: [draft.examDays.length, draft.examStartTime, draft.examEndTime].filter(Boolean).length,
    attributes: [
      draft.faculty,
      draft.department,
      draft.courseGroup,
      draft.genEdTypes.length,
      draft.credits,
    ].filter(Boolean).length,
  }
  const activeFilterCount = filterCounts.classes + filterCounts.exams + filterCounts.attributes
  const filterParams = useMemo(() => {
    const next = new URLSearchParams()
    if (selectedTerm) {
      next.set("academicYear", String(selectedTerm.academicYear))
      next.set("semester", String(selectedTerm.semester))
    }
    if (draft.q) next.set("q", draft.q)
    if (draft.faculty) next.set("faculty", draft.faculty)
    if (draft.department) next.set("department", draft.department)
    if (draft.genEdTypes.length) next.set("genEdTypes", draft.genEdTypes.join(","))
    if (draft.courseGroup) next.set("courseGroup", draft.courseGroup)
    if (draft.days.length) next.set("days", draft.days.join(","))
    if (draft.startTime) next.set("startTime", draft.startTime)
    if (draft.endTime) next.set("endTime", draft.endTime)
    if (draft.examDays.length) next.set("examDays", draft.examDays.join(","))
    if (draft.examStartTime) next.set("examStartTime", draft.examStartTime)
    if (draft.examEndTime) next.set("examEndTime", draft.examEndTime)
    if (draft.credits) next.set("credits", draft.credits)
    return next
  }, [draft, selectedTerm])

  useEffect(() => {
    const current = new URLSearchParams(params)
    current.delete("page")
    if (filterParams.toString() === current.toString()) return
    const timer = window.setTimeout(() => setParams(filterParams, { replace: true }), 250)
    return () => window.clearTimeout(timer)
  }, [filterParams, params, setParams])

  const applyFilters = (event: FormEvent) => {
    event.preventDefault()
    setParams(filterParams)
  }
  const selectTerm = (value: string) => {
    const term = terms.data?.find((item) => String(item.id) === value)
    if (!term) return
    const next = new URLSearchParams(params)
    next.set("academicYear", String(term.academicYear))
    next.set("semester", String(term.semester))
    next.delete("page")
    setParams(next)
  }

  const clearFilters = () => {
    setAdvancedFiltersOpen(false)
    setExpandedFilterGroups(new Set())
    setDraft({
      q: "",
      faculty: "",
      department: "",
      genEdTypes: [],
      courseGroup: "",
      days: [],
      startTime: "",
      endTime: "",
      examDays: [],
      examStartTime: "",
      examEndTime: "",
      credits: "",
    })
    const next = new URLSearchParams()
    if (selectedTerm) {
      next.set("academicYear", String(selectedTerm.academicYear))
      next.set("semester", String(selectedTerm.semester))
    }
    setParams(next)
  }

  const toggleGenEd = (value: string) => {
    setDraft((current) => ({
      ...current,
      genEdTypes: current.genEdTypes.includes(value)
        ? current.genEdTypes.filter((item) => item !== value)
        : [...current.genEdTypes, value],
    }))
  }

  const courseGroupChoices: Array<{ id: "general" | "other"; label: string }> = [
    {
      id: "general",
      label: text({ th: "วิชาศึกษาทั่วไป", en: "General education", zh: "通识课程" }),
    },
    {
      id: "other",
      label: text({ th: "รายวิชาอื่น", en: "Other / non-GenEd", zh: "其他 / 非通识" }),
    },
  ]

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBody}>
          <h1>
            {text({
              th: "ค้นหารายวิชา",
              en: "Course search",
              zh: "搜索课程",
            })}
          </h1>
          <p>
            {text({
              th: "กรองข้อมูลรายวิชาจากภาคที่เลือกโดยไม่เปลี่ยนแปลงแผนการลงทะเบียน",
              en: "Narrow catalogue data for a selected term without changing your registration plan.",
              zh: "按选定学期筛选课程目录，不会改变您的选课计划。",
            })}
          </p>
        </div>
        <section className={styles.termUtility} data-testid="term-utility">
          <Select
            aria-label={text({ th: "เปลี่ยนภาคการศึกษา", en: "Change term", zh: "更换学期" })}
            className={css(termStyles.termSelect)}
            isDisabled={!terms.data?.length}
            onSelectionChange={(key) => {
              if (key !== null) selectTerm(String(key))
            }}
            selectedKey={selectedTerm ? String(selectedTerm.id) : null}
          >
            <Select.Trigger className={css(termStyles.termTrigger)}>
              <span>
                {text({ th: "ภาคที่กำลังดู ", en: "Browsing ", zh: "当前 " })}
                {selectedTerm
                  ? termLabel(selectedTerm, language)
                  : text({ th: "กำลังโหลด", en: "Loading", zh: "加载中" })}
              </span>
              <Select.Indicator>
                <ChevronDown aria-hidden="true" size={15} />
              </Select.Indicator>
            </Select.Trigger>
            <Select.Popover className={css(termStyles.termPopover)} placement="bottom end">
              <ListBox>
                {(terms.data ?? []).map((term) => {
                  const label =
                    termLabel(term, language) +
                    (term.current ? " · " + text({ th: "ปัจจุบัน", en: "current", zh: "当前" }) : "")
                  return (
                    <ListBox.Item id={String(term.id)} key={term.id} textValue={label}>
                      {label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  )
                })}
              </ListBox>
            </Select.Popover>
          </Select>
        </section>
      </header>

      {selectedTerm && !selectedTerm.current ? (
        <Status tone="warning">
          {text({ th: "กำลังดูภาค ", en: "Viewing term ", zh: "正在查看学期 " })}
          {termLabel(selectedTerm, language)} ·{" "}
          {text({ th: "แบบอ่านอย่างเดียว", en: "read only", zh: "只读" })}
        </Status>
      ) : null}

      <div className={styles.searchWorkspace}>
        <div className={styles.discoveryColumn}>
          <form className={styles.filters} onSubmit={applyFilters}>
            <label className={styles.searchField}>
              <span>
                {text({ th: "รหัสหรือชื่อรายวิชา", en: "Course code or title", zh: "课程代码或名称" })}
              </span>
              <div>
                <Search aria-hidden="true" size={16} />
                <input
                  onChange={(event) => setDraft((value) => ({ ...value, q: event.target.value }))}
                  placeholder={text({
                    th: "ค้นหารหัส ชื่อไทย หรือชื่ออังกฤษ",
                    en: "Search code, Thai title, or English title",
                    zh: "搜索代码、泰文或英文名称",
                  })}
                  value={draft.q}
                />
              </div>
            </label>

            <div className={styles.compactFilterActions}>
              <Button
                aria-controls="course-search-advanced"
                aria-expanded={advancedFiltersOpen}
                onClick={() => setAdvancedFiltersOpen((open) => !open)}
                type="button"
                variant="outline"
              >
                <SlidersHorizontal aria-hidden="true" size={16} />
                {advancedFiltersOpen
                  ? text({ th: "ซ่อนตัวกรอง", en: "Hide filters", zh: "隐藏筛选" })
                  : text({ th: "ตัวกรองเพิ่มเติม", en: "More filters", zh: "更多筛选" })}
                {activeFilterCount > 0 ? (
                  <span className={styles.activeFilterCount}>{activeFilterCount}</span>
                ) : null}
              </Button>
              <div className={styles.filterAction}>
                <Button onClick={clearFilters} type="button" variant="quiet">
                  {text({ th: "ล้างตัวกรอง", en: "Clear filters", zh: "清除筛选" })}
                </Button>
                <Button type="submit" variant="primary">
                  {text({ th: "ค้นหารายวิชา", en: "Search courses", zh: "搜索课程" })}
                </Button>
              </div>
            </div>

            {advancedFiltersOpen ? (
              <Accordion
                allowsMultipleExpanded
                className={css(styles.advancedFilters)}
                expandedKeys={expandedFilterGroups}
                id="course-search-advanced"
                onExpandedChange={(keys) => setExpandedFilterGroups(new Set([...keys].map(String)))}
              >
                <SearchFilterGroup
                  id="classes"
                  title={text({ th: "ตารางเรียน", en: "Class schedule", zh: "上课安排" })}
                  count={filterCounts.classes}
                >
                  <fieldset className={styles.filterGroup}>
                    <legend>{text({ th: "วันเรียน", en: "Meeting days", zh: "上课日" })}</legend>
                    <div className={styles.dayRange}>
                      {dayOrder.map((day) => (
                        <button
                          aria-pressed={draft.days.includes(day)}
                          key={day}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              days: current.days.includes(day)
                                ? current.days.filter((item) => item !== day)
                                : [...current.days, day],
                            }))
                          }
                          type="button"
                        >
                          {filterDayLabels[language][day]}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <div className={styles.timeRange}>
                    <TimeRangeField
                      clearLabel={text({ th: "ทุกเวลา", en: "Any time", zh: "任何时间" })}
                      label={text({ th: "เริ่มหลัง", en: "Starts after", zh: "开始时间" })}
                      onChange={(startTime) => setDraft((current) => ({ ...current, startTime }))}
                      placeholder={text({ th: "ทุกเวลา", en: "Any time", zh: "任何时间" })}
                      testId="time-start"
                      value={draft.startTime}
                    />
                    <TimeRangeField
                      clearLabel={text({ th: "ทุกเวลา", en: "Any time", zh: "任何时间" })}
                      label={text({ th: "จบก่อน", en: "Ends before", zh: "结束时间" })}
                      onChange={(endTime) => setDraft((current) => ({ ...current, endTime }))}
                      placeholder={text({ th: "ทุกเวลา", en: "Any time", zh: "任何时间" })}
                      testId="time-end"
                      value={draft.endTime}
                    />
                  </div>
                </SearchFilterGroup>
                <SearchFilterGroup
                  id="exams"
                  title={text({ th: "การสอบ", en: "Exams", zh: "考试" })}
                  count={filterCounts.exams}
                >
                  <fieldset className={`${styles.filterGroup} ${styles.examFilters}`}>
                    <legend>
                      {text({
                        th: "วันและเวลาสอบ",
                        en: "Exam days and times",
                        zh: "考试日期和时间",
                      })}
                    </legend>
                    <p className={styles.filterHint}>
                      {text({
                        th: "สอบกลางภาคหรือปลายภาคที่ประกาศวันและเวลาแล้ว โดยเวลาสอบทั้งหมดอยู่ในช่วงที่เลือก",
                        en: "Matches an announced midterm or final exam entirely within the selected time window.",
                        zh: "匹配已公布的期中或期末考试，且整场考试位于所选时间范围内。",
                      })}
                    </p>
                    <div className={styles.dayRange}>
                      {dayOrder.map((day) => (
                        <button
                          aria-label={text({
                            th: `วันสอบ ${filterDayLabels.th[day]}`,
                            en: `Exam day ${filterDayLabels.en[day]}`,
                            zh: `考试日 周${filterDayLabels.zh[day]}`,
                          })}
                          aria-pressed={draft.examDays.includes(day)}
                          key={day}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              examDays: current.examDays.includes(day)
                                ? current.examDays.filter((item) => item !== day)
                                : [...current.examDays, day],
                            }))
                          }
                          type="button"
                        >
                          {filterDayLabels[language][day]}
                        </button>
                      ))}
                    </div>
                    <div className={styles.timeRange}>
                      <TimeRangeField
                        clearLabel={text({ th: "ทุกเวลา", en: "Any time", zh: "任何时间" })}
                        label={text({
                          th: "สอบเริ่มไม่ก่อน",
                          en: "Exam starts at or after",
                          zh: "考试开始不早于",
                        })}
                        onChange={(examStartTime) =>
                          setDraft((current) => ({ ...current, examStartTime }))
                        }
                        placeholder={text({ th: "ทุกเวลา", en: "Any time", zh: "任何时间" })}
                        testId="exam-time-start"
                        value={draft.examStartTime}
                      />
                      <TimeRangeField
                        clearLabel={text({ th: "ทุกเวลา", en: "Any time", zh: "任何时间" })}
                        label={text({
                          th: "สอบจบไม่หลัง",
                          en: "Exam ends at or before",
                          zh: "考试结束不晚于",
                        })}
                        onChange={(examEndTime) =>
                          setDraft((current) => ({ ...current, examEndTime }))
                        }
                        placeholder={text({ th: "ทุกเวลา", en: "Any time", zh: "任何时间" })}
                        testId="exam-time-end"
                        value={draft.examEndTime}
                      />
                    </div>
                    {examRangeInvalid ? (
                      <Status tone="error">
                        {text({
                          th: "เวลาสิ้นสุดช่วงสอบต้องอยู่หลังเวลาเริ่มต้น",
                          en: "The exam end time must be later than the start time.",
                          zh: "考试结束时间必须晚于开始时间。",
                        })}
                      </Status>
                    ) : null}
                  </fieldset>
                </SearchFilterGroup>
                <SearchFilterGroup
                  id="attributes"
                  title={text({ th: "ข้อมูลรายวิชา", en: "Course attributes", zh: "课程属性" })}
                  count={filterCounts.attributes}
                >
                  <InlineSearchSelect
                    clearLabel={text({
                      th: "ล้างคณะ / หน่วยงาน",
                      en: "Clear faculty / unit",
                      zh: "清除学院 / 单位",
                    })}
                    label={text({ th: "คณะ / หน่วยงาน", en: "Faculty / unit", zh: "学院 / 单位" })}
                    onValueChange={(faculty) =>
                      setDraft((current) => ({
                        ...current,
                        faculty,
                        department:
                          current.department &&
                          (options.data?.departments ?? [])
                            .find((department) => department.id === current.department)
                            ?.facultyIds.includes(faculty)
                            ? current.department
                            : "",
                      }))
                    }
                    options={(options.data?.faculties ?? []).map((faculty) => ({
                      id: faculty.id,
                      label: faculty.id + " · " + faculty.name,
                    }))}
                    testId="faculty-autocomplete"
                    placeholder={text({
                      th: "ทุกคณะ / หน่วยงาน",
                      en: "All faculties / units",
                      zh: "全部学院 / 单位",
                    })}
                    value={draft.faculty}
                  />

                  <InlineSearchSelect
                    clearLabel={text({
                      th: "ล้างภาควิชา / หน่วยงาน",
                      en: "Clear department / unit",
                      zh: "清除系 / 单位",
                    })}
                    disabled={!options.data}
                    label={text({
                      th: "ภาควิชา / หน่วยงาน",
                      en: "Department / unit",
                      zh: "系 / 单位",
                    })}
                    onValueChange={(department) =>
                      setDraft((current) => ({ ...current, department }))
                    }
                    options={visibleDepartments.map((department) => ({
                      id: department.id,
                      label: department.name,
                    }))}
                    testId="department-autocomplete"
                    placeholder={text({
                      th: "ทุกภาควิชา / หน่วยงาน",
                      en: "All departments / units",
                      zh: "全部院系 / 单位",
                    })}
                    value={draft.department}
                  />
                  <fieldset className={styles.filterGroup}>
                    <legend>{text({ th: "ประเภทวิชา", en: "Course group", zh: "课程类型" })}</legend>
                    <div className={styles.filterChips}>
                      {courseGroupChoices.map((choice) => (
                        <button
                          aria-pressed={draft.courseGroup === choice.id}
                          key={choice.id}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              courseGroup: current.courseGroup === choice.id ? "" : choice.id,
                            }))
                          }
                          type="button"
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className={styles.filterGroup}>
                    <legend>
                      {text({ th: "หมวดหมู่ GenEd", en: "GenEd category", zh: "通识类别" })}
                    </legend>
                    <div className={styles.filterChips}>
                      {Object.entries(genEdLabels)
                        .filter(([code]) => availableGenEdTypes.includes(code))
                        .map(([code, labels]) => (
                          <button
                            aria-pressed={draft.genEdTypes.includes(code)}
                            key={code}
                            onClick={() => toggleGenEd(code)}
                            type="button"
                          >
                            {labels[language]}
                          </button>
                        ))}
                    </div>
                  </fieldset>

                  <fieldset className={styles.filterGroup}>
                    <legend>{text({ th: "หน่วยกิต", en: "Credits", zh: "学分" })}</legend>
                    <div className={styles.creditChoices}>
                      {[1, 2, 3, 4].map((credits) => (
                        <button
                          aria-pressed={draft.credits === String(credits)}
                          key={credits}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              credits: current.credits === String(credits) ? "" : String(credits),
                            }))
                          }
                          type="button"
                        >
                          {credits}
                        </button>
                      ))}
                      <label className={styles.customCreditInput}>
                        <span>{text({ th: "กำหนดเอง", en: "Custom", zh: "自定义" })}</span>
                        <input
                          aria-label={text({
                            th: "กำหนดหน่วยกิตเอง",
                            en: "Custom credits",
                            zh: "自定义学分",
                          })}
                          inputMode="decimal"
                          max="99"
                          min="0"
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, credits: event.target.value }))
                          }
                          placeholder="—"
                          type="number"
                          value={customCreditValue}
                        />
                      </label>
                    </div>
                  </fieldset>
                </SearchFilterGroup>
              </Accordion>
            ) : null}
          </form>

          {courses.isError ? (
            <Status tone="error">
              {text({
                th: "ค้นหารายวิชาไม่ได้ ตรวจสอบตัวกรองแล้วลองอีกครั้ง",
                en: "Could not search courses. Check filters and try again.",
                zh: "无法搜索课程，请检查筛选条件后重试。",
              })}
            </Status>
          ) : null}
          <CourseFavorites
            favorites={favorites}
            onOpen={(code, trigger) => {
              detailTriggerRef.current = trigger
              setSelectedCourse(code)
            }}
          />
          <section className={styles.results}>
            <div className={styles.resultHeader}>
              <div>
                <h2>{text({ th: "ผลการค้นหา", en: "Search results", zh: "搜索结果" })}</h2>
                <p>
                  {text({
                    th: "สำรวจรายละเอียดรายวิชาได้โดยไม่เปลี่ยนแปลงแผนการลงทะเบียน",
                    en: "Explore course details without changing your registration plan.",
                    zh: "浏览课程详情，不会改变您的选课计划。",
                  })}
                </p>
              </div>
              <span>
                {courses.data?.meta.total ?? 0}{" "}
                {text({ th: "รายวิชา", en: "courses", zh: "门课程" })}
              </span>
            </div>
            {courses.isPending ? (
              <PageLoading
                label={text({ th: "กำลังค้นหารายวิชา", en: "Searching courses", zh: "正在搜索课程" })}
              />
            ) : null}
            {courses.data?.data.length === 0 ? (
              <div className={pageStyles.empty}>
                <h2>{text({ th: "ไม่พบรายวิชา", en: "No courses found", zh: "未找到课程" })}</h2>
                <p>
                  {text({
                    th: "ลดตัวกรองหรือค้นหาด้วยรหัสวิชาแบบสั้นลง",
                    en: "Use fewer filters or a shorter course code.",
                    zh: "减少筛选条件或使用更短的课程代码。",
                  })}
                </p>
              </div>
            ) : null}
            <div className={styles.courseList}>
              {courses.data?.data.map((course: CourseSummaryDto) => (
                <article className={styles.courseRow} key={course.courseCode}>
                  <span className={styles.courseCode}>{course.courseCode}</span>
                  <div className={styles.courseIdentity}>
                    <strong>{courseName(course)}</strong>
                    <small>{courseSecondaryName(course)}</small>
                    <div className={styles.courseTags}>
                      <span>{course.department || course.faculty}</span>
                      {course.genEdType ? (
                        <span>{genEdLabels[course.genEdType]?.[language] ?? course.genEdType}</span>
                      ) : null}
                      <span>
                        {course.credits} {text({ th: "หน่วยกิต", en: "credits", zh: "学分" })}
                      </span>
                    </div>
                    {course.prerequisiteText ? (
                      <span className={styles.courseRequirement}>
                        {text({ th: "เงื่อนไข: ", en: "Requirement: ", zh: "要求：" })}
                        {course.prerequisiteText}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.courseSignals}>
                    {course.reviewCount > 0 && course.reviewAverage !== null ? (
                      <span
                        role="img"
                        aria-label={text({
                          th:
                            "คะแนนรีวิว " +
                            course.reviewAverage.toFixed(1) +
                            " จาก " +
                            String(course.reviewCount) +
                            " รีวิว",
                          en:
                            "Rating " +
                            course.reviewAverage.toFixed(1) +
                            " from " +
                            String(course.reviewCount) +
                            " reviews",
                          zh:
                            "评分 " +
                            course.reviewAverage.toFixed(1) +
                            "，共 " +
                            String(course.reviewCount) +
                            " 条评价",
                        })}
                        className={styles.reviewSummary}
                      >
                        <Star aria-hidden="true" fill="currentColor" size={16} />
                        {course.reviewAverage.toFixed(1)} · {course.reviewCount}
                      </span>
                    ) : (
                      <span className={styles.noReviews}>
                        {text({ th: "ยังไม่มีรีวิว", en: "No reviews yet", zh: "暂无评价" })}
                      </span>
                    )}
                    <span>
                      {course.sectionCount} {text({ th: "ตอน", en: "sections", zh: "班次" })}
                    </span>
                  </div>
                  <div className={styles.courseActions}>
                    <Button
                      data-mode="search"
                      onClick={(event) => {
                        detailTriggerRef.current = event.currentTarget as HTMLButtonElement
                        setSelectedCourse(course.courseCode)
                      }}
                      type="button"
                      variant="outline"
                    >
                      {text({ th: "ดูรายละเอียด", en: "View details", zh: "查看详情" })}
                    </Button>
                    <FavoriteButton courseCode={course.courseCode} favorites={favorites} />
                  </div>
                </article>
              ))}
            </div>
            {(courses.data?.meta.totalPages ?? 1) > 1 ? (
              <div className={styles.pagination}>
                <Button
                  variant="quiet"
                  disabled={(query.page ?? 1) <= 1}
                  onClick={() => {
                    const next = new URLSearchParams(params)
                    next.set("page", String((query.page ?? 1) - 1))
                    setParams(next)
                  }}
                >
                  {text({ th: "ก่อนหน้า", en: "Previous", zh: "上一页" })}
                </Button>
                <span>
                  {text({ th: "หน้า ", en: "Page ", zh: "第 " })}
                  {courses.data?.meta.page} {text({ th: "จาก", en: "of", zh: "页，共" })}{" "}
                  {courses.data?.meta.totalPages}
                </span>
                <Button
                  variant="quiet"
                  disabled={(query.page ?? 1) >= (courses.data?.meta.totalPages ?? 1)}
                  onClick={() => {
                    const next = new URLSearchParams(params)
                    next.set("page", String((query.page ?? 1) + 1))
                    setParams(next)
                  }}
                >
                  {text({ th: "ถัดไป", en: "Next", zh: "下一页" })}
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <CourseDialog
        courseCode={selectedCourse}
        key={selectedCourse ?? "closed"}
        onClose={() => {
          setSelectedCourse(null)
          window.requestAnimationFrame(() =>
            detailTriggerRef.current?.focus({ preventScroll: true }),
          )
        }}
        selectedTerm={selectedTerm}
      />
    </div>
  )
}
