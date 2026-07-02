import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client"
import { relayStylePagination } from "@apollo/client/utilities"

const csrfToken = document.querySelector("meta[name='csrf-token']")?.getAttribute("content")

export const apolloClient = new ApolloClient({
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          // Collection browsing paginates collectionItems with fetchMore. Merge
          // relay pages in the cache (keyed by the args that define a distinct
          // list) instead of hand-rolled updateQuery callbacks at each call site.
          collectionItems: relayStylePagination(["filters", "sort"]),
        },
      },
    },
  }),
  link: new HttpLink({
    uri: "/api/graphql",
    credentials: "same-origin",
    headers: {
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
  }),
  queryDeduplication: true,
})

export function refetchActiveQueries(client: ApolloClient) {
  return client.refetchQueries({ include: "active" })
}

export function graphqlEndpointContext(endpoint?: string) {
  return endpoint ? { uri: endpoint } : undefined
}
