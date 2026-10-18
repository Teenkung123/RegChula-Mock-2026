import { config } from "../config"

export function originIsAllowed(request: Request): boolean {
  const origin = request.headers.get("origin")
  return origin === null || config.webOrigins.includes(origin)
}

export function canonicalStudentId(value: string): string {
  return value.trim().toLowerCase()
}
