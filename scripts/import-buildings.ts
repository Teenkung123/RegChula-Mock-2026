import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const sourceUrl =
  "https://www2.reg.chula.ac.th/servlet/com.dtm.chula.general.servlet.BuildingServlet"
const target = resolve(import.meta.dir, "..", "apps", "web", "src", "data", "buildings.json")

type Building = {
  id: string
  code: string
  nameTh: string
  nameEn: string
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

export function parseBuildings(html: string): Building[] {
  const form = html.slice(html.indexOf('<FORM NAME="BuildingForm">'))
  const rows = [...form.matchAll(/<TR\b[^>]*>([\s\S]*?)<\/TR>/gi)].map((match) =>
    [...match[1].matchAll(/<FONT\b[^>]*>([\s\S]*?)<\/FONT>/gi)].map((font) => clean(font[1])),
  )
  const buildings: Building[] = []

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (!row || row.length < 2) continue
    const code = row[0]
    const nameTh = row.at(-1) ?? ""
    if (!code || !nameTh) continue

    const following = rows[index + 1]
    const nameEn = following?.length === 1 ? (following[0] ?? "") : ""
    buildings.push({ id: code + "-" + (buildings.length + 1), code, nameTh, nameEn })
  }

  return buildings
}

async function fetchBuildingSource() {
  const child = Bun.spawn(
    ["curl.exe", "--fail", "--silent", "--show-error", "--location", sourceUrl],
    { stdout: "pipe", stderr: "pipe" },
  )
  const content = new Response(child.stdout).arrayBuffer()
  const error = new Response(child.stderr).text()
  if ((await child.exited) !== 0) {
    throw new Error("Building source request failed: " + (await error).trim())
  }
  return content
}

const html = new TextDecoder("windows-874").decode(await fetchBuildingSource())
const buildings = parseBuildings(html)
if (buildings.length < 50 || buildings.some((building) => !building.code || !building.nameTh)) {
  throw new Error("Building source did not produce a complete list")
}

await mkdir(resolve(target, ".."), { recursive: true })
await writeFile(target, JSON.stringify(buildings, null, 2) + "\n", "utf8")
console.log(
  "[buildings] Imported " + buildings.length + " records from the public CU building list",
)
