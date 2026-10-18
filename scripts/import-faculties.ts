import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const sourceUrl = "https://cas.reg.chula.ac.th/servlet/com.dtm.chula.general.servlet.FacultyServlet"
const departmentUrl = (facultyCode: string) =>
  "https://cas.reg.chula.ac.th/servlet/com.dtm.chula.general.servlet.DepartmentServlet?code=" +
  encodeURIComponent(facultyCode)
const fieldUrl = (departmentCode: string) =>
  "https://cas.reg.chula.ac.th/servlet/com.dtm.chula.general.servlet.SectionServlet?code=" +
  encodeURIComponent(departmentCode)
const target = resolve(import.meta.dir, "..", "apps", "web", "src", "data", "faculties.json")

export type FieldOfStudy = {
  id: string
  code: string
  nameTh: string
  nameEn: string
}

export type Department = FieldOfStudy & { fields: FieldOfStudy[] }

export type Faculty = {
  id: string
  code: string
  nameTh: string
  nameEn: string
  departments: Department[]
}

function clean(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim()
}

function parseEntries(html: string, servlet: "DepartmentServlet" | "SectionServlet") {
  const expression = new RegExp(
    servlet +
      '\\?code=([A-Za-z0-9]+)[\\s\\S]*?NAME=\\"descthai\\"[\\s\\S]*?<FONT\\b[^>]*>([\\s\\S]*?)<\\/FONT>[\\s\\S]*?NAME=\\"desceng\\"[\\s\\S]*?<FONT\\b[^>]*>([\\s\\S]*?)<\\/FONT>',
    "gi",
  )
  const seen = new Set<string>()
  const entries: Array<{ code: string; nameTh: string; nameEn: string }> = []
  for (const match of html.matchAll(expression)) {
    const code = clean(match[1] ?? "")
    const nameTh = clean(match[2] ?? "")
    const nameEn = clean(match[3] ?? "")
    if (!code || !nameTh || seen.has(code)) continue
    seen.add(code)
    entries.push({ code, nameTh, nameEn })
  }
  return entries
}

export function parseFaculties(html: string): Faculty[] {
  return parseEntries(html, "DepartmentServlet").map((faculty) => ({
    ...faculty,
    id: faculty.code,
    departments: [],
  }))
}

export function parseDepartments(html: string, facultyCode: string): Department[] {
  return parseEntries(html, "SectionServlet").map((department) => ({
    ...department,
    id: facultyCode + "-" + department.code,
    fields: [],
  }))
}

export function parseFields(html: string, departmentCode: string): FieldOfStudy[] {
  if (!html.includes('NAME="FacultyRightButtomForm"')) {
    throw new Error("Unexpected field-of-study response for " + departmentCode)
  }
  const blocks = html.split(/<TABLE\s+ID="Table1"[^>]*>/gi).slice(1)
  return blocks.map((block) => {
    const values = [...block.matchAll(/<FONT\b[^>]*>([\s\S]*?)<\/FONT>/gi)].map((match) =>
      clean(match[1] ?? ""),
    )
    const [code = "", nameTh = "", nameEn = ""] = values
    if (!/^[A-Za-z0-9]+$/.test(code) || !nameTh)
      throw new Error("Invalid field-of-study row for " + departmentCode)
    return { id: departmentCode + "-" + code, code, nameTh, nameEn }
  })
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolvePause) => setTimeout(resolvePause, milliseconds))

async function fetchPublicHtml(url: string) {
  let lastError = ""
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const child = Bun.spawn(
      [
        "curl.exe",
        "--fail",
        "--silent",
        "--show-error",
        "--location",
        "--connect-timeout",
        "10",
        "--max-time",
        "30",
        url,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const content = new Response(child.stdout).arrayBuffer()
    const error = new Response(child.stderr).text()
    if ((await child.exited) === 0) {
      return new TextDecoder("windows-874").decode(await content)
    }
    lastError = (await error).trim()
    if (attempt < 3) await pause(attempt * 750)
  }
  throw new Error("Faculty source request failed for " + url + ": " + lastError)
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, map: (item: T) => Promise<R>) {
  const results: R[] = []
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await map(items[index] as T)
    }
  })
  await Promise.all(workers)
  return results
}

const faculties = parseFaculties(await fetchPublicHtml(sourceUrl))
if (faculties.length < 20) throw new Error("Faculty source did not produce a complete faculty list")

const directory = await mapWithConcurrency(faculties, 2, async (faculty) => ({
  ...faculty,
  departments: parseDepartments(await fetchPublicHtml(departmentUrl(faculty.code)), faculty.code),
}))
const departmentCount = directory.reduce((count, faculty) => count + faculty.departments.length, 0)
if (departmentCount < 100 || directory.some((faculty) => faculty.departments.length === 0)) {
  throw new Error("Faculty source did not produce a complete department list")
}

let completed = 0
await mapWithConcurrency(
  directory.flatMap((faculty) => faculty.departments),
  2,
  async (department) => {
    department.fields = parseFields(
      await fetchPublicHtml(fieldUrl(department.code)),
      department.code,
    )
    completed += 1
    if (completed % 50 === 0 || completed === departmentCount) {
      console.log(`[faculties] Loaded fields for ${completed}/${departmentCount} departments`)
    }
  },
)
const fieldCount = directory.reduce(
  (count, faculty) =>
    count + faculty.departments.reduce((sum, department) => sum + department.fields.length, 0),
  0,
)

await mkdir(resolve(target, ".."), { recursive: true })
await writeFile(target, JSON.stringify(directory, null, 2) + "\n", "utf8")
console.log(
  "[faculties] Imported " +
    directory.length +
    " faculties and " +
    departmentCount +
    " departments and " +
    fieldCount +
    " fields of study from the public CU directory",
)
