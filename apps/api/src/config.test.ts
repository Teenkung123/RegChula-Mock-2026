import { describe, expect, it } from "bun:test"
import { randomBytes } from "node:crypto"
import { loadConfig } from "./config"

const testSecret = () => randomBytes(32).toString("base64url")

const validEnvironment = {
  APP_ENV: "development",
  AUTH_MODE: "local-mock",
  API_HOST: "127.0.0.1",
  COOKIE_SECRET: testSecret(),
  CHALLENGE_SECRET: testSecret(),
  CONFIRMATION_SECRET: testSecret(),
}

describe("runtime configuration", () => {
  it("accepts exact network origins and rejects wildcard or path origins", () => {
    const value = loadConfig({
      ...validEnvironment,
      WEB_ADDITIONAL_ORIGINS: "http://192.0.2.10:5173, http://198.51.100.10:5173",
    })
    expect(value.webOrigins).toEqual([
      "http://localhost:5173",
      "http://localhost:5174",
      "http://192.0.2.10:5173",
      "http://198.51.100.10:5173",
    ])
    for (const origin of ["*", "https://example.com/path", "https://user@example.com", "null"]) {
      expect(() => loadConfig({ ...validEnvironment, WEB_ADDITIONAL_ORIGINS: origin })).toThrow()
    }
  })

  it("uses configured frontend ports for local development origins", () => {
    const environment = {
      ...validEnvironment,
      REGCHULA_WEB_PORT: "15173",
      REGCHULA_STAFF_PORT: "15174",
    }
    expect(loadConfig(environment).webOrigins).toEqual([
      "http://localhost:15173",
      "http://localhost:15174",
    ])
    expect(
      loadConfig({ ...environment, APP_ENV: "production", AUTH_MODE: "disabled" }).webOrigins,
    ).toEqual(["http://localhost:5173"])
  })

  it("uses bounded production-safe runtime defaults", () => {
    const value = loadConfig(validEnvironment)

    expect(value.dbPoolSize).toBe(20)
    expect(value.dbPoolQueueLimit).toBe(300)
    expect(value.dbConnectTimeoutMs).toBe(5_000)
    expect(value.apiMaxInFlightRequests).toBe(300)
    expect(value.apiMaxRequestBodyBytes).toBe(65_536)
    expect(value.apiShutdownGraceMs).toBe(15_000)
    expect(value.authMode).toBe("local-mock")
    expect(value.apiHost).toBe("127.0.0.1")
  })

  it("accepts validated runtime overrides", () => {
    const value = loadConfig({
      ...validEnvironment,
      DB_POOL_SIZE: "12",
      DB_POOL_QUEUE_LIMIT: "48",
      DB_CONNECT_TIMEOUT_MS: "2500",
      API_MAX_IN_FLIGHT_REQUESTS: "80",
      API_MAX_REQUEST_BODY_BYTES: "131072",
      API_SHUTDOWN_GRACE_MS: "30000",
    })

    expect(value.dbPoolSize).toBe(12)
    expect(value.dbPoolQueueLimit).toBe(48)
    expect(value.dbConnectTimeoutMs).toBe(2_500)
    expect(value.apiMaxInFlightRequests).toBe(80)
    expect(value.apiMaxRequestBodyBytes).toBe(131_072)
    expect(value.apiShutdownGraceMs).toBe(30_000)
  })

  it("rejects unlimited or malformed queue settings", () => {
    expect(() => loadConfig({ ...validEnvironment, DB_POOL_QUEUE_LIMIT: "0" })).toThrow(
      "DB_POOL_QUEUE_LIMIT must be an integer from 1 to 1000",
    )
    expect(() => loadConfig({ ...validEnvironment, DB_POOL_SIZE: "many" })).toThrow(
      "DB_POOL_SIZE must be an integer from 1 to 100",
    )
  })

  it("fails closed for unknown environments, placeholder secrets, and unsafe mock binding", () => {
    expect(() => loadConfig({ ...validEnvironment, APP_ENV: "prod" })).toThrow("APP_ENV")
    expect(() =>
      loadConfig({
        ...validEnvironment,
        COOKIE_SECRET: "replace-with-at-least-32-random-characters",
      }),
    ).toThrow("COOKIE_SECRET")
    expect(() => loadConfig({ ...validEnvironment, COOKIE_SECRET: " ".repeat(43) })).toThrow(
      "COOKIE_SECRET",
    )
    expect(() => loadConfig({ ...validEnvironment, COOKIE_SECRET: "c".repeat(43) })).toThrow(
      "COOKIE_SECRET",
    )
    expect(() =>
      loadConfig({
        ...validEnvironment,
        CHALLENGE_SECRET: validEnvironment.COOKIE_SECRET,
      }),
    ).toThrow("must be distinct")
    expect(() => loadConfig({ ...validEnvironment, API_HOST: "0.0.0.0" })).toThrow(
      "ALLOW_CONTAINER_MOCK_AUTH",
    )
    expect(() => loadConfig({ ...validEnvironment, APP_ENV: "production" })).toThrow(
      "AUTH_MODE=local-mock",
    )
  })

  it("allows explicitly isolated container mock mode and disables auth by default", () => {
    expect(
      loadConfig({
        ...validEnvironment,
        API_HOST: "0.0.0.0",
        ALLOW_CONTAINER_MOCK_AUTH: "true",
      }).allowContainerMockAuth,
    ).toBe(true)
    expect(loadConfig({ ...validEnvironment, AUTH_MODE: undefined }).authMode).toBe("disabled")
  })
})
