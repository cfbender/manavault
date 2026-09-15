import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { CardSynergies } from "../src/pages/cards/card-synergies"
import { CardEdhrecDocument } from "../src/pages/cards/data"

afterEach(cleanup)

test("reveals the four card synergy views and links local cards into ManaVault", async () => {
  renderSynergies({
    data: {
      cardEdhrec: {
        url: "https://edhrec.com/cards/black-lotus",
        sections: [
          section("Top Commanders", "topcommanders", [
            entry("Local Commander", {
              card: {
                id: "local-card-id",
                oracleId: "local-oracle-id",
                name: "Local Commander",
                typeLine: "Legendary Creature — Wizard",
                primaryPrinting: {
                  id: "local-printing-id",
                  scryfallId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                  imageUrl: "https://example.test/local.jpg",
                },
              },
            }),
          ]),
          section("New Commanders", "newcommanders", [entry("New Commander")]),
          section("New Cards", "newcards", [entry("Fresh Card", { lift: 1.75 })]),
          section("High Lift Cards", "highliftcards", [entry("Strong Pairing", { lift: 4.25 })]),
        ],
      },
    },
  })

  const summaryLabel = await screen.findByText("Synergies")
  const disclosure = summaryLabel.closest("details")
  expect(disclosure?.hasAttribute("open")).toBe(false)

  await userEvent.click(summaryLabel)

  expect(disclosure?.hasAttribute("open")).toBe(true)
  expect(await screen.findByRole("heading", { name: "Top Commanders" })).toBeTruthy()
  expect(screen.getByRole("heading", { name: "New Commanders" })).toBeTruthy()
  expect(screen.getByRole("heading", { name: "New Cards" })).toBeTruthy()
  expect(screen.getByRole("heading", { name: "High Lift Cards" })).toBeTruthy()
  expect(screen.getByText("4.3× lift · 120 decks")).toBeTruthy()

  const localLink = screen.getByRole("link", { name: "View Local Commander in ManaVault" })
  expect(localLink.getAttribute("href")).toBe("/cards/local-card-id")

  const remoteLink = screen.getByRole("link", { name: "View Strong Pairing on EDHREC" })
  expect(remoteLink.getAttribute("href")).toBe("https://edhrec.com/cards/strong-pairing")
})

test("keeps the disclosure usable when EDHREC is unavailable", async () => {
  renderSynergies({ error: new Error("upstream unavailable") })

  await userEvent.click(await screen.findByText("Synergies"))

  expect(
    await screen.findByText(
      "EDHREC relationships are unavailable right now. The rest of this card record is still ready to use.",
    ),
  ).toBeTruthy()
})

function renderSynergies(result: { data?: Record<string, unknown>; error?: Error }) {
  const request = { query: CardEdhrecDocument, variables: { name: "Black Lotus" } }
  const mock = result.error ? { request, error: result.error } : { request, result }
  const link = new MockLink([mock])
  const client = new ApolloClient({ cache: new InMemoryCache(), link })
  const rootRoute = createRootRoute()
  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/test",
    component: () => <CardSynergies cardName="Black Lotus" />,
  })
  const cardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/cards/$id",
    component: () => null,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/test"] }),
    routeTree: rootRoute.addChildren([testRoute, cardRoute]),
  })

  return render(
    <ApolloProvider client={client}>
      <RouterProvider router={router} />
    </ApolloProvider>,
  )
}

function section(header: string, tag: string, cards: ReturnType<typeof entry>[]) {
  return { header, tag, cards }
}

function entry(
  name: string,
  overrides: Partial<{
    lift: number | null
    card: {
      id: string
      oracleId: string
      name: string
      typeLine: string
      primaryPrinting: {
        id: string
        scryfallId: string
        imageUrl: string
      }
    } | null
  }> = {},
) {
  return {
    name,
    scryfallId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    lift: null,
    numDecks: 120,
    potentialDecks: 400,
    url: `https://edhrec.com/cards/${name.toLowerCase().replaceAll(" ", "-")}`,
    card: null,
    ...overrides,
  }
}
