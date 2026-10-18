type Interval = { startMinute: number; endMinute: number }

/** The same weighted axis positions headers, grid rules, and partial-hour meeting endpoints. */
export function compactTimetableAxis(hours: number[], meetings: Interval[]) {
  const weights = hours.map((hour) =>
    meetings.some(
      ({ startMinute, endMinute }) => startMinute < (hour + 1) * 60 && endMinute > hour * 60,
    )
      ? 6
      : 2.5,
  )
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const offset = (minute: number) => {
    const distance = hours.reduce(
      (sum, hour, index) =>
        sum + (weights[index] ?? 0) * Math.max(0, Math.min(1, (minute - hour * 60) / 60)),
      0,
    )
    return total ? (distance / total) * 100 : 0
  }
  return { weights, total, offset }
}
