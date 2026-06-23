import type { QueryClient } from "@tanstack/react-query"

export function invalidateCollectionViews(queryClient: QueryClient, locationId?: string) {
  queryClient.invalidateQueries({ queryKey: ["collection"] })
  queryClient.invalidateQueries({ queryKey: ["collection-items"] })
  queryClient.invalidateQueries({ queryKey: ["home"] })
  if (locationId) queryClient.invalidateQueries({ queryKey: ["location", locationId] })
}

export function collectionCardReturnSearch(pathname: string) {
  const locationMatch = /^\/collection\/locations\/([^/?#]+)/.exec(pathname)
  if (locationMatch?.[1]) return { returnLocationId: decodeURIComponent(locationMatch[1]) }

  return { returnCollection: true }
}
