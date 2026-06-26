import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client"

const csrfToken = document.querySelector("meta[name='csrf-token']")?.getAttribute("content")

export const apolloClient = new ApolloClient({
  cache: new InMemoryCache(),
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
