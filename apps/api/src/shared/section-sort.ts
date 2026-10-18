const sectionCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" })

export function compareSectionNo(first: string, second: string): number {
  const compared = sectionCollator.compare(first, second)
  return compared !== 0 ? compared : first.localeCompare(second)
}
