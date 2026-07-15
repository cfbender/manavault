import { ApolloClient, ApolloLink, gql, InMemoryCache, Observable } from "@apollo/client"
import { afterEach, describe, expect, it } from "vitest"
import { createCsrfLink } from "../src/lib/apollo.ts"

const nativeGlobal = globalThis as typeof globalThis & {
  Capacitor?: { isNativePlatform: () => boolean }
}

function setCsrfToken(token: string) {
  const meta = document.createElement("meta")
  meta.name = "csrf-token"
  meta.content = token
  document.head.replaceChildren(meta)
}

function clientCapturingTokens(tokens: Array<string | null>) {
  const captureLink = new ApolloLink((operation) => {
    tokens.push(operation.getContext().headers["x-csrf-token"] ?? null)

    return new Observable((observer) => {
      observer.next({ data: { __typename: "Mutation" } })
      observer.complete()
    })
  })

  return new ApolloClient({
    cache: new InMemoryCache(),
    link: createCsrfLink().concat(captureLink),
  })
}

async function mutate(client: ApolloClient) {
  await client.mutate({
    mutation: gql`
      mutation RefreshCsrfToken {
        __typename
      }
    `,
    fetchPolicy: "no-cache",
  })
}

afterEach(() => {
  document.head.replaceChildren()
  delete nativeGlobal.Capacitor
})

describe("Apollo CSRF request headers", () => {
  it("reads the current browser page token for every mutation instead of a module-load token", async () => {
    const tokens: Array<string | null> = []

    setCsrfToken("stale-browser-token")
    const client = clientCapturingTokens(tokens)

    setCsrfToken("current-browser-token")
    await mutate(client)

    setCsrfToken("rotated-browser-token")
    await mutate(client)

    expect(tokens).toEqual(["current-browser-token", "rotated-browser-token"])
  })

  it("uses the current remote page token in a Capacitor shell without a native bypass", async () => {
    const tokens: Array<string | null> = []
    nativeGlobal.Capacitor = { isNativePlatform: () => true }

    setCsrfToken("stale-native-token")
    const client = clientCapturingTokens(tokens)

    setCsrfToken("current-native-token")
    await mutate(client)

    expect(tokens).toEqual(["current-native-token"])
  })
})
