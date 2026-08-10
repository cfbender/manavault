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
import { afterEach, expect, test, vi } from "vitest"
import { CollectionPageHeader } from "../src/pages/collection/collection-page-header"
import {
  BulkUpdateCollectionItemsDocument,
  CollectionValueDashboardDocument,
} from "../src/pages/collection/documents"
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
  expect(screen.getByRole("link", { name: "Stronghold" }).getAttribute("href")).toBe(
    "/cards/card-gain?returnCollection=true",
  )
  expect(screen.getByRole("heading", { name: "Biggest losses" })).toBeTruthy()
  expect(screen.getByText("Downshift")).toBeTruthy()
  expect(screen.getByRole("link", { name: "Downshift" }).getAttribute("href")).toBe(
    "/cards/card-loss?returnCollection=true",
  )
})

test("quick edits the per-card purchase basis for every item in a printing position", async () => {
  const gain = position("gain", "Stronghold", 6_000, 2_000, 4_000)
  const data = dashboardData({ biggestGains: [gain] })

  renderDashboard(data, [
    {
      request: {
        query: BulkUpdateCollectionItemsDocument,
        variables: {
          selector: { ids: ["item-gain-1", "item-gain-2"] },
          input: { purchasePriceCents: 1_234 },
        },
      },
      result: { data: { bulkUpdateCollectionItems: { updatedCount: 2 } } },
    },
    {
      request: { query: CollectionValueDashboardDocument },
      result: { data },
    },
  ])

  await userEvent.click(
    await screen.findByRole("button", { name: "Edit purchase basis for Stronghold" }),
  )
  const input = screen.getByRole("textbox", { name: "Purchase price per card" })
  expect(input.getAttribute("value")).toBe("10")

  await userEvent.clear(input)
  await userEvent.type(input, "12.34")
  await userEvent.click(screen.getByRole("button", { name: "Save basis" }))

  expect(screen.queryByRole("button", { name: "Save basis" })).toBeNull()
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

function renderDashboard(
  data: {
    pricingSettings: { source: string }
    collectionValueDashboard: Record<string, unknown>
  },
  additionalMocks: ConstructorParameters<typeof MockLink>[0] = [],
) {
  const link = new MockLink([
    {
      request: { query: CollectionValueDashboardDocument },
      result: { data },
    },
    ...additionalMocks,
  ])
  const client = new ApolloClient({ cache: new InMemoryCache(), link })
  const rootRoute = createRootRoute()
  const collectionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/collection",
    component: CollectionValueDashboard,
  })
  const cardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/cards/$id",
    component: () => null,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/collection"] }),
    routeTree: rootRoute.addChildren([collectionRoute, cardRoute]),
  })

  return render(
    <ApolloProvider client={client}>
      <RouterProvider router={router} />
    </ApolloProvider>,
  )
}

function dashboardData({ biggestGains = [] }: { biggestGains?: ReturnType<typeof position>[] }) {
  return {
    pricingSettings: { source: "manapool" },
    collectionValueDashboard: {
      itemCount: 2,
      positionCount: 1,
      gainPositionCount: 1,
      lossPositionCount: 0,
      unchangedPositionCount: 0,
      summary: {
        totalPriceCents: 6_000,
        totalPriceText: "$60",
        purchasePriceCents: 2_000,
        purchasePriceText: "$20",
        valueGainCents: 4_000,
        valueGainText: "+$40",
        valueGainPercent: 200,
        valueGainPercentText: "+200%",
      },
      biggestGains,
      biggestLosses: [],
    },
  }
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
    items: [{ id: `item-${slug}-1` }, { id: `item-${slug}-2` }],
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
