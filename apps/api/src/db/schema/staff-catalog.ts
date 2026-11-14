import { bigint, char, datetime, mysqlTable, primaryKey, tinyint, int } from "drizzle-orm/mysql-core"
import { academicTerms } from "./index"
import { staffUsers } from "./staff"

export const termRegistrationWindows = mysqlTable("term_registration_windows", {
  termId: int("term_id", { unsigned: true }).primaryKey().references(() => academicTerms.id, { onDelete: "cascade" }),
  opensAt: datetime("opens_at", { mode: "date", fsp: 3 }).notNull(),
  closesAt: datetime("closes_at", { mode: "date", fsp: 3 }).notNull(),
})

export const staffCatalogPreviews = mysqlTable("staff_catalog_previews", {
  staffId: char("staff_id", { length: 36 }).notNull().references(() => staffUsers.id, { onDelete: "cascade" }),
  checksum: char("checksum", { length: 64 }).notNull(),
  catalogRevision: bigint("catalog_revision", { mode: "number", unsigned: true }).notNull(),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
}, (table) => [primaryKey({ columns: [table.staffId, table.checksum] })])

export const catalogRevision = mysqlTable("catalog_revision", {
  id: tinyint("id", { unsigned: true }).primaryKey(),
  revision: bigint("revision", { mode: "number", unsigned: true }).default(0).notNull(),
})
