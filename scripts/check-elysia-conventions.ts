import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

const forbidden = [
  { pattern: /@elysiajs\//, message: "Use migrated @elysia/* packages only" },
  {
    pattern: /\.on(Request|Parse|Transform|BeforeHandle|AfterHandle|AfterResponse|Error)\s*\(/,
    message: "Use Elysia 2 lifecycle names without on-prefix",
  },
  { pattern: /\.macro\s*\(\s*["'`]/, message: "Named Elysia 1 macro API is removed" },
]

async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name)
      if (entry.isDirectory()) return files(path)
      return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
    }),
  )
  return nested.flat()
}

const roots = [join(import.meta.dir, "..", "apps")]
const findings: string[] = []

const apiPackage = JSON.parse(
  await readFile(join(import.meta.dir, "..", "apps", "api", "package.json"), "utf8"),
) as { dependencies?: Record<string, string> }
const webPackage = JSON.parse(
  await readFile(join(import.meta.dir, "..", "apps", "web", "package.json"), "utf8"),
) as { dependencies?: Record<string, string> }
const expectedVersions = {
  elysia: "2.0.0-beta.11",
  "@elysia/openapi": "2.0.0-beta.2",
  "@elysia/eden": "2.0.0-beta.5",
}
if (apiPackage.dependencies?.elysia !== expectedVersions.elysia) {
  findings.push(`apps/api/package.json: elysia must be ${expectedVersions.elysia}`)
}
if (apiPackage.dependencies?.["@elysia/openapi"] !== expectedVersions["@elysia/openapi"]) {
  findings.push(
    `apps/api/package.json: @elysia/openapi must be ${expectedVersions["@elysia/openapi"]}`,
  )
}
if (webPackage.dependencies?.["@elysia/eden"] !== expectedVersions["@elysia/eden"]) {
  findings.push(`apps/web/package.json: @elysia/eden must be ${expectedVersions["@elysia/eden"]}`)
}

for (const root of roots) {
  for (const path of await files(root)) {
    const source = await readFile(path, "utf8")
    for (const rule of forbidden) {
      if (rule.pattern.test(source)) findings.push(`${path}: ${rule.message}`)
    }
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"))
  process.exit(1)
}

console.log("[elysia] Elysia 2 convention check passed")
