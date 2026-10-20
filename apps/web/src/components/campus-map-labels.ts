export interface MapLabelCandidate {
  id: string
  x: number
  y: number
  width: number
  height: number
  priority: number
}

export interface MapLabelRect {
  left: number
  top: number
  right: number
  bottom: number
}

const margin = 8
const gap = 4
const validRect = (rect: MapLabelRect) =>
  [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) &&
  rect.right > rect.left &&
  rect.bottom > rect.top
const overlaps = (a: MapLabelRect, b: MapLabelRect) =>
  a.left < b.right + gap &&
  a.right > b.left - gap &&
  a.top < b.bottom + gap &&
  a.bottom > b.top - gap

/** Place nearby roof labels without covering route markers, controls, or each other. */
export function layoutCampusBuildingLabels(
  candidates: readonly MapLabelCandidate[],
  viewport: { width: number; height: number },
  blocked: readonly MapLabelRect[],
  maxLabels: number,
): Array<{ id: string; left: number; top: number }> {
  const { width, height } = viewport
  if (
    ![width, height, maxLabels].every(Number.isFinite) ||
    width <= margin * 2 ||
    height <= margin * 2 ||
    maxLabels < 1
  )
    return []
  const limit = Math.min(64, Math.floor(maxLabels))
  const centerDistance = (candidate: MapLabelCandidate) =>
    Math.hypot(candidate.x - width / 2, candidate.y - height / 2)
  const ordered = candidates
    .filter(
      (candidate) =>
        typeof candidate.id === "string" &&
        candidate.id.trim().length > 0 &&
        [candidate.x, candidate.y, candidate.width, candidate.height, candidate.priority].every(
          Number.isFinite,
        ) &&
        candidate.width > 0 &&
        candidate.height > 0 &&
        candidate.width <= width - margin * 2 &&
        candidate.height <= height - margin * 2 &&
        candidate.x >= 0 &&
        candidate.x <= width &&
        candidate.y >= 0 &&
        candidate.y <= height,
    )
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        centerDistance(a) - centerDistance(b) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) ||
        a.x - b.x ||
        a.y - b.y ||
        a.width - b.width ||
        a.height - b.height,
    )
  const occupied = blocked.filter(validRect)
  const seen = new Set<string>()
  const placed: Array<{ id: string; left: number; top: number }> = []
  for (const candidate of ordered) {
    if (seen.has(candidate.id)) continue
    seen.add(candidate.id)
    const left = candidate.x - candidate.width / 2
    const shift = 32
    for (const offset of [0, -shift, shift]) {
      const top = candidate.y - candidate.height / 2 + offset
      const rect = { left, top, right: left + candidate.width, bottom: top + candidate.height }
      if (
        rect.left < margin ||
        rect.top < margin ||
        rect.right > width - margin ||
        rect.bottom > height - margin ||
        occupied.some((other) => overlaps(rect, other))
      )
        continue
      occupied.push(rect)
      placed.push({ id: candidate.id, left, top })
      break
    }
    if (placed.length >= limit) break
  }
  return placed
}
