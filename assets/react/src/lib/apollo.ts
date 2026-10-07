import { ApolloClient, HttpLink, InMemoryCache, split } from "@apollo/client"
import { SetContextLink } from "@apollo/client/link/context"
import { GraphQLWsLink } from "@apollo/client/link/subscriptions"
import { relayStylePagination } from "@apollo/client/utilities"
import { getMainDefinition } from "@apollo/client/utilities"
import { createClient } from "graphql-ws"
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

/** The `connection_init` payload: the server checks the page's CSRF token. */
export function subscriptionConnectionParams() {
  const token = currentCsrfToken()
  return token ? { csrfToken: token } : {}
}

export function subscriptionSocketUrl(location: Location = window.location) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${location.host}/api/graphql/ws`
}

function createSubscriptionLink() {
  return new GraphQLWsLink(
    createClient({
      url: subscriptionSocketUrl,
      connectionParams: subscriptionConnectionParams,
      // The server closes sockets idle for 60 s; pings keep live ones open.
      keepAlive: 30_000,
    }),
  )
}

const transportLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query)
    return definition.kind === "OperationDefinition" && definition.operation === "subscription"
  },
  createSubscriptionLink(),
  csrfLink.concat(httpLink),
)

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
  link: transportLink,
  queryDeduplication: true,
})

export function refetchActiveQueries(client: ApolloClient) {
  return client.refetchQueries({ include: "active" })
}

export function graphqlEndpointContext(endpoint?: string) {
  return endpoint ? { uri: endpoint } : undefined
}
