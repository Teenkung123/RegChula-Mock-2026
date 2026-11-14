import { catalogUploadSummary } from "./catalog-upload"

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Uint8Array>) => void) | null
  postMessage: (message: unknown) => void
}

scope.onmessage = (event) => {
  try {
    scope.postMessage({ ok: true, result: catalogUploadSummary(event.data) })
  } catch (error) {
    scope.postMessage({ ok: false, message: error instanceof Error ? error.message : "Invalid catalog" })
  }
}
