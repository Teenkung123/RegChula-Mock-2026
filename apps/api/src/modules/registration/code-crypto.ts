import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { config } from "../../config"

const key = createHash("sha256").update(`registration-code:${config.confirmationSecret}`).digest()

export function encryptRegistrationCode(code: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const data = Buffer.concat([cipher.update(code, "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url")
}

export function decryptRegistrationCode(value: string): string {
  const buffer = Buffer.from(value, "base64url")
  const cipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(0, 12))
  cipher.setAuthTag(buffer.subarray(12, 28))
  return Buffer.concat([cipher.update(buffer.subarray(28)), cipher.final()]).toString("utf8")
}

export function matchesRegistrationCode(encrypted: string, submitted: string): boolean {
  const stored = Buffer.from(decryptRegistrationCode(encrypted))
  const input = Buffer.from(submitted.trim())
  return stored.length === input.length && timingSafeEqual(stored, input)
}
