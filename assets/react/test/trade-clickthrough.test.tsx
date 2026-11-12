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
import type { ReactNode } from "react"
import { afterEach, expect, test, vi } from "vitest"
import { CardDetailPage } from "../src/pages/cards/card-detail-page"
import { CardDocument } from "../src/pages/cards/data"
import { collectionCardReturnSearch } from "../src/pages/collection/collection-navigation"
import { BinderListDocument, WantsListDocument } from "../src/pages/trade/documents"
import { TradeMatchesDocument } from "../src/pages/trade/match-documents"
import { MatchTab } from "../src/pages/trade/match-tab"
import { ShareBinderPage } from "../src/pages/trade/share-binder-page"
import { ShareWantsPage } from "../src/pages/trade/share-wants-page"
import { WantRow } from "../src/pages/trade/want-row"

afterEach(cleanup)

test("collectionCardReturnSearch returns back to binder on trade routes", () => {
  expect(collectionCardReturnSearch("/trade")).toEqual({ returnTradeTab: "binder" })
  expect(collectionCardReturnSearch("/trade/")).toEqual({ returnTradeTab: "binder" })
  expect(collectionCardReturnSearch("/collection")).toEqual({ returnCollection: true })
  expect(collectionCardReturnSearch("/collection/locations/loc-1")).toEqual({
    returnLocationId: "loc-1",
  })
})

test("want rows show prices and link to the card page without triggering row controls", async () => {
  const onChangeQuantity = vi.fn()
  const onRemove = vi.fn()

  renderWithRouter(
    <div>
      <WantRow
        want={{
          id: "1",
          quantity: 2,
          imageUrl: "https://example.test/lotus.jpg",
          priceText: "$12.50",
          card: {
            id: "card-generic",
            oracleId: "oracle-generic",
            name: "Ancient Tomb",
            typeLine: "Land",
            manaCost: null,
          },
          printing: null,
        }}
        onChangeQuantity={onChangeQuantity}
        onRemove={onRemove}
      />
      <WantRow
        want={{
          id: "2",
          quantity: 1,
          imageUrl: "https://example.test/bolt.jpg",
          priceText: "$3.25",
          card: {
            id: "card-specific",
            oracleId: "oracle-specific",
            name: "Lightning Bolt",
            typeLine: "Instant",
            manaCost: "{R}",
          },
          printing: {
            setCode: "m11",
            collectorNumber: "146",
            imageUrl: "https://example.test/bolt.jpg",
          },
        }}
        onChangeQuantity={onChangeQuantity}
        onRemove={onRemove}
      />
    </div>,
  )

  const genericLink = await screen.findByRole("link", { name: /Ancient Tomb/i })
  expect(genericLink.getAttribute("href")).toBe("/cards/card-generic?returnTradeTab=wants")
  expect(screen.getByText("from $12.50")).toBeTruthy()

  const specificLink = screen.getByRole("link", { name: /Lightning Bolt/i })
  expect(specificLink.getAttribute("href")).toBe("/cards/card-specific?returnTradeTab=wants")
  expect(screen.getByText("$3.25")).toBeTruthy()

  await userEvent.click(screen.getByRole("button", { name: "Increase quantity of Ancient Tomb" }))
  expect(onChangeQuantity).toHaveBeenCalledWith(3)

  await userEvent.click(screen.getByRole("button", { name: "Remove Lightning Bolt from wants" }))
  expect(onRemove).toHaveBeenCalledTimes(1)
})

test("trade match rows link to the card page with returnTradeTab=matches and show prices", async () => {
  const matchMock = {
    request: {
      query: TradeMatchesDocument,
      variables: { url: undefined, text: "1 Sol Ring\n1 Black Lotus" },
    },
    result: {
      data: {
        tradeMatches: {
          sourceName: null,
          entryCount: 2,
          unrecognized: [],
          binderMatches: [
            {
              cardId: "card-sol-ring",
              cardName: "Sol Ring",
              oracleId: "oracle-sol-ring",
              theirQuantity: 1,
              items: [
                {
                  id: "item-1",
                  quantity: 2,
                  condition: "near_mint",
                  finish: "foil",
                  forTrade: true,
                  priceText: "$4.50",
                  printing: {
                    id: "printing-sol",
                    setCode: "c21",
                    collectorNumber: "263",
                    imageUrl: "https://example.test/sol.jpg",
                    card: { id: "card-sol-ring", name: "Sol Ring" },
                  },
                },
              ],
            },
          ],
          wantMatches: [
            {
              cardId: "card-lotus",
              cardName: "Black Lotus",
              oracleId: "oracle-lotus",
              theirQuantity: 1,
              want: {
                id: "want-1",
                quantity: 1,
                imageUrl: "https://example.test/lotus.jpg",
                priceText: "$90k",
                printing: null,
                card: { id: "card-lotus", name: "Black Lotus" },
              },
            },
          ],
        },
      },
    },
  }

  renderWithRouter(<MatchTab />, [matchMock])

  await userEvent.click(await screen.findByRole("button", { name: "Paste list" }))
  await userEvent.type(screen.getByPlaceholderText(/Jund Charm/i), "1 Sol Ring\n1 Black Lotus")
  await userEvent.click(screen.getByRole("button", { name: "Find matches" }))

  const wantLink = await screen.findByRole("link", { name: "Black Lotus" })
  expect(wantLink.getAttribute("href")).toBe("/cards/card-lotus?returnTradeTab=matches")
  expect(screen.getByText("from $90k")).toBeTruthy()

  await userEvent.click(screen.getByRole("button", { name: "It's their wants" }))

  const binderLink = await screen.findByRole("link", { name: "Sol Ring" })
  expect(binderLink.getAttribute("href")).toBe("/cards/card-sol-ring?returnTradeTab=matches")
  expect(screen.getByText("$4.50")).toBeTruthy()
})

test("shared wants and binder rows open card details and prices without private queries", async () => {
  const cardDetailMock = {
    request: { query: CardDocument, variables: { id: "card-lotus" } },
    result: {
      data: {
        card: {
          id: "card-lotus",
          oracleId: "oracle-lotus",
          name: "Black Lotus",
          typeLine: "Artifact",
          manaCost: "{0}",
          oracleText: "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
          colorIdentity: [],
          gameChanger: false,
          edhrecRank: null,
          edhrecCommanderRank: null,
          edhrecSaltiness: null,
          deckCategory: "ramp",
          deckThemes: [],
          oracleTags: [],
          legalities: [{ format: "vintage", status: "restricted" }],
          rulings: [],
          printings: {
            pageInfo: { endCursor: null, hasNextPage: false },
            edges: [
              {
                node: {
                  id: "printing-lea",
                  scryfallId: "scryfall-lea",
                  setCode: "lea",
                  setName: "Limited Edition Alpha",
                  collectorNumber: "232",
                  lang: "en",
                  rarity: "rare",
                  ownedCount: 0,
                  finishes: ["nonfoil"],
                  imageUrl: "https://example.test/lotus.jpg",
                  backImageUrl: null,
                  artCropUrl: null,
                  releasedAt: "1993-08-05",
                  prices: { usd: "100000.00" },
                  priceText: "$100k",
                },
              },
            ],
          },
        },
      },
    },
  }

  const wantsShare = renderWithRouter(<ShareWantsPage token="token-wants" />, [
    {
      request: { query: WantsListDocument, variables: { id: "token-wants" } },
      result: {
        data: {
          wantsList: {
            entries: [
              {
                cardId: "card-lotus",
                cardName: "Black Lotus",
                quantity: 1,
                typeLine: "Artifact",
                setCode: null,
                collectorNumber: null,
                imageUrl: "https://example.test/lotus.jpg",
                priceText: "$90k",
              },
            ],
          },
        },
      },
    },
    cardDetailMock,
  ])

  expect(await screen.findByText("from $90k")).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: /Black Lotus/i }))
  expect(await screen.findByRole("dialog", { name: "Black Lotus" })).toBeTruthy()
  expect((await screen.findAllByText("Limited Edition Alpha")).length).toBeGreaterThan(0)
  expect(screen.getAllByText("$100k").length).toBeGreaterThan(0)
  expect(screen.queryByText("Synergies")).toBeNull()
  wantsShare.unmount()

  renderWithRouter(<ShareBinderPage token="token-binder" />, [
    {
      request: { query: BinderListDocument, variables: { id: "token-binder" } },
      result: {
        data: {
          binderList: {
            entries: [
              {
                cardId: "card-lotus",
                cardName: "Black Lotus",
                quantity: 2,
                typeLine: "Artifact",
                setCode: "lea",
                collectorNumber: "232",
                imageUrl: "https://example.test/lotus.jpg",
                finish: "nonfoil",
                condition: "near_mint",
                priceText: "$100k",
              },
            ],
          },
        },
      },
    },
    cardDetailMock,
  ])

  expect(await screen.findByText("$100k")).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: /Black Lotus/i }))
  expect(await screen.findByRole("dialog", { name: "Black Lotus" })).toBeTruthy()
  expect((await screen.findAllByText("Limited Edition Alpha")).length).toBeGreaterThan(0)
})

test("card detail page renders a back link to the originating trade tab", async () => {
  const cardMock = {
    request: { query: CardDocument, variables: { id: "card-lotus" } },
    result: {
      data: {
        card: {
          id: "card-lotus",
          oracleId: "oracle-lotus",
          name: "Black Lotus",
          typeLine: "Artifact",
          manaCost: "{0}",
          oracleText: null,
          colorIdentity: [],
          gameChanger: false,
          edhrecRank: null,
          edhrecCommanderRank: null,
          edhrecSaltiness: null,
          deckCategory: null,
          deckThemes: [],
          oracleTags: [],
          legalities: [],
          rulings: [],
          printings: { pageInfo: { endCursor: null, hasNextPage: false }, edges: [] },
        },
      },
    },
  }

  renderWithRouter(
    <CardDetailPage id="card-lotus" query="" returnTradeTab="wants" hidePrivateControls />,
    [cardMock],
  )

  const backLink = await screen.findByRole("link", { name: "Back to wants" })
  expect(backLink.getAttribute("href")).toBe("/trade?tab=wants")
})

function renderWithRouter(ui: ReactNode, mocks: ConstructorParameters<typeof MockLink>[0] = []) {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new MockLink(mocks),
  })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => ui,
  })
  const cardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/cards/$id",
    component: () => null,
  })
  const tradeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/trade",
    component: () => null,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([indexRoute, cardRoute, tradeRoute]),
  })

  return render(
    <ApolloProvider client={client}>
      <RouterProvider router={router} />
    </ApolloProvider>,
  )
}
