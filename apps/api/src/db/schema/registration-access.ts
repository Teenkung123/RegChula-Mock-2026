import { char, int, mysqlEnum, mysqlTable, primaryKey, smallint, timestamp, varchar } from "drizzle-orm/mysql-core"
import { academicTerms, students } from "./index"
import { staffUsers } from "./staff"

export const studentRegistrationProfiles = mysqlTable("student_registration_profiles", {
  studentId: varchar("student_id", { length: 32 }).primaryKey().references(() => students.studentId, { onDelete: "cascade" }),
  firstTermId: int("first_term_id", { unsigned: true }).notNull().references(() => academicTerms.id, { onDelete: "restrict" }),
  academicLevel: mysqlEnum("academic_level", ["undergraduate", "graduate"]).notNull(),
})

export const registrationAccessCodes = mysqlTable("registration_access_codes", {
  studentId: varchar("student_id", { length: 32 }).notNull().references(() => students.studentId, { onDelete: "cascade" }),
  cycleYear: smallint("cycle_year", { unsigned: true }).notNull(),
  cycleKind: mysqlEnum("cycle_kind", ["second", "summer_first"]).notNull(),
  encryptedCode: varchar("encrypted_code", { length: 255 }).notNull(),
  version: int("version", { unsigned: true }).default(1).notNull(),
  updatedBy: char("updated_by", { length: 36 }).notNull().references(() => staffUsers.id, { onDelete: "restrict" }),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().onUpdateNow().notNull(),
}, (table) => [primaryKey({ columns: [table.studentId, table.cycleYear, table.cycleKind] })])

export const registrationAccessGrants = mysqlTable("registration_access_grants", {
  studentId: varchar("student_id", { length: 32 }).notNull().references(() => students.studentId, { onDelete: "cascade" }),
  termId: int("term_id", { unsigned: true }).notNull().references(() => academicTerms.id, { onDelete: "cascade" }),
  cycleYear: smallint("cycle_year", { unsigned: true }).notNull(),
  cycleKind: mysqlEnum("cycle_kind", ["second", "summer_first"]).notNull(),
  codeVersion: int("code_version", { unsigned: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.studentId, table.termId] })])
