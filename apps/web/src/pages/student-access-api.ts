import { ApiError } from "../lib/api"

export type RegistrationAccessState = {
  termId: number | null
  status: "open" | "code_required" | "profile_required" | "closed"
  authorized: boolean
}

async function request<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  })
  const value: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, value)
  if (!value || typeof value !== "object" || !("data" in value)) throw new ApiError(500, null)
  return value.data as T
}

export const getRegistrationAccess = () =>
  request<RegistrationAccessState>("/api/v1/registration-access")

export const submitRegistrationCode = (code: string) =>
  request<RegistrationAccessState>("/api/v1/registration-access", { code })

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<unknown>("/api/v1/auth/password", { currentPassword, newPassword })
