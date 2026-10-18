export interface WithdrawalDraft {
  selectedIds: number[]
  reasons: Record<number, string>
}

const keyFor = (owner: string, termId: number) =>
  `regchula_withdrawal_draft_v1:${encodeURIComponent(owner)}:${termId}`

export function readWithdrawalDraft(owner: string, termId: number): WithdrawalDraft {
  const empty = { selectedIds: [], reasons: {} }
  const raw = localStorage.getItem(keyFor(owner, termId))
  if (!raw) return empty
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return empty
  }
  if (!value || typeof value !== "object") return empty
  const draft = value as Record<string, unknown>
  if (draft.owner !== owner || draft.termId !== termId || draft.version !== 1) return empty
  const validId = (id: unknown): id is number =>
    typeof id === "number" && Number.isSafeInteger(id) && id > 0
  const selectedIds = Array.isArray(draft.selectedIds)
    ? [...new Set(draft.selectedIds.filter(validId))].slice(0, 20)
    : []
  const reasons: Record<number, string> = {}
  if (draft.reasons && typeof draft.reasons === "object") {
    for (const [id, reason] of Object.entries(draft.reasons)) {
      if (validId(Number(id)) && typeof reason === "string")
        reasons[Number(id)] = reason.slice(0, 1000)
    }
  }
  return { selectedIds, reasons }
}

export function saveWithdrawalDraft(owner: string, termId: number, draft: WithdrawalDraft): void {
  localStorage.setItem(
    keyFor(owner, termId),
    JSON.stringify({ version: 1, owner, termId, ...draft }),
  )
}
