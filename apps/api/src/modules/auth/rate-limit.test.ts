import { describe, expect, it } from "bun:test"
import { TokenBucket } from "./rate-limit"

describe("authentication token bucket", () => {
  it("bounds bursts and refills at the configured rate", () => {
    const bucket = new TokenBucket(2, 3, 1_000)
    expect(bucket.consume(1_000).allowed).toBe(true)
    expect(bucket.consume(1_000).allowed).toBe(true)
    expect(bucket.consume(1_000).allowed).toBe(true)
    expect(bucket.consume(1_000)).toEqual({ allowed: false, retryAfterSeconds: 1 })
    expect(bucket.consume(1_500).allowed).toBe(true)
  })

  it("never accumulates more than the fixed burst", () => {
    const bucket = new TokenBucket(100, 2, 0)
    expect(bucket.consume(60_000).allowed).toBe(true)
    expect(bucket.consume(60_000).allowed).toBe(true)
    expect(bucket.consume(60_000).allowed).toBe(false)
  })
})
