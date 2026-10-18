import { afterEach, describe, expect, it } from "vitest"
import { readWithdrawalDraft, saveWithdrawalDraft } from "./withdrawal-draft"

afterEach(() => localStorage.clear())

describe("withdrawal draft persistence", () => {
  it("restores selections and reasons only for the same student and term", () => {
    const draft = {
      selectedIds: [42],
      reasons: { 42: "ต้องการปรับแผนการเรียน", 43: "เก็บไว้เมื่อต้องเลือกอีกครั้ง" },
    }
    saveWithdrawalDraft("student-a", 12, draft)
    expect(readWithdrawalDraft("student-a", 12)).toEqual(draft)
    expect(readWithdrawalDraft("student-b", 12).selectedIds).toEqual([])
    expect(readWithdrawalDraft("student-a", 13).selectedIds).toEqual([])
  })
  it("rejects mismatched owners and invalid cached payloads", () => {
    localStorage.setItem(
      "regchula_withdrawal_draft_v1:student-a:12",
      JSON.stringify({ version: 1, owner: "student-b", termId: 12, selectedIds: [42] }),
    )
    expect(readWithdrawalDraft("student-a", 12).selectedIds).toEqual([])
    localStorage.setItem("regchula_withdrawal_draft_v1:student-a:12", "malformed")
    expect(readWithdrawalDraft("student-a", 12).selectedIds).toEqual([])
  })
})
