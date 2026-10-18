export interface RawCatalog {
  source?: string
  datasets: RawDataset[]
}

export interface RawDataset {
  studyProgram?: unknown
  academicYear?: unknown
  semester?: unknown
  term?: unknown
  termLabel?: unknown
  courses?: unknown
}

export interface RawCourse {
  academicYear?: unknown
  semester?: unknown
  courseNo?: unknown
  courseDescTh?: unknown
  courseDescEn?: unknown
  abbrName?: unknown
  courseNameTh?: unknown
  courseNameEn?: unknown
  faculty?: unknown
  department?: unknown
  credit?: unknown
  creditHours?: unknown
  courseCondition?: unknown
  genEdType?: unknown
  midterm?: unknown
  final?: unknown
  sections?: unknown
  reviews?: unknown
}

export interface RawSection {
  sectionNo?: unknown
  closed?: unknown
  capacity?: unknown
  note?: unknown
  genEdType?: unknown
  classes?: unknown
}

export interface RawClass {
  type?: unknown
  dayOfWeek?: unknown
  period?: unknown
  building?: unknown
  room?: unknown
  teachers?: unknown
}

export interface RawReview {
  _id?: unknown
  rating?: unknown
  courseNo?: unknown
  semester?: unknown
  academicYear?: unknown
  studyProgram?: unknown
  content?: unknown
  likeCount?: unknown
  dislikeCount?: unknown
  status?: unknown
}

export interface NormalizedMeeting {
  classType: string
  dayCode: string | null
  startMinute: number | null
  endMinute: number | null
  periodLabel: string
  building: string | null
  room: string | null
  teachers: string[]
  arranged: boolean
}

export interface NormalizedSection {
  sectionNo: string
  closed: boolean
  capacity: number
  baselineEnrolled: number
  note: string | null
  genEdType: string | null
  meetings: NormalizedMeeting[]
}

export interface NormalizedExamSlot {
  date: string
  startMinute: number
  endMinute: number
}

export interface NormalizedOffering {
  academicYear: number
  semester: number
  termLabel: string
  courseCode: string
  nameTh: string
  nameEn: string
  shortName: string | null
  descriptionTh: string | null
  descriptionEn: string | null
  faculty: string
  department: string
  credits: number
  creditHours: string | null
  prerequisiteText: string | null
  genEdType: string | null
  midterm: NormalizedExamSlot | null
  final: NormalizedExamSlot | null
  studyPrograms: string[]
  sections: NormalizedSection[]
}

export interface NormalizedReview {
  reviewId: string
  courseCode: string
  academicYear: number
  semester: number
  studyProgram: string | null
  rating: number
  content: string
  likeCount: number
  dislikeCount: number
  status: "APPROVED"
}

export interface NormalizedCatalog {
  offerings: NormalizedOffering[]
  reviews: NormalizedReview[]
  conflicts: string[]
  warnings: string[]
}
