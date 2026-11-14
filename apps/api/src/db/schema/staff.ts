import {
  bigint,
  boolean,
  char,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core"

export const staffUsers = mysqlTable("staff_users", {
  id: char("id", { length: 36 }).primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  role: mysqlEnum("role", ["admin", "advisor"]).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
})

export const staffSessions = mysqlTable(
  "staff_sessions",
  {
    tokenHash: char("token_hash", { length: 64 }).primaryKey(),
    staffId: char("staff_id", { length: 36 })
      .notNull()
      .references(() => staffUsers.id),
    idleExpiresAt: timestamp("idle_expires_at", { mode: "date" }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("staff_sessions_staff_idx").on(table.staffId)],
)

// The migration defines the student foreign key; students live in the main schema module.
export const studentAdvisors = mysqlTable(
  "student_advisors",
  {
    studentId: varchar("student_id", { length: 32 }).primaryKey(),
    staffId: char("staff_id", { length: 36 })
      .notNull()
      .references(() => staffUsers.id),
  },
  (table) => [index("student_advisors_staff_idx").on(table.staffId)],
)

export const staffAuditEvents = mysqlTable(
  "staff_audit_events",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    staffId: char("staff_id", { length: 36 })
      .notNull()
      .references(() => staffUsers.id),
    action: varchar("action", { length: 80 }).notNull(),
    target: varchar("target", { length: 255 }).notNull(),
    details: json("details").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("staff_audit_events_actor_idx").on(table.staffId, table.createdAt)],
)
