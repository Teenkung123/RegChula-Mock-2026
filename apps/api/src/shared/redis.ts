import { RedisClient } from "bun"
import { config } from "../config"

export class SharedStateUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Shared session state is unavailable", { cause })
    this.name = "SharedStateUnavailableError"
  }
}

const client = new RedisClient(config.redisUrl, {
  connectionTimeout: 2_000,
  idleTimeout: 0,
  autoReconnect: true,
  maxRetries: 3,
  enableOfflineQueue: true,
  enableAutoPipelining: true,
})
let connecting: Promise<void> | null = null

const ensureConnected = async (): Promise<void> => {
  if (client.connected) return
  connecting ??= client.connect().finally(() => {
    connecting = null
  })
  await connecting
}

export async function sharedState<T>(operation: (redis: RedisClient) => Promise<T>): Promise<T> {
  try {
    await ensureConnected()
    return await operation(client)
  } catch (error) {
    throw new SharedStateUnavailableError(error)
  }
}

export const pingSharedState = async (): Promise<void> => {
  await sharedState(async (redis) => {
    const response = await redis.send("PING", [])
    if (response !== "PONG") throw new Error("Unexpected shared-state health response")
  })
}

export async function waitForSharedState(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (true) {
    try {
      await pingSharedState()
      return
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await Bun.sleep(Math.min(1_000, Math.max(0, deadline - Date.now())))
    }
  }
}

export const closeSharedState = (): void => client.close()

export async function consumeGlobalRate(scope: string, limit: number): Promise<boolean> {
  const count = await sharedState((redis) =>
    redis.send("EVAL", [
      "local k=KEYS[1]..':'..redis.call('TIME')[1]; local n=redis.call('INCR',k); if n==1 then redis.call('EXPIRE',k,2) end; return n",
      "1",
      `regchula:rate:${scope}`,
    ]),
  )
  return Number(count) <= limit
}
