import { describe, expect, it } from "bun:test"
import { stopRuntime } from "./index"

describe("runtime shutdown", () => {
  it("drains before stopping and closes the database", async () => {
    const events: string[] = []

    const forced = await stopRuntime({
      beginDrain: () => events.push("drain"),
      stop: async (force) => {
        events.push(force ? "force" : "stop")
      },
      closeDatabase: async () => {
        events.push("close-db")
      },
      graceMs: 50,
    })

    expect(forced).toBe(false)
    expect(events).toEqual(["drain", "stop", "close-db"])
  })

  it("forces shutdown after the grace period", async () => {
    const events: string[] = []

    const forced = await stopRuntime({
      beginDrain: () => events.push("drain"),
      stop: (force) => {
        events.push(force ? "force" : "stop")
        return force ? Promise.resolve() : new Promise<void>(() => {})
      },
      closeDatabase: async () => {
        events.push("close-db")
      },
      graceMs: 1,
    })

    expect(forced).toBe(true)
    expect(events).toEqual(["drain", "stop", "force", "close-db"])
  })

  it("closes the database when graceful stop fails", async () => {
    const events: string[] = []

    await expect(
      stopRuntime({
        beginDrain: () => events.push("drain"),
        stop: async (force) => {
          events.push(force ? "force" : "stop")
          if (!force) throw new Error("stop failed")
        },
        closeDatabase: async () => {
          events.push("close-db")
        },
        graceMs: 50,
      }),
    ).rejects.toThrow("stop failed")

    expect(events).toEqual(["drain", "stop", "force", "close-db"])
  })
})
