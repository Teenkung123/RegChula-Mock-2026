import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const localPath = resolve(root, ".env.local")
const runtimePath = resolve(root, ".env.k8s.local")
const mysqlPath = resolve(root, ".env.k8s.mysql.local")
const redisPath = resolve(root, ".env.k8s.redis.local")

const parse = (source: string): Map<string, string> => {
  const values = new Map<string, string>()
  for (const line of source.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (match?.[1] && match[2] !== undefined) values.set(match[1], match[2])
  }
  return values
}

const local = parse(await readFile(localPath, "utf8"))
const validSecret = (value: string | undefined) =>
  Boolean(
    value &&
      /^[A-Za-z0-9_-]{43,128}$/.test(value) &&
      new Set(value).size >= 16 &&
      !/replace-with|regchula-development|password|secret/i.test(value),
  )
for (const name of ["COOKIE_SECRET", "CHALLENGE_SECRET", "CONFIRMATION_SECRET"]) {
  if (!validSecret(local.get(name))) throw new Error(`${name} is invalid in .env.local`)
}

const existingSecretFiles = [runtimePath, mysqlPath, redisPath].filter(existsSync)
if (existingSecretFiles.length > 0 && existingSecretFiles.length < 3) {
  throw new Error(
    "Kubernetes secret files are incomplete; refusing to overwrite the existing subset",
  )
}

if (existingSecretFiles.length === 3) {
  const runtimeSource = await readFile(runtimePath, "utf8")
  const runtime = parse(runtimeSource)
  const mysql = parse(await readFile(mysqlPath, "utf8"))
  const redis = parse(await readFile(redisPath, "utf8"))
  const databaseUrl = runtime.get("DATABASE_URL")
  const redisUrl = runtime.get("REDIS_URL")
  const database = databaseUrl ? new URL(databaseUrl) : null
  const redisDatabase = redisUrl ? new URL(redisUrl) : null
  const runtimeSecrets = [
    runtime.get("COOKIE_SECRET"),
    runtime.get("CHALLENGE_SECRET"),
    runtime.get("CONFIRMATION_SECRET"),
  ]
  const validExisting =
    database?.hostname === "regchula-mysql" &&
    redisDatabase?.hostname === "regchula-redis" &&
    validSecret(mysql.get("MYSQL_ROOT_PASSWORD")) &&
    validSecret(mysql.get("MYSQL_PASSWORD")) &&
    validSecret(redis.get("REDIS_PASSWORD")) &&
    database.password === mysql.get("MYSQL_PASSWORD") &&
    redisDatabase.password === redis.get("REDIS_PASSWORD") &&
    runtimeSecrets.every(validSecret) &&
    new Set(runtimeSecrets).size === 3 &&
    runtime.get("COOKIE_SECRET") === local.get("COOKIE_SECRET") &&
    runtime.get("CHALLENGE_SECRET") === local.get("CHALLENGE_SECRET") &&
    runtime.get("CONFIRMATION_SECRET") === local.get("CONFIRMATION_SECRET")
  if (validExisting) {
    const additionalOrigins = local.get("WEB_ADDITIONAL_ORIGINS")
    const networkRuntime =
      additionalOrigins === undefined
        ? runtimeSource
        : runtimeSource.replace(/^WEB_ADDITIONAL_ORIGINS=.*\r?\n?/gm, "").trimEnd() +
          `\nWEB_ADDITIONAL_ORIGINS=${additionalOrigins}\n`
    const tunedRuntime = networkRuntime
      .replace(/^DB_POOL_QUEUE_LIMIT=.*$/m, "DB_POOL_QUEUE_LIMIT=120")
      .replace(/^API_MAX_IN_FLIGHT_REQUESTS=.*$/m, "API_MAX_IN_FLIGHT_REQUESTS=200")
    await writeFile(runtimePath, tunedRuntime, { encoding: "utf8" })
    console.log("[setup] Existing Kubernetes secrets were preserved and runtime budgets refreshed")
    process.exit(0)
  }
  throw new Error("Existing Kubernetes secret files are invalid; refusing to overwrite them")
}

const secret = () => randomBytes(32).toString("base64url")
const mysqlRootPassword = secret()
const mysqlPassword = secret()
const redisPassword = secret()
const database = new URL("mysql://regchula@regchula-mysql:3306/regchula")
database.password = mysqlPassword
const redisUrl = new URL("redis://regchula-redis:6379")
redisUrl.password = redisPassword

const runtime = [
  "APP_ENV=development",
  "AUTH_MODE=local-mock",
  "ALLOW_CONTAINER_MOCK_AUTH=true",
  "API_HOST=0.0.0.0",
  "API_PORT=3000",
  "WEB_ORIGIN=http://localhost:5173",
  `WEB_ADDITIONAL_ORIGINS=${local.get("WEB_ADDITIONAL_ORIGINS") ?? ""}`,
  `DATABASE_URL=${database.toString()}`,
  `REDIS_URL=${redisUrl.toString()}`,
  "DB_POOL_SIZE=12",
  "DB_POOL_QUEUE_LIMIT=120",
  "DB_CONNECT_TIMEOUT_MS=5000",
  "API_MAX_IN_FLIGHT_REQUESTS=200",
  "API_MAX_REQUEST_BODY_BYTES=65536",
  "API_SHUTDOWN_GRACE_MS=15000",
  "AUTH_CHALLENGE_RATE_PER_SECOND=300",
  "AUTH_CHALLENGE_BURST=600",
  "AUTH_LOGIN_RATE_PER_SECOND=250",
  "AUTH_LOGIN_BURST=500",
  "AUTH_GLOBAL_CHALLENGE_RATE_PER_SECOND=600",
  "AUTH_GLOBAL_LOGIN_RATE_PER_SECOND=400",
  "MOCK_AUTH_MAX_STUDENTS=49920",
  `COOKIE_SECRET=${local.get("COOKIE_SECRET")}`,
  `CHALLENGE_SECRET=${local.get("CHALLENGE_SECRET")}`,
  `CONFIRMATION_SECRET=${local.get("CONFIRMATION_SECRET")}`,
  "",
].join("\n")
const mysql = [
  `MYSQL_ROOT_PASSWORD=${mysqlRootPassword}`,
  "MYSQL_DATABASE=regchula",
  "MYSQL_USER=regchula",
  `MYSQL_PASSWORD=${mysqlPassword}`,
  "TZ=Asia/Bangkok",
  "",
].join("\n")
const redis = [`REDIS_PASSWORD=${redisPassword}`, ""].join("\n")

await writeFile(runtimePath, runtime, { encoding: "utf8" })
await writeFile(mysqlPath, mysql, { encoding: "utf8" })
await writeFile(redisPath, redis, { encoding: "utf8" })
console.log(
  "[setup] Created ignored Kubernetes runtime, MySQL, and Redis secrets without printing values",
)
