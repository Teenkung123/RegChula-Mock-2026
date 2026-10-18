import { expect, it, vi } from "vitest"
import { randomId } from "./random-id"

it("creates distinct UUID v4 keys when randomUUID is unavailable over HTTP", () => {
  vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) })
  try {
    const ids = Array.from({ length: 100 }, randomId)
    expect(new Set(ids).size).toBe(100)
    for (const id of ids) {
      expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
    }
  } finally {
    vi.unstubAllGlobals()
  }
})
