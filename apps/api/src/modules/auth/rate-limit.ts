export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

export class TokenBucket {
  #tokens: number
  #lastRefillMs: number

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
    nowMs = Date.now(),
  ) {
    this.#tokens = burst
    this.#lastRefillMs = nowMs
  }

  consume(nowMs = Date.now()): RateLimitDecision {
    const elapsedSeconds = Math.max(0, nowMs - this.#lastRefillMs) / 1000
    this.#tokens = Math.min(this.burst, this.#tokens + elapsedSeconds * this.ratePerSecond)
    this.#lastRefillMs = nowMs
    if (this.#tokens >= 1) {
      this.#tokens -= 1
      return { allowed: true, retryAfterSeconds: 0 }
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((1 - this.#tokens) / this.ratePerSecond)),
    }
  }
}
