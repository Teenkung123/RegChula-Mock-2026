import {
  bigint,
  boolean,
  char,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { registrationAccessCodes, registrationAccessGrants, studentRegistrationProfiles } from "./registration-access"
import { catalogRevision, staffCatalogPreviews, termRegistrationWindows } from "./staff-catalog"
import { staffAuditEvents, staffSessions, staffUsers, studentAdvisors } from "./staff"

export { registrationAccessCodes, registrationAccessGrants, studentRegistrationProfiles }
export { catalogRevision, staffCatalogPreviews, termRegistrationWindows }
export { staffAuditEvents, staffSessions, staffUsers, studentAdvisors }

const createdAt = () => timestamp("created_at", { mode: "date" }).defaultNow().notNull()
const updatedAt = () =>
  timestamp("updated_at", { mode: "date" }).defaultNow().onUpdateNow().notNull()

export const academicTerms = mysqlTable(
  "academic_terms",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    academicYear: smallint("academic_year", { unsigned: true }).notNull(),
    semester: tinyint("semester", { unsigned: true }).notNull(),
    label: varchar("label", { length: 32 }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("academic_terms_year_semester_uq").on(table.academicYear, table.semester),
  ],
)

export const appSettings = mysqlTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
})

export const catalogImports = mysqlTable(
  "catalog_imports",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    checksum: char("checksum", { length: 64 }).notNull(),
    importerVersion: int("importer_version", { unsigned: true }).default(1).notNull(),
    status: mysqlEnum("status", ["succeeded", "failed"]).notNull(),
    courseCount: int("course_count", { unsigned: true }).default(0).notNull(),
    sectionCount: int("section_count", { unsigned: true }).default(0).notNull(),
    reviewCount: int("review_count", { unsigned: true }).default(0).notNull(),
    conflictCount: int("conflict_count", { unsigned: true }).default(0).notNull(),
    message: text("message"),
    importedAt: createdAt(),
  },
  (table) => [
    uniqueIndex("catalog_imports_checksum_uq").on(table.checksum),
    index("catalog_imports_file_idx").on(table.fileName, table.importedAt),
  ],
)

export const courses = mysqlTable("courses", {
  courseCode: varchar("course_code", { length: 24 }).primaryKey(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const courseOfferings = mysqlTable(
  "course_offerings",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    termId: int("term_id", { unsigned: true })
      .notNull()
      .references(() => academicTerms.id, { onDelete: "restrict", onUpdate: "cascade" }),
    courseCode: varchar("course_code", { length: 24 })
      .notNull()
      .references(() => courses.courseCode, { onDelete: "restrict", onUpdate: "cascade" }),
    nameTh: varchar("name_th", { length: 500 }).notNull(),
    nameEn: varchar("name_en", { length: 500 }).notNull(),
    shortName: varchar("short_name", { length: 255 }),
    descriptionTh: text("description_th"),
    descriptionEn: text("description_en"),
    faculty: varchar("faculty", { length: 255 }).notNull(),
    department: varchar("department", { length: 255 }).notNull(),
    credits: decimal("credits", { precision: 4, scale: 1, mode: "number" }).notNull(),
    creditHours: varchar("credit_hours", { length: 255 }),
    prerequisiteText: text("prerequisite_text"),
    genEdType: varchar("gen_ed_type", { length: 100 }),
    midtermDate: date("midterm_date", { mode: "string" }),
    midtermStartMinute: smallint("midterm_start_minute", { unsigned: true }),
    midtermEndMinute: smallint("midterm_end_minute", { unsigned: true }),
    finalDate: date("final_date", { mode: "string" }),
    finalStartMinute: smallint("final_start_minute", { unsigned: true }),
    finalEndMinute: smallint("final_end_minute", { unsigned: true }),
    studyPrograms: json("study_programs").$type<string[]>().notNull(),
    active: boolean("active").default(true).notNull(),
    sourceChecksum: char("source_checksum", { length: 64 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("course_offerings_term_course_uq").on(table.termId, table.courseCode),
    index("course_offerings_term_active_idx").on(table.termId, table.active),
    index("course_offerings_faculty_idx").on(table.termId, table.faculty),
    index("course_offerings_department_idx").on(table.termId, table.department),
    index("course_offerings_credits_idx").on(table.termId, table.credits),
  ],
)

export const sections = mysqlTable(
  "sections",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    offeringId: bigint("offering_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => courseOfferings.id, { onDelete: "restrict", onUpdate: "cascade" }),
    sectionNo: varchar("section_no", { length: 32 }).notNull(),
    closed: boolean("closed").default(false).notNull(),
    capacity: int("capacity", { unsigned: true }).default(0).notNull(),
    baselineEnrolled: int("baseline_enrolled", { unsigned: true }).default(0).notNull(),
    localActive: int("local_active", { unsigned: true }).default(0).notNull(),
    note: text("note"),
    genEdType: varchar("gen_ed_type", { length: 100 }),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("sections_offering_number_uq").on(table.offeringId, table.sectionNo),
    index("sections_offering_active_idx").on(table.offeringId, table.active),
  ],
)

export const sectionMeetings = mysqlTable(
  "section_meetings",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    sectionId: bigint("section_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => sections.id, { onDelete: "cascade", onUpdate: "cascade" }),
    classType: varchar("class_type", { length: 80 }).notNull(),
    dayCode: varchar("day_code", { length: 12 }),
    startMinute: smallint("start_minute", { unsigned: true }),
    endMinute: smallint("end_minute", { unsigned: true }),
    periodLabel: varchar("period_label", { length: 64 }).notNull(),
    building: varchar("building", { length: 255 }),
    room: varchar("room", { length: 255 }),
    teachers: json("teachers").$type<string[]>().notNull(),
    arranged: boolean("arranged").default(false).notNull(),
  },
  (table) => [
    index("section_meetings_section_idx").on(table.sectionId),
    index("section_meetings_day_time_idx").on(table.dayCode, table.startMinute, table.endMinute),
  ],
)

export const courseReviews = mysqlTable(
  "course_reviews",
  {
    reviewId: varchar("review_id", { length: 80 }).primaryKey(),
    courseCode: varchar("course_code", { length: 24 })
      .notNull()
      .references(() => courses.courseCode, { onDelete: "cascade", onUpdate: "cascade" }),
    termId: int("term_id", { unsigned: true })
      .notNull()
      .references(() => academicTerms.id, { onDelete: "restrict", onUpdate: "cascade" }),
    studyProgram: varchar("study_program", { length: 16 }),
    rating: tinyint("rating", { unsigned: true }).notNull(),
    content: text("content").notNull(),
    likeCount: int("like_count", { unsigned: true }).default(0).notNull(),
    dislikeCount: int("dislike_count", { unsigned: true }).default(0).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    sourceChecksum: char("source_checksum", { length: 64 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("course_reviews_course_idx").on(table.courseCode),
    index("course_reviews_course_term_idx").on(table.courseCode, table.termId),
  ],
)

export const students = mysqlTable("students", {
  studentId: varchar("student_id", { length: 32 }).primaryKey(),
  createdAt: createdAt(),
  lastLoginAt: timestamp("last_login_at", { mode: "date" }).defaultNow().notNull(),
})

export const studentCredentials = mysqlTable("student_credentials", {
  studentId: varchar("student_id", { length: 32 })
    .primaryKey()
    .references(() => students.studentId, { onDelete: "cascade", onUpdate: "cascade" }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  active: boolean("active").default(true).notNull(),
  updatedAt: updatedAt(),
})

export const authChallengeConsumptions = mysqlTable(
  "auth_challenge_consumptions",
  {
    nonce: char("nonce", { length: 36 }).primaryKey(),
    requestHash: char("request_hash", { length: 64 }).notNull(),
    previousSessionHash: char("previous_session_hash", { length: 64 }),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    consumedAt: createdAt(),
  },
  (table) => [index("auth_challenge_consumptions_expiry_idx").on(table.expiresAt)],
)

export const mockAuthState = mysqlTable("mock_auth_state", {
  id: tinyint("id", { unsigned: true }).primaryKey(),
  studentCount: int("student_count", { unsigned: true }).notNull(),
  updatedAt: updatedAt(),
})

export const mockAuthShards = mysqlTable("mock_auth_shards", {
  shardId: tinyint("shard_id", { unsigned: true }).primaryKey(),
  studentCount: int("student_count", { unsigned: true }).notNull(),
  updatedAt: updatedAt(),
})

export const studentSessions = mysqlTable(
  "student_sessions",
  {
    tokenHash: char("token_hash", { length: 64 }).primaryKey(),
    studentId: varchar("student_id", { length: 32 })
      .notNull()
      .references(() => students.studentId, { onDelete: "cascade", onUpdate: "cascade" }),
    rememberMe: boolean("remember_me").default(false).notNull(),
    idleTimeoutSeconds: int("idle_timeout_seconds", { unsigned: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" }).notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { mode: "date" }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("student_sessions_student_uq").on(table.studentId),
    index("student_sessions_student_idx").on(table.studentId),
    index("student_sessions_idle_expiry_idx").on(table.idleExpiresAt),
    index("student_sessions_absolute_expiry_idx").on(table.absoluteExpiresAt),
  ],
)

export const studentCompletedCourses = mysqlTable(
  "student_completed_courses",
  {
    studentId: varchar("student_id", { length: 32 })
      .notNull()
      .references(() => students.studentId, { onDelete: "cascade", onUpdate: "cascade" }),
    courseCode: varchar("course_code", { length: 24 })
      .notNull()
      .references(() => courses.courseCode, { onDelete: "restrict", onUpdate: "cascade" }),
    completedAt: createdAt(),
  },
  (table) => [
    primaryKey({
      name: "student_completed_courses_pk",
      columns: [table.studentId, table.courseCode],
    }),
  ],
)

export const studentPreferences = mysqlTable("student_preferences", {
  studentId: varchar("student_id", { length: 32 })
    .primaryKey()
    .references(() => students.studentId, { onDelete: "cascade", onUpdate: "cascade" }),
  theme: mysqlEnum("theme", ["system", "light", "dark"]).default("system").notNull(),
  accentPreset: mysqlEnum("accent_preset", [
    "rose",
    "coral",
    "indigo",
    "forest",
    "violet",
    "amber",
    "berry",
    "teal",
    "slate",
    "clay",
    "mint",
    "custom",
  ])
    .default("rose")
    .notNull(),
  customAccent: char("custom_accent", { length: 7 }),
  uiScale: decimal("ui_scale", { precision: 3, scale: 2, mode: "number" }).default(1).notNull(),
  contentWidth: smallint("content_width", { unsigned: true }).default(1120).notNull(),
  contentLayout: mysqlEnum("content_layout", ["fluid", "contained"]).default("fluid").notNull(),
  labelStyle: mysqlEnum("label_style", ["soft", "solid"]).default("soft").notNull(),
  detailPresentation: mysqlEnum("detail_presentation", ["drawer", "modal"])
    .default("modal")
    .notNull(),
  language: mysqlEnum("language", ["th", "en", "zh"]).default("th").notNull(),
  updatedAt: updatedAt(),
})

export const studentScheduleColors = mysqlTable(
  "student_schedule_colors",
  {
    studentId: varchar("student_id", { length: 32 })
      .notNull()
      .references(() => students.studentId, { onDelete: "cascade", onUpdate: "cascade" }),
    termId: int("term_id", { unsigned: true })
      .notNull()
      .references(() => academicTerms.id, { onDelete: "cascade", onUpdate: "cascade" }),
    courseCode: varchar("course_code", { length: 24 })
      .notNull()
      .references(() => courses.courseCode, { onDelete: "cascade", onUpdate: "cascade" }),
    colorId: mysqlEnum("color_id", [
      "rose",
      "orange",
      "amber",
      "green",
      "teal",
      "blue",
      "indigo",
      "violet",
    ]).notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      name: "student_schedule_colors_pk",
      columns: [table.studentId, table.termId, table.courseCode],
    }),
  ],
)

export const studentTermStates = mysqlTable(
  "student_term_states",
  {
    studentId: varchar("student_id", { length: 32 })
      .notNull()
      .references(() => students.studentId, { onDelete: "cascade", onUpdate: "cascade" }),
    termId: int("term_id", { unsigned: true })
      .notNull()
      .references(() => academicTerms.id, { onDelete: "restrict", onUpdate: "cascade" }),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      name: "student_term_states_pk",
      columns: [table.studentId, table.termId],
    }),
  ],
)

export const registrations = mysqlTable(
  "registrations",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    studentId: varchar("student_id", { length: 32 })
      .notNull()
      .references(() => students.studentId, { onDelete: "restrict", onUpdate: "cascade" }),
    termId: int("term_id", { unsigned: true })
      .notNull()
      .references(() => academicTerms.id, { onDelete: "restrict", onUpdate: "cascade" }),
    courseCode: varchar("course_code", { length: 24 })
      .notNull()
      .references(() => courses.courseCode, { onDelete: "restrict", onUpdate: "cascade" }),
    offeringId: bigint("offering_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => courseOfferings.id, { onDelete: "restrict", onUpdate: "cascade" }),
    sectionId: bigint("section_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => sections.id, { onDelete: "restrict", onUpdate: "cascade" }),
    status: mysqlEnum("status", ["active", "dropped", "withdrawn", "removed"]).notNull(),
    credits: decimal("credits", { precision: 4, scale: 1, mode: "number" }).notNull(),
    registeredAt: timestamp("registered_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("registrations_student_term_course_uq").on(
      table.studentId,
      table.termId,
      table.courseCode,
    ),
    index("registrations_student_term_status_idx").on(table.studentId, table.termId, table.status),
    index("registrations_section_status_idx").on(table.sectionId, table.status),
  ],
)

export const registrationEvents = mysqlTable(
  "registration_events",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    registrationId: bigint("registration_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => registrations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    studentId: varchar("student_id", { length: 32 }).notNull(),
    action: mysqlEnum("action", ["registered", "dropped", "withdrawn", "reactivated", "removed"]).notNull(),
    snapshot: json("snapshot").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("registration_events_registration_idx").on(table.registrationId)],
)

export const withdrawalRequests = mysqlTable(
  "withdrawal_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    registrationId: bigint("registration_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => registrations.id, { onDelete: "restrict", onUpdate: "cascade" }),
    studentId: varchar("student_id", { length: 32 }).notNull(),
    termId: int("term_id", { unsigned: true }).notNull(),
    snapshot: json("snapshot").$type<Record<string, unknown>>().notNull(),
    templateVersion: varchar("template_version", { length: 32 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("withdrawal_requests_student_idx").on(table.studentId, table.createdAt),
    uniqueIndex("withdrawal_requests_registration_uq").on(table.registrationId),
  ],
)

export const idempotencyRecords = mysqlTable(
  "idempotency_records",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    studentId: varchar("student_id", { length: 32 }).notNull(),
    scope: varchar("scope", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    requestHash: char("request_hash", { length: 64 }).notNull(),
    responseStatus: smallint("response_status", { unsigned: true }).notNull(),
    responseBody: json("response_body").$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("idempotency_student_scope_key_uq").on(
      table.studentId,
      table.scope,
      table.idempotencyKey,
    ),
    uniqueIndex("idempotency_student_scope_request_uq").on(
      table.studentId,
      table.scope,
      table.requestHash,
    ),
    index("idempotency_expiry_idx").on(table.expiresAt),
  ],
)

export const announcements = mysqlTable(
  "announcements",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    active: boolean("active").default(true).notNull(),
    sortOrder: int("sort_order").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("announcements_active_order_idx").on(table.active, table.sortOrder)],
)

export const studentActivities = mysqlTable(
  "student_activities",
  {
    id: char("id", { length: 36 }).primaryKey(),
    studentId: varchar("student_id", { length: 32 })
      .notNull()
      .references(() => students.studentId, { onDelete: "restrict" }),
    termId: int("term_id", { unsigned: true })
      .notNull()
      .references(() => academicTerms.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 100 }).notNull(),
    dayCode: mysqlEnum("day_code", ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]).notNull(),
    startMinute: smallint("start_minute", { unsigned: true }).notNull(),
    endMinute: smallint("end_minute", { unsigned: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("student_activities_owner_term_idx").on(table.studentId, table.termId)],
)

export const studentFavorites = mysqlTable(
  "student_favorites",
  {
    studentId: varchar("student_id", { length: 32 })
      .notNull()
      .references(() => students.studentId, { onDelete: "restrict" }),
    courseCode: varchar("course_code", { length: 24 })
      .notNull()
      .references(() => courses.courseCode, { onDelete: "restrict", onUpdate: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.studentId, table.courseCode] })],
)

export const schema = {
  studentActivities,
  studentFavorites,
  academicTerms,
  appSettings,
  catalogImports,
  courses,
  courseOfferings,
  sections,
  sectionMeetings,
  courseReviews,
  students,
  studentCredentials,
  authChallengeConsumptions,
  mockAuthState,
  mockAuthShards,
  studentSessions,
  studentCompletedCourses,
  studentPreferences,
  studentScheduleColors,
  studentTermStates,
  registrations,
  registrationEvents,
  withdrawalRequests,
  idempotencyRecords,
  announcements,
  staffUsers,
  staffSessions,
  studentAdvisors,
  staffAuditEvents,
  termRegistrationWindows,
  staffCatalogPreviews,
  catalogRevision,
  studentRegistrationProfiles,
  registrationAccessCodes,
  registrationAccessGrants,
}
