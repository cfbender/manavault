import * as AbsintheSocket from "@absinthe/socket"
import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
  Observable,
  split,
} from "@apollo/client"
import { SetContextLink } from "@apollo/client/link/context"
import { relayStylePagination } from "@apollo/client/utilities"
import { getMainDefinition } from "@apollo/client/utilities"
import { print } from "graphql"
import { Socket as PhoenixSocket } from "phoenix"
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

function createSubscriptionLink() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const phoenixSocket = new PhoenixSocket(`${protocol}//${window.location.host}/socket`)
  const absintheSocket = AbsintheSocket.create(phoenixSocket)

  return new ApolloLink(
    (operation) =>
      new Observable((observer) => {
        const notifier = AbsintheSocket.send(absintheSocket, {
          operation: print(operation.query),
          variables: operation.variables,
        })
        const socketObserver = {
          onAbort: (error: Error) => observer.error(error),
          onError: (error: Error) => observer.error(error),
          onResult: (result: object) => observer.next(result),
        }
        const observedNotifier = AbsintheSocket.observe(absintheSocket, notifier, socketObserver)

        return () => {
          AbsintheSocket.unobserveOrCancel(absintheSocket, observedNotifier, socketObserver)
        }
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
