type Environment = Record<string, string | undefined>

export type AppEnvironment = "development" | "test" | "production"
export type AuthMode = "disabled" | "local-mock"

const knownSecretValues = new Set([
  "replace-with-at-least-32-random-characters",
  "regchula-development-cookie_secret-only",
  "regchula-development-challenge_secret-only",
  "regchula-development-confirmation_secret-only",
])

const choice = <T extends string>(
  environment: Environment,
  name: string,
  allowed: readonly T[],
  fallback?: T,
): T => {
  const value = environment[name] ?? fallback
  if (value && allowed.includes(value as T)) return value as T
  throw new Error(`${name} must be one of: ${allowed.join(", ")}`)
}

const requiredSecret = (name: string, environment: Environment): string => {
  const value = environment[name]
  const normalized = value?.trim() ?? ""
  if (
    value === normalized &&
    /^[A-Za-z0-9_-]{43,128}$/.test(normalized) &&
    new Set(normalized).size >= 16 &&
    !knownSecretValues.has(normalized.toLowerCase()) &&
    !/replace-with|regchula-development|password|secret/i.test(normalized)
  )
    return normalized
  throw new Error(`${name} must be a high-entropy base64url value and not an example value`)
}

const integer = (
  environment: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const value = Number(environment[name] ?? fallback)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}

export function loadConfig(environment: Environment = process.env) {
  const appEnv = choice<AppEnvironment>(environment, "APP_ENV", [
    "development",
    "test",
    "production",
  ])
  const authMode = choice<AuthMode>(
    environment,
    "AUTH_MODE",
    ["disabled", "local-mock"],
    "disabled",
  )
  const apiHost = environment.API_HOST ?? "127.0.0.1"
  const allowContainerMockAuth = environment.ALLOW_CONTAINER_MOCK_AUTH === "true"
  const cookieSecret = requiredSecret("COOKIE_SECRET", environment)
  const challengeSecret = requiredSecret("CHALLENGE_SECRET", environment)
  const confirmationSecret = requiredSecret("CONFIRMATION_SECRET", environment)
  if (new Set([cookieSecret, challengeSecret, confirmationSecret]).size !== 3) {
    throw new Error("COOKIE_SECRET, CHALLENGE_SECRET, and CONFIRMATION_SECRET must be distinct")
  }
  if (authMode === "local-mock" && appEnv === "production") {
    throw new Error("AUTH_MODE=local-mock is not allowed in production")
  }
  if (
    authMode === "local-mock" &&
    !["127.0.0.1", "::1", "localhost"].includes(apiHost) &&
    !allowContainerMockAuth
  ) {
    throw new Error(
      "AUTH_MODE=local-mock requires a loopback API_HOST unless ALLOW_CONTAINER_MOCK_AUTH=true",
    )
  }
  const webOrigin = environment.WEB_ORIGIN ?? "http://localhost:5173"
  const webOrigins = [
    webOrigin,
    ...(appEnv === "development" || appEnv === "test" ? ["http://localhost:5174"] : []),
    ...(environment.WEB_ADDITIONAL_ORIGINS ?? "").split(","),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
  for (const origin of webOrigins) {
    const url = new URL(origin)
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
      throw new Error("Web origins must be exact HTTP(S) origins without paths or credentials")
    }
  }
  return {
    appEnv,
    authMode,
    apiHost,
    allowContainerMockAuth,
    port: integer(environment, "API_PORT", 3000, 1, 65_535),
    webOrigin,
    webOrigins,
    databaseUrl:
      environment.DATABASE_URL ?? "mysql://regchula:regchula_dev@127.0.0.1:3307/regchula",
    redisUrl: environment.REDIS_URL ?? "redis://:regchula_redis_dev@127.0.0.1:6380",
    dbPoolSize: integer(environment, "DB_POOL_SIZE", 20, 1, 100),
    dbPoolQueueLimit: integer(environment, "DB_POOL_QUEUE_LIMIT", 300, 1, 1_000),
    dbConnectTimeoutMs: integer(environment, "DB_CONNECT_TIMEOUT_MS", 5_000, 100, 60_000),
    apiMaxInFlightRequests: integer(environment, "API_MAX_IN_FLIGHT_REQUESTS", 300, 1, 10_000),
    apiMaxRequestBodyBytes: integer(
      environment,
      "API_MAX_REQUEST_BODY_BYTES",
      65_536,
      1_024,
      10_485_760,
    ),
    apiShutdownGraceMs: integer(environment, "API_SHUTDOWN_GRACE_MS", 15_000, 1_000, 120_000),
    authChallengeRatePerSecond: integer(
      environment,
      "AUTH_CHALLENGE_RATE_PER_SECOND",
      300,
      1,
      10_000,
    ),
    authChallengeBurst: integer(environment, "AUTH_CHALLENGE_BURST", 600, 1, 20_000),
    authLoginRatePerSecond: integer(environment, "AUTH_LOGIN_RATE_PER_SECOND", 250, 1, 10_000),
    authLoginBurst: integer(environment, "AUTH_LOGIN_BURST", 500, 1, 20_000),
    authGlobalChallengeRatePerSecond: integer(
      environment,
      "AUTH_GLOBAL_CHALLENGE_RATE_PER_SECOND",
      600,
      1,
      50_000,
    ),
    authGlobalLoginRatePerSecond: integer(
      environment,
      "AUTH_GLOBAL_LOGIN_RATE_PER_SECOND",
      400,
      1,
      50_000,
    ),
    mockAuthMaxStudents: integer(environment, "MOCK_AUTH_MAX_STUDENTS", 49_920, 256, 1_000_000),
    cookieSecret,
    challengeSecret,
    confirmationSecret,
  } as const
}

export const config = loadConfig()
