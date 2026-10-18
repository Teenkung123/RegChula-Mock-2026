import { problem } from "elysia"

export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
  instance: string
  code: string
  details?: Record<string, unknown>
  requestId: string
}

export function requestId(request: Request): string {
  return request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID()
}

export function appProblem(
  request: Request,
  status: number,
  code: string,
  title: string,
  detail: string,
  details?: Record<string, unknown>,
) {
  const body: Omit<ProblemDetails, "status"> = {
    type: `https://regchula.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    detail,
    instance: new URL(request.url).pathname,
    code,
    requestId: requestId(request),
  }
  if (details) body.details = details
  return problem(status, body)
}
