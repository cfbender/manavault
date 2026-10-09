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
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { CollectionPageHeader } from "../src/pages/collection/collection-page-header"
import { BulkUpdateCollectionItemsDocument } from "../src/pages/collection/items/documents"
import { deserializeCollectionTab } from "../src/pages/collection/storage"
import { CollectionValueDashboardDocument } from "../src/pages/collection/value/documents"
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
      onBulkClean={() => {}}
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
      basis: "PURCHASE",
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
        acquisitionMarketPriceCents: 11_000,
        acquisitionMarketPriceText: "$110",
        marketGainCents: 1_500,
        marketGainText: "+$15",
        marketGainPercent: 13.6,
        marketGainPercentText: "+13.6%",
      },
      biggestGains: [position("gain", "Stronghold", 6_000, 2_000, 4_000)],
      biggestLosses: [position("loss", "Downshift", 1_500, 3_000, -1_500)],
      biggestPercentGains: [position("gain", "Stronghold", 6_000, 2_000, 4_000)],
      biggestPercentLosses: [position("loss", "Downshift", 1_500, 3_000, -1_500)],
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

test("toggles gain and loss rankings between total and percent comparison", async () => {
  window.localStorage.clear()
  const data = dashboardData({
    biggestGains: [
      position("big", "Stronghold", 60_000, 50_000, 10_000),
      position("pct", "Llanowar Elves", 1_000, 100, 900),
    ],
    biggestPercentGains: [
      position("pct", "Llanowar Elves", 1_000, 100, 900),
      position("big", "Stronghold", 60_000, 50_000, 10_000),
    ],
  })
  renderDashboard(data)

  const total = await screen.findByRole("radio", { name: "Total $" })
  expect(total.getAttribute("aria-checked")).toBe("true")
  expect(gainNames()).toEqual(["Stronghold", "Llanowar Elves"])

  await userEvent.click(screen.getByRole("radio", { name: "Percent %" }))

  expect(gainNames()).toEqual(["Llanowar Elves", "Stronghold"])
  expect(
    screen.getByText("Positions with the highest return on their purchase basis."),
  ).toBeTruthy()
  expect(window.localStorage.getItem("manavault.collection.valueRanking")).toBe('"percent"')
  window.localStorage.clear()
})

test("compares against market value at acquisition and persists the basis", async () => {
  window.localStorage.clear()
  const stronghold = position("gain", "Stronghold", 6_000, 2_000, 4_000, 5_500)
  renderDashboard(dashboardData({ biggestGains: [stronghold] }), [
    {
      request: {
        query: CollectionValueDashboardDocument,
        variables: { basis: "ACQUISITION_MARKET" },
      },
      result: { data: dashboardData({ basis: "ACQUISITION_MARKET", biggestGains: [stronghold] }) },
    },
  ])

  expect(await screen.findByRole("heading", { name: "Collection value" })).toBeTruthy()
  const purchase = screen.getByRole("radio", { name: "Purchase basis" })
  expect(purchase.getAttribute("aria-checked")).toBe("true")
  expect(screen.getByText("+$40 (+200%)")).toBeTruthy()
  expect(screen.getAllByText("+$40").length).toBeGreaterThan(0)

  await userEvent.click(screen.getByRole("radio", { name: "Market at acquisition" }))

  expect(await screen.findByText("+$10 (+20%)")).toBeTruthy()
  expect(screen.getByText("Market at acquisition", { selector: "dt" })).toBeTruthy()
  expect(screen.getByText("$50", { selector: "dd" })).toBeTruthy()
  expect(
    screen.getByRole("img", { name: "Market value compared with market value at acquisition" }),
  ).toBeTruthy()
  expect(
    screen.getByRole("img", { name: "1 above acquisition, 0 at acquisition, 0 below acquisition" }),
  ).toBeTruthy()
  expect(screen.getAllByText("+$5").length).toBeGreaterThan(0)
  expect(screen.getAllByText("$55").length).toBeGreaterThan(0)
  expect(screen.queryByText("+$40")).toBeNull()
  expect(screen.getByRole("button", { name: "Edit purchase basis for Stronghold" })).toBeTruthy()
  expect(window.localStorage.getItem("manavault.collection.valueBasis")).toBe('"market"')
  window.localStorage.clear()
})

function gainNames() {
  const gains = screen.getByRole("region", { name: "Biggest gains" })
  return within(gains)
    .getAllByRole("link")
    .map((link) => link.textContent)
}

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
      request: { query: CollectionValueDashboardDocument, variables: { basis: "PURCHASE" } },
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
      basis: "PURCHASE",
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
        acquisitionMarketPriceCents: 0,
        acquisitionMarketPriceText: "$0",
        marketGainCents: 0,
        marketGainText: "$0",
        marketGainPercent: null,
        marketGainPercentText: null,
      },
      biggestGains: [],
      biggestLosses: [],
      biggestPercentGains: [],
      biggestPercentLosses: [],
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
      request: {
        query: CollectionValueDashboardDocument,
        variables: { basis: data.collectionValueDashboard.basis ?? "PURCHASE" },
      },
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

function dashboardData({
  basis = "PURCHASE",
  biggestGains = [],
  biggestPercentGains = biggestGains,
}: {
  basis?: "PURCHASE" | "ACQUISITION_MARKET"
  biggestGains?: ReturnType<typeof position>[]
  biggestPercentGains?: ReturnType<typeof position>[]
}) {
  return {
    pricingSettings: { source: "manapool" },
    collectionValueDashboard: {
      basis,
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
        acquisitionMarketPriceCents: 5_000,
        acquisitionMarketPriceText: "$50",
        marketGainCents: 1_000,
        marketGainText: "+$10",
        marketGainPercent: 20,
        marketGainPercentText: "+20%",
      },
      biggestGains,
      biggestLosses: [],
      biggestPercentGains,
      biggestPercentLosses: [],
    },
  }
}

function signedDollars(cents: number) {
  return cents > 0 ? `+$${cents / 100}` : `-$${Math.abs(cents) / 100}`
}

function signedPercent(gainCents: number, basisCents: number) {
  return `${gainCents > 0 ? "+" : ""}${Math.round((gainCents * 100) / basisCents)}%`
}

function position(
  slug: string,
  name: string,
  totalPriceCents: number,
  purchasePriceCents: number,
  valueGainCents: number,
  acquisitionMarketPriceCents = purchasePriceCents,
) {
  const marketGainCents = totalPriceCents - acquisitionMarketPriceCents

  return {
    __typename: "CollectionValuePosition",
    items: [{ id: `item-${slug}-1` }, { id: `item-${slug}-2` }],
    quantity: 2,
    totalPriceCents,
    totalPriceText: `$${totalPriceCents / 100}`,
    purchasePriceCents,
    purchasePriceText: `$${purchasePriceCents / 100}`,
    valueGainCents,
    valueGainText: signedDollars(valueGainCents),
    valueGainPercent: (valueGainCents * 100) / purchasePriceCents,
    valueGainPercentText: signedPercent(valueGainCents, purchasePriceCents),
    acquisitionMarketPriceCents,
    acquisitionMarketPriceText: `$${acquisitionMarketPriceCents / 100}`,
    marketGainCents,
    marketGainText: signedDollars(marketGainCents),
    marketGainPercent: (marketGainCents * 100) / acquisitionMarketPriceCents,
    marketGainPercentText: signedPercent(marketGainCents, acquisitionMarketPriceCents),
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
