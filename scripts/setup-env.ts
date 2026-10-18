import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const target = resolve(import.meta.dir, "..", ".env.local")

if (existsSync(target)) {
  const values = new Map<string, string>()
  for (const line of (await readFile(target, "utf8")).split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (match?.[1] && match[2] !== undefined) values.set(match[1], match[2])
  }
  const secrets = [
    values.get("COOKIE_SECRET"),
    values.get("CHALLENGE_SECRET"),
    values.get("CONFIRMATION_SECRET"),
  ]
  const valid = secrets.every(
    (value) =>
      value &&
      /^[A-Za-z0-9_-]{43,128}$/.test(value) &&
      new Set(value).size >= 16 &&
      !/replace-with|regchula-development|password|secret/i.test(value),
  )
  if (!valid || new Set(secrets).size !== 3) {
    throw new Error("Existing .env.local signing secrets are invalid; file was not changed")
  }
  console.log("[setup] Existing .env.local was validated and preserved")
  process.exit(0)
}

const secret = () => randomBytes(32).toString("base64url")
const content = [
  "APP_ENV=development",
  "AUTH_MODE=local-mock",
  "API_HOST=127.0.0.1",
  "API_PORT=3000",
  "WEB_ORIGIN=http://localhost:5173",
  "DATABASE_URL=mysql://regchula:regchula_dev@127.0.0.1:3307/regchula",
  "REDIS_URL=redis://:regchula_redis_dev@127.0.0.1:6380",
  `COOKIE_SECRET=${secret()}`,
  `CHALLENGE_SECRET=${secret()}`,
  `CONFIRMATION_SECRET=${secret()}`,
  "",
].join("\n")

await writeFile(target, content, { encoding: "utf8", flag: "wx" })
console.log("[setup] Created .env.local with development-only secrets")
