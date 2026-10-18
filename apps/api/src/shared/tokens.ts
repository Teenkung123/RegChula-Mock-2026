import { createHash, createHmac, timingSafeEqual } from "node:crypto"

interface ExpiringPayload {
  exp: number
}

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url")

function signature(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url")
}

export function signToken<T extends ExpiringPayload>(payload: T, secret: string): string {
  const encoded = encode(payload)
  return `${encoded}.${signature(encoded, secret)}`
}

export function verifyToken<T extends ExpiringPayload>(token: string, secret: string): T | null {
  const [encoded, suppliedSignature, extra] = token.split(".")
  if (!encoded || !suppliedSignature || extra) return null
  const expectedSignature = signature(encoded, secret)
  const supplied = Buffer.from(suppliedSignature)
  const expected = Buffer.from(expectedSignature)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T
    if (!Number.isFinite(payload.exp) || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}
