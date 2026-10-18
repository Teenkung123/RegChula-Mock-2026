import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getFavorites, getMe, setFavorite } from "./api"

export function useFavorites(termId: number | undefined) {
  const client = useQueryClient()
  const me = useQuery({ queryKey: ["me"], queryFn: getMe })
  const owner = me.data?.studentId
  const query = useQuery({
    queryKey: ["favorites", owner, termId],
    queryFn: () => getFavorites(termId as number),
    enabled: Boolean(owner && termId),
  })
  const mutation = useMutation({
    mutationFn: ({ courseCode, favorite }: { courseCode: string; favorite: boolean }) =>
      setFavorite(courseCode, favorite),
    onSuccess: () => client.invalidateQueries({ queryKey: ["favorites", owner] }),
  })
  return { ...query, mutation, codes: new Set(query.data?.map((course) => course.courseCode)) }
}
