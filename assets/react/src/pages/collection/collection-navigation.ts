import type { ApolloClient } from "@apollo/client"
import { refetchActiveQueries } from "../../lib/apollo"

export function invalidateCollectionViews(client: ApolloClient, _locationId?: string) {
  return refetchActiveQueries(client)
}

export function collectionCardReturnSearch(pathname: string) {
  const locationMatch = /^\/collection\/locations\/([^/?#]+)/.exec(pathname)
  if (locationMatch?.[1]) return { returnLocationId: decodeURIComponent(locationMatch[1]) }

  return { returnCollection: true }
}
