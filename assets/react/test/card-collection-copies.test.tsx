import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { CardCollectionCopiesPanel } from "../src/pages/cards/card-collection-copies"
import { CardCollectionItemsDocument } from "../src/pages/cards/data"

afterEach(cleanup)

test("shows deck allocations with the copy's usual storage location", async () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new MockLink([
      {
        request: {
          query: CardCollectionItemsDocument,
          variables: { cardId: "card-1" },
        },
        result: {
          data: {
            collectionItemCount: 3,
            collectionItems: {
              pageInfo: { endCursor: null, hasNextPage: false },
              edges: [
                {
                  node: {
                    id: "item-1",
                    quantity: 2,
                    condition: "near_mint",
                    language: "en",
                    finish: "foil",
                    notes: null,
                    forTrade: false,
                    forTradeQuantity: 0,
                    priceText: "$19.39",
                    purchasePriceCents: 1594,
                    purchasePriceText: "$15.94",
                    valueGainText: "$3.45",
                    valueGainPercentText: "21.64%",
                    allocatedQuantity: 2,
                    allocationDecks: [
                      { quantity: 2, deck: { id: "deck-1", name: "Lands Matter" } },
                    ],
                    location: { id: "location-1", name: "Green Binder" },
                    printing: {
                      id: "printing-1",
                      scryfallId: "scryfall-1",
                      setCode: "m3c",
                      setName: "Modern Horizons 3 Commander",
                      collectorNumber: "409",
                      imageUrl: null,
                      rarity: "rare",
                      card: {
                        id: "card-1",
                        oracleId: "oracle-1",
                        name: "Yavimaya",
                        typeLine: "Land",
                      },
                    },
                  },
                },
                {
                  node: {
                    id: "item-2",
                    quantity: 1,
                    condition: "near_mint",
                    language: "en",
                    finish: "foil",
                    notes: null,
                    forTrade: false,
                    forTradeQuantity: 0,
                    priceText: "$33.38",
                    purchasePriceCents: 667,
                    purchasePriceText: "$6.67",
                    valueGainText: "$26.71",
                    valueGainPercentText: "400.45%",
                    allocatedQuantity: 0,
                    allocationDecks: [],
                    location: null,
                    printing: {
                      id: "printing-2",
                      scryfallId: "scryfall-2",
                      setCode: "sld",
                      setName: "Secret Lair Drop",
                      collectorNumber: "2813",
                      imageUrl: null,
                      rarity: "rare",
                      card: {
                        id: "card-1",
                        oracleId: "oracle-1",
                        name: "Yavimaya",
                        typeLine: "Land",
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ]),
  })

  render(
    <ApolloProvider client={client}>
      <CardCollectionCopiesPanel cardId="card-1" />
    </ApolloProvider>,
  )

  expect(await screen.findByText(/In Lands Matter ×2 \(otherwise Green Binder\)/)).toBeTruthy()
  expect(screen.getByText(/Unfiled · Current \$33\.38/)).toBeTruthy()
})
