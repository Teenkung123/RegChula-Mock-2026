export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export const staffSessionExpiredEvent = "regchula:staff-session-expired"

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" })
  const value: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/v1/staff/auth/login") {
      window.dispatchEvent(new Event(staffSessionExpiredEvent))
    }
    const problem =
      value && typeof value === "object" ? (value as { detail?: string; title?: string }) : {}
    throw new ApiError(
      response.status,
      problem.detail ?? problem.title ?? "ไม่สามารถดำเนินการได้ โปรดลองอีกครั้ง",
    )
  }
  if (!value || typeof value !== "object" || !("data" in value)) {
    throw new ApiError(502, "ได้รับข้อมูลจากระบบไม่ครบถ้วน โปรดลองอีกครั้ง")
  }
  return (value as { data: T }).data
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "ไม่สามารถเชื่อมต่อระบบได้ โปรดลองอีกครั้ง"
}
