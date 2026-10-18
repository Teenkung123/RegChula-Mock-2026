import type { ScheduleColorsDto } from "@regchula/api/public-types"
import {
  defaultScheduleColor,
  readableForeground,
  SCHEDULE_COLOR_PALETTE,
  type ScheduleColorId,
} from "@regchula/appearance"
import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query"
import { type CSSProperties, useState } from "react"
import { getScheduleColors, resetScheduleColor, setScheduleColor } from "./api"

export type CourseColorStyle = CSSProperties & {
  "--course-color": string
  "--course-ink": string
}

export function courseColorStyle(colorId: ScheduleColorId): CourseColorStyle {
  const color = SCHEDULE_COLOR_PALETTE[colorId]
  return { "--course-color": color, "--course-ink": readableForeground(color) }
}

export function useCourseColors() {
  const client = useQueryClient()
  const [saveError, setSaveError] = useState<Error | null>(null)
  const mutationKey = ["save-schedule-color"]
  const pendingCourses = useMutationState({
    filters: { mutationKey, status: "pending" },
    select: (mutation) => (mutation.state.variables as { courseCode: string }).courseCode,
  })
  const query = useQuery({
    queryKey: ["schedule-colors"],
    queryFn: getScheduleColors,
    staleTime: 60_000,
  })
  const custom = new Map(query.data?.colors.map((entry) => [entry.courseCode, entry.colorId]))
  const colorIdFor = (courseCode: string) =>
    custom.get(courseCode) ?? defaultScheduleColor(courseCode)
  const mutation = useMutation({
    mutationKey,
    mutationFn: ({
      courseCode,
      colorId,
    }: {
      courseCode: string
      colorId: ScheduleColorId | null
    }) => (colorId ? setScheduleColor(courseCode, colorId) : resetScheduleColor(courseCode)),
    async onMutate(change) {
      setSaveError(null)
      await client.cancelQueries({ queryKey: ["schedule-colors"] })
      const previous = client.getQueryData<ScheduleColorsDto>(["schedule-colors"])
      if (previous) {
        client.setQueryData<ScheduleColorsDto>(["schedule-colors"], {
          ...previous,
          colors: change.colorId
            ? [
                ...previous.colors.filter((entry) => entry.courseCode !== change.courseCode),
                { courseCode: change.courseCode, colorId: change.colorId },
              ]
            : previous.colors.filter((entry) => entry.courseCode !== change.courseCode),
        })
      }
      return previous
    },
    onError(_error, change, previous) {
      setSaveError(_error)
      if (!previous) return
      client.setQueryData<ScheduleColorsDto>(["schedule-colors"], (current) => {
        if (!current) return current
        return {
          ...current,
          colors: [
            ...current.colors.filter((entry) => entry.courseCode !== change.courseCode),
            ...previous.colors.filter((entry) => entry.courseCode === change.courseCode),
          ],
        }
      })
    },
    onSettled() {
      // A refetch while another save is pending would overwrite its optimistic color.
      if (client.isMutating({ mutationKey }) === 1) {
        return client.invalidateQueries({ queryKey: ["schedule-colors"] })
      }
    },
  })
  const changeColor = (courseCode: string, colorId: ScheduleColorId | null) => {
    const alreadySaving = client
      .getMutationCache()
      .findAll({ mutationKey, status: "pending" })
      .some((entry) => (entry.state.variables as { courseCode: string }).courseCode === courseCode)
    if (!query.isSuccess || alreadySaving) return
    mutation.mutate({ courseCode, colorId })
  }
  return {
    colorIdFor,
    styleFor: (courseCode: string) => courseColorStyle(colorIdFor(courseCode)),
    save: (courseCode: string, colorId: ScheduleColorId) => changeColor(courseCode, colorId),
    reset: (courseCode: string) => changeColor(courseCode, null),
    error: saveError ?? query.error,
    isPending: (courseCode: string) => !query.isSuccess || pendingCourses.includes(courseCode),
  }
}
