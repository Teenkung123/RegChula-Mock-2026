import type { ExamSlotDto, MeetingDto } from "@regchula/api/public-types"

const meetingTime = (meeting: MeetingDto) => ({
  dayCode: meeting.dayCode ?? meeting.day_code ?? null,
  startMinute: meeting.startMinute ?? meeting.start_minute ?? null,
  endMinute: meeting.endMinute ?? meeting.end_minute ?? null,
})

export function meetingsClash(first: MeetingDto, second: MeetingDto): boolean {
  if (first.arranged || second.arranged) return false
  const firstTime = meetingTime(first)
  const secondTime = meetingTime(second)
  if (
    !firstTime.dayCode ||
    firstTime.dayCode !== secondTime.dayCode ||
    firstTime.startMinute === null ||
    firstTime.endMinute === null ||
    secondTime.startMinute === null ||
    secondTime.endMinute === null ||
    firstTime.startMinute >= firstTime.endMinute ||
    secondTime.startMinute >= secondTime.endMinute
  ) {
    return false
  }
  return (
    firstTime.startMinute < secondTime.endMinute && secondTime.startMinute < firstTime.endMinute
  )
}

export function examSlotsClash(
  first: ExamSlotDto | null | undefined,
  second: ExamSlotDto | null | undefined,
): boolean {
  const dayOf = (value: unknown) =>
    value instanceof Date
      ? Number.isNaN(value.getTime())
        ? null
        : value.toISOString().slice(0, 10)
      : (/^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(String(value))?.[1] ?? null)
  const firstDay = dayOf(first?.date)
  const secondDay = dayOf(second?.date)
  if (
    !first ||
    !second ||
    !firstDay ||
    firstDay !== secondDay ||
    first.startMinute >= first.endMinute ||
    second.startMinute >= second.endMinute
  ) {
    return false
  }
  return first.startMinute < second.endMinute && second.startMinute < first.endMinute
}
