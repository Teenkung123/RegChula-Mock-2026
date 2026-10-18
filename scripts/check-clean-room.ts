import { readdir, readFile } from "node:fs/promises"
import { extname, join } from "node:path"

const roots = ["apps", "scripts", "tests"].map((path) => join(import.meta.dir, "..", path))
const extensions = new Set([".ts", ".tsx", ".js", ".css", ".json", ".bat"])
const forbidden = [
  /C:\\xampp\\htdocs/i,
  /C:\/xampp\/htdocs/i,
  /@elysiajs\//,
  /api\.php/i,
  /includes\/bootstrap\.php/i,
  /assets\/app\.compiled\.js/i,
]

async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const result: string[] = []
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) result.push(...(await walk(path)))
    else if (extensions.has(extname(entry.name))) result.push(path)
  }
  return result
}

const findings: string[] = []
for (const root of roots) {
  for (const path of await walk(root)) {
    const source = await readFile(path, "utf8")
    for (const pattern of forbidden) {
      if (pattern.test(source)) findings.push(`${path}: matched ${pattern}`)
    }
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"))
  process.exit(1)
}

console.log("[clean-room] Implementation contains no prohibited legacy references")
