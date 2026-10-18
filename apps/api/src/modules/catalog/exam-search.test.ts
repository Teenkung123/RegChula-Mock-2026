import { Database, type SQLQueryBindings } from "bun:sqlite"
import { afterAll, describe, expect, it } from "bun:test"
import { MySqlDialect } from "drizzle-orm/mysql-core"
import { normalizeCourseSearch } from "./cache"
import { examSearchCondition, type CourseSearch } from "./service"

const database = new Database(":memory:")
database.exec(`create table course_offerings (
  id integer primary key,
  midterm_date text,
  midterm_start_minute integer,
  midterm_end_minute integer,
  final_date text,
  final_start_minute integer,
  final_end_minute integer
)`)

const monday = "2026-09-14"
const tuesday = "2026-09-15"
const sunday = "2026-09-20"
const fixtures: SQLQueryBindings[][] = [
  [1, monday, 540, 720, null, null, null],
  [2, null, null, null, monday, 600, 660],
  // Monday satisfies the day but only Tuesday satisfies the time window.
  [3, monday, 480, 720, tuesday, 540, 720],
  [4, monday, 540, null, null, null, null],
  [5, null, 540, 720, null, null, null],
  [6, sunday, 540, 720, null, null, null],
  [7, monday, 540, 780, null, null, null],
  [8, monday, 720, 540, null, null, null],
  [9, monday, null, 720, null, null, null],
  [10, monday, 540, 540, null, null, null],
  [11, null, null, null, monday, 540, null],
]
const insert = database.prepare("insert into course_offerings values (?, ?, ?, ?, ?, ?, ?)")
for (const fixture of fixtures) insert.run(...fixture)
insert.finalize()

afterAll(() => database.close())

function matches(filters: Partial<CourseSearch>): number[] {
  const normalized = normalizeCourseSearch({ ...filters, page: 1, pageSize: 20 })
  const condition = examSearchCondition(normalized)
  const compiled = condition
    ? new MySqlDialect().sqlToQuery(condition)
    : { sql: "true", params: [] }
  // SQLite has no WEEKDAY function. Adapt that function alone to its equivalent:
  // MySQL Monday=0..Sunday=6; SQLite strftime Sunday=0..Saturday=6.
  // Execute the production predicate and its bound parameters unchanged otherwise.
  const predicate = compiled.sql.replaceAll(
    /weekday\(([^)]+)\)/g,
    "((cast(strftime('%w', $1) as integer) + 6) % 7)",
  )
  const statement = database.prepare<{ id: number }, SQLQueryBindings[]>(
    `select id from course_offerings where ${predicate} order by id`,
  )
  try {
    return statement.all(...(compiled.params as SQLQueryBindings[])).map((row) => row.id)
  } finally {
    statement.finalize()
  }
}

describe("exam search SQL", () => {
  it("matches midterm or final and includes both exact time boundaries", () => {
    expect(matches({ examDays: "MO", examStartTime: "09:00", examEndTime: "12:00" })).toEqual([
      1, 2,
    ])
  })

  it("requires weekday and time constraints to match the same slot", () => {
    expect(matches({ examDays: "MO", examStartTime: "09:00", examEndTime: "12:00" })).not.toContain(
      3,
    )
    expect(matches({ examDays: "TU", examStartTime: "09:00", examEndTime: "12:00" })).toEqual([3])
  })

  it("uses Monday-based weekdays including Sunday and multiple selections", () => {
    expect(matches({ examDays: "SU" })).toEqual([6])
    expect(matches({ examDays: "MO,TU", examStartTime: "09:00", examEndTime: "12:00" })).toEqual([
      1, 2, 3,
    ])
  })

  it("excludes incomplete, reversed, and zero-duration slots even with only a weekday", () => {
    expect(matches({ examDays: "MO" })).toEqual([1, 2, 3, 7])
  })

  it("contains the entire exam rather than accepting partial overlap", () => {
    expect(matches({ examStartTime: "09:00", examEndTime: "12:00" })).toEqual([1, 2, 3, 6])
    expect(matches({ examDays: "MO", examStartTime: "09:01", examEndTime: "12:00" })).toEqual([2])
    expect(matches({ examDays: "MO", examStartTime: "09:00", examEndTime: "11:59" })).toEqual([2])
  })

  it("supports independent start and end bounds", () => {
    expect(matches({ examStartTime: "10:00" })).toEqual([2])
    expect(matches({ examEndTime: "11:00" })).toEqual([2])
    expect(matches({ examStartTime: "12:00" })).toEqual([])
  })

  it("does not restrict results when no exam filters are selected", () => {
    expect(examSearchCondition(normalizeCourseSearch({ page: 1, pageSize: 20 }))).toBeUndefined()
    expect(matches({})).toEqual(fixtures.map((fixture) => fixture[0] as number))
  })
})
