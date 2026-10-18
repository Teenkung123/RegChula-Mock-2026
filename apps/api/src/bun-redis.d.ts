declare module "bun" {
  export class RedisClient {
    constructor(
      url?: string,
      options?: {
        connectionTimeout?: number
        idleTimeout?: number
        autoReconnect?: boolean
        maxRetries?: number
        enableOfflineQueue?: boolean
        enableAutoPipelining?: boolean
      },
    )
    get(key: string): Promise<string | null>
    del(key: string): Promise<number>
    exists(key: string): Promise<boolean>
    expire(key: string, seconds: number): Promise<boolean>
    send(command: string, args: string[]): Promise<unknown>
    connect(): Promise<void>
    readonly connected: boolean
    close(): void
  }
}
