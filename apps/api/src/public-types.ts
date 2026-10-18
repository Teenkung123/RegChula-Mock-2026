import type {
  AppearanceSettings,
  AppearanceSettingsPatch,
  AppearanceTheme,
} from "../../../packages/appearance/src/index.ts"
import type { ScheduleColorId } from "../../../packages/appearance/src/index.ts"

export interface ActivityInputDto {
  title: string
  dayCode: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU"
  startMinute: number
  endMinute: number
}

export interface ActivityDto extends ActivityInputDto {
  id: string
  termId: number
}

export interface FavoriteDto {
  courseCode: string
  nameTh: string | null
  nameEn: string | null
  offered: boolean
}

export interface TermDto {
  id: number
  academicYear: number
  semester: number
  label: string
  current?: boolean
}

export interface ChallengeDto {
  code: string
  token: string
  expiresAt: string
}

export interface MeDto {
  studentId: string
  lastLoginAt: string
  rememberMe: boolean
}

export interface CatalogOptionsDto {
  term: TermDto
  faculties: Array<{ id: string; name: string }>
  departments: Array<{ id: string; name: string; facultyIds: string[] }>
  credits: number[]
  genEdTypes: string[]
}

export interface CourseSummaryDto {
  courseCode: string
  shortName?: string | null
  nameTh: string
  nameEn: string
  faculty: string
  department: string
  credits: number
  prerequisiteText: string | null
  genEdType: string | null
  sectionCount: number
  reviewCount: number
  reviewAverage: number | null
}

export interface MeetingDto {
  id?: number
  sectionId?: number
  section_id?: number
  classType?: string
  class_type?: string
  dayCode?: string | null
  day_code?: string | null
  startMinute?: number | null
  start_minute?: number | null
  endMinute?: number | null
  end_minute?: number | null
  arranged: boolean | number
  periodLabel?: string
  period_label?: string
  building: string | null
  room: string | null
  teachers: string[] | string | null
}

export interface SectionDto {
  id: number
  sectionNo: string
  closed: boolean
  capacity: number
  baselineEnrolled: number
  localActive: number
  remainingSeats: number
  note: string | null
  active: boolean
  meetings: MeetingDto[]
}

export interface CourseDetailDto {
  term: TermDto
  offering: CourseSummaryDto & {
    id: number
    termId: number
    shortName: string | null
    descriptionTh: string | null
    descriptionEn: string | null
    creditHours: string | null
    genEdType: string | null
    studyPrograms: string[]
    midterm: ExamSlotDto | null
    final: ExamSlotDto | null
  }
  sections: SectionDto[]
  reviewSummary: { count: number; average: number | null }
}

export interface CourseReviewDto {
  reviewId: string
  rating: number
  content: string
  likeCount: number
  dislikeCount: number
  academicYear: number
  semester: number
  termLabel: string
}

export interface ExamSlotDto {
  date: string
  startMinute: number
  endMinute: number
}

export interface ExamCourseDto {
  courseCode: string
  nameTh: string
  nameEn: string
  sectionNo: string
  midterm: ExamSlotDto | null
  final: ExamSlotDto | null
}

export interface ExamScheduleDto {
  term: TermDto | null
  courses: ExamCourseDto[]
}

export interface ScheduleColorsDto {
  termId: number | null
  colors: Array<{ courseCode: string; colorId: ScheduleColorId }>
}

export interface AnnouncementDto {
  id: number
  title: string
  body: string
}

export type ThemePreference = AppearanceTheme
export type AppearanceSettingsDto = AppearanceSettings
export type AppearanceSettingsPatchDto = AppearanceSettingsPatch

export interface RegistrationDto {
  shortName?: string | null
  registrationId: number
  courseCode: string
  nameTh: string
  nameEn: string
  credits: number
  status: "active" | "dropped" | "withdrawn"
  offeringId: number
  sectionId: number
  sectionNo: string
  meetings: MeetingDto[]
}

export interface RegistrationListDto {
  term: TermDto | null
  registrations: RegistrationDto[]
}

export interface RuleIssueDto {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface RegistrationPreviewDto {
  eligible: boolean
  issues: RuleIssueDto[]
  advisoryOverrideAvailable?: boolean
  term: TermDto
  course: {
    courseCode: string
    nameTh: string
    nameEn: string
    credits: number
  }
  section: {
    id: number
    sectionNo: string
    remainingSeats: number
    meetings: MeetingDto[]
  }
  confirmationToken: string | null
  expiresAt: string | null
}

export interface ActionResultDto {
  registrationId: number
  status: "active" | "dropped" | "withdrawn"
  courseCode?: string
  sectionId?: number
  sectionNo?: string
}

export interface BatchRegistrationPreviewItemDto {
  requestIndex: number
  eligible: boolean
  issues: RuleIssueDto[]
  advisoryOverrideAvailable?: boolean
  course: RegistrationPreviewDto["course"]
  section: RegistrationPreviewDto["section"]
}

export interface BatchRegistrationPreviewDto {
  eligible: boolean
  items: BatchRegistrationPreviewItemDto[]
  confirmationToken: string | null
  expiresAt: string | null
}

export interface BatchRegistrationResultDto {
  registrations: ActionResultDto[]
  status: "active"
}

export interface ActionRegistrationDto {
  registrationId: number
  courseCode: string
  nameTh: string
  nameEn: string
  credits: number
  sectionId: number
  sectionNo: string
}

export interface BatchDropPreviewDto {
  action: "drop"
  registrations: ActionRegistrationDto[]
  confirmationToken: string
  expiresAt: string
}

export interface BatchDropResultDto {
  registrationIds: number[]
  status: "dropped"
}

export interface WithdrawalFormPreviewDto {
  action: "withdrawal-form"
  registrations: Array<ActionRegistrationDto & { reason: string }>
  confirmationToken: string
  expiresAt: string
}
