import type { SectionDto } from "@regchula/api/public-types"

type SeatCounts = Pick<SectionDto, "baselineEnrolled" | "capacity" | "localActive">

export const occupiedSeatCount = (section: SeatCounts): number =>
  Math.max(0, Math.min(section.capacity, section.baselineEnrolled + section.localActive))

export const sectionSeatLabel = (section: SeatCounts & Pick<SectionDto, "sectionNo">): string =>
  `ตอน ${section.sectionNo} · ${occupiedSeatCount(section)}/${section.capacity}`
