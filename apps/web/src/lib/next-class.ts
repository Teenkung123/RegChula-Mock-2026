import type { MeetingDto, RegistrationDto } from "@regchula/api/public-types"

const weekSeconds = 7 * 24 * 60 * 60
const days = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const bangkokClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Bangkok",
  weekday: "short",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
})

export interface NextClass {
  registration: RegistrationDto
  meeting: MeetingDto
  startsAt: number
  endsAt: number
  inProgress: boolean
  overlappingCourses: number
  following: NextClass | null
}

/** Current-term weekly meetings, using Bangkok time even when the device is abroad. */
export function nextClass(registrations: RegistrationDto[], now: Date): NextClass | null {
  if (!Number.isFinite(now.getTime())) return null
  const parts = bangkokClock.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? ""
  const weekNow =
    weekdayNames.indexOf(part("weekday")) * 86400 +
    Number(part("hour")) * 3600 +
    Number(part("minute")) * 60 +
    Number(part("second"))
  const timestamp = now.getTime() - now.getMilliseconds()
  const candidates: NextClass[] = []
  for (const registration of registrations) {
    if (registration.status !== "active") continue
    for (const meeting of registration.meetings) {
      const day = days.indexOf(meeting.dayCode ?? meeting.day_code ?? "")
      const start = meeting.startMinute ?? meeting.start_minute
      const end = meeting.endMinute ?? meeting.end_minute
      if (
        meeting.arranged ||
        day < 0 ||
        start == null ||
        end == null ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end > 1440 ||
        start >= end
      )
        continue
      const startOfWeek = day * 86400 + start * 60
      const elapsed = (weekNow - startOfWeek + weekSeconds) % weekSeconds
      const inProgress = elapsed < (end - start) * 60
      const delta = inProgress ? -elapsed : (startOfWeek - weekNow + weekSeconds) % weekSeconds
      const startsAt = timestamp + delta * 1000
      candidates.push({
        registration,
        meeting,
        startsAt,
        endsAt: startsAt + (end - start) * 60000,
        inProgress,
        overlappingCourses: 0,
        following: null,
      })
    }
  }
  candidates.sort(
    (a, b) =>
      Number(b.inProgress) - Number(a.inProgress) ||
      a.startsAt - b.startsAt ||
      a.registration.courseCode.localeCompare(b.registration.courseCode),
  )
  const first = candidates[0]
  if (!first) return null
  if (first.inProgress) first.following = candidates.find((item) => !item.inProgress) ?? null
  first.overlappingCourses = new Set(
    candidates
      .filter(
        (item) =>
          item.registration.registrationId !== first.registration.registrationId &&
          item.startsAt < first.endsAt &&
          first.startsAt < item.endsAt,
      )
      .map((item) => item.registration.registrationId),
  ).size
  return first
}
