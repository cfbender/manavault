import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client"
import { SetContextLink } from "@apollo/client/link/context"
import { relayStylePagination } from "@apollo/client/utilities"
import { currentCsrfToken } from "./csrf"

export function createCsrfLink() {
  return new SetContextLink((prevContext) => {
    const token = currentCsrfToken()
    const headers: Record<string, string> = { ...prevContext.headers }
    if (token) headers["x-csrf-token"] = token

    return { headers }
  })
}

const csrfLink = createCsrfLink()

const httpLink = new HttpLink({
  uri: "/api/graphql",
  credentials: "same-origin",
})

export const apolloClient = new ApolloClient({
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          // Collection browsing paginates collectionItems with fetchMore. Merge
          // relay pages in the cache (keyed by the args that define a distinct
          // list) instead of hand-rolled updateQuery callbacks at each call site.
          collectionItems: relayStylePagination(["filters", "sort"]),
          collectionItemGroups: relayStylePagination(["filters", "sort"]),
          // Card catalog search paginates with fetchMore keyed by query and sort.
          cards: relayStylePagination(["q", "sort"]),
        },
      },
    },
  }),
  link: csrfLink.concat(httpLink),
  queryDeduplication: true,
})

export function refetchActiveQueries(client: ApolloClient) {
  return client.refetchQueries({ include: "active" })
}

export function graphqlEndpointContext(endpoint?: string) {
  return endpoint ? { uri: endpoint } : undefined
}
