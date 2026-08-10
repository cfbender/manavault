import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { CollectionPageHeader } from "../src/pages/collection/collection-page-header"
import { CollectionValueDashboardDocument } from "../src/pages/collection/documents"
import { deserializeCollectionTab } from "../src/pages/collection/storage"
import { CollectionValueDashboard } from "../src/pages/collection/value-dashboard"

afterEach(cleanup)

test("moves collection value into a persisted tab", async () => {
  const onSelectTab = vi.fn()

  render(
    <CollectionPageHeader
      activeTab="locations"
      itemCounts={{ all: 10, recent: 2, available: 3, unfiled: 1 }}
      locationCount={2}
      onAddItem={() => {}}
      onAddLocation={() => {}}
      onAutoSort={() => {}}
      onExportCsv={() => {}}
      onImport={() => {}}
      onSellCards={() => {}}
      onSelectTab={onSelectTab}
    />,
  )

  expect(screen.queryByText("Market value")).toBeNull()
  await userEvent.click(screen.getByRole("tab", { name: "Value" }))
  expect(onSelectTab).toHaveBeenCalledWith("value")
  expect(deserializeCollectionTab('"value"')).toBe("value")
})

test("shows source-dependent totals, position charts, gains, and losses", async () => {
  renderDashboard({
    pricingSettings: { source: "manapool" },
    collectionValueDashboard: {
      itemCount: 7,
      positionCount: 3,
      gainPositionCount: 1,
      lossPositionCount: 1,
      unchangedPositionCount: 1,
      summary: {
        totalPriceCents: 12_500,
        totalPriceText: "$125",
        purchasePriceCents: 10_000,
        purchasePriceText: "$100",
        valueGainCents: 2_500,
        valueGainText: "+$25",
        valueGainPercent: 25,
        valueGainPercentText: "+25%",
      },
      biggestGains: [position("gain", "Stronghold", 6_000, 2_000, 4_000)],
      biggestLosses: [position("loss", "Downshift", 1_500, 3_000, -1_500)],
    },
  })

  expect(await screen.findByRole("heading", { name: "Collection value" })).toBeTruthy()
  expect(screen.getByText("ManaPool market")).toBeTruthy()
  expect(screen.getByText("7 owned cards across 3 printings")).toBeTruthy()
  expect(screen.getByText("+$25 (+25%)")).toBeTruthy()
  expect(
    screen.getByRole("img", { name: "Market value compared with purchase basis" }),
  ).toBeTruthy()
  expect(screen.getByRole("img", { name: "1 above basis, 1 at basis, 1 below basis" })).toBeTruthy()
  expect(screen.getByRole("heading", { name: "Biggest gains" })).toBeTruthy()
  expect(screen.getByText("Stronghold")).toBeTruthy()
  expect(screen.getByRole("heading", { name: "Biggest losses" })).toBeTruthy()
  expect(screen.getByText("Downshift")).toBeTruthy()
})

test("teaches an empty collection how to start value tracking", async () => {
  renderDashboard({
    pricingSettings: { source: "scryfall" },
    collectionValueDashboard: {
      itemCount: 0,
      positionCount: 0,
      gainPositionCount: 0,
      lossPositionCount: 0,
      unchangedPositionCount: 0,
      summary: {
        totalPriceCents: 0,
        totalPriceText: "$0",
        purchasePriceCents: 0,
        purchasePriceText: "$0",
        valueGainCents: 0,
        valueGainText: "$0",
        valueGainPercent: null,
        valueGainPercentText: null,
      },
      biggestGains: [],
      biggestLosses: [],
    },
  })

  expect(await screen.findByRole("heading", { name: "No collection value yet" })).toBeTruthy()
  expect(
    screen.getByText(
      "Add cards to your collection to track market value, purchase basis, gains, and losses.",
    ),
  ).toBeTruthy()
})

function renderDashboard(data: {
  pricingSettings: { source: string }
  collectionValueDashboard: Record<string, unknown>
}) {
  const link = new MockLink([
    {
      request: { query: CollectionValueDashboardDocument },
      result: { data },
    },
  ])
  const client = new ApolloClient({ cache: new InMemoryCache(), link })

  return render(
    <ApolloProvider client={client}>
      <CollectionValueDashboard />
    </ApolloProvider>,
  )
}

function position(
  slug: string,
  name: string,
  totalPriceCents: number,
  purchasePriceCents: number,
  valueGainCents: number,
) {
  const signedGain =
    valueGainCents > 0 ? `+$${valueGainCents / 100}` : `-$${Math.abs(valueGainCents) / 100}`

  return {
    quantity: 2,
    totalPriceCents,
    totalPriceText: `$${totalPriceCents / 100}`,
    purchasePriceCents,
    purchasePriceText: `$${purchasePriceCents / 100}`,
    valueGainCents,
    valueGainText: signedGain,
    valueGainPercent: null,
    valueGainPercentText: null,
    printing: {
      id: `printing-${slug}`,
      scryfallId: `scryfall-${slug}`,
      setCode: "tst",
      setName: "Test Set",
      collectorNumber: "1",
      imageUrl: null,
      card: { id: `card-${slug}`, name },
    },
  }
}
