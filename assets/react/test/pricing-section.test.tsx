import { ApolloClient, gql, InMemoryCache } from "@apollo/client"
import { ApolloProvider, useQuery } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { ToastProvider } from "../src/components/ui/toast"
import {
  AcquisitionPriceRebuildDocument,
  PricingSettingsDocument,
  UpdatePricingSettingsDocument,
} from "../src/pages/settings/data"
import { PricingSection } from "../src/pages/settings/pricing-section"

const StaleCollectionPriceDocument = gql`
  query StaleCollectionPrice {
    collectionItemCount
  }
`

const DependentDocument = gql`
  query DependentOnPricingSettings {
    collectionItemCount
  }
`

afterEach(cleanup)

// Like the AI settings form: renders, and runs its own query, only once pricing settings load.
function DependentSection() {
  const settingsQuery = useQuery(PricingSettingsDocument, { fetchPolicy: "cache-and-network" })
  return settingsQuery.data ? <DependentQuery /> : null
}

function DependentQuery() {
  useQuery(DependentDocument)
  return null
}

test("selecting a price source updates the control and clears stale cached prices", async () => {
  const dependentResult = { data: { collectionItemCount: 1 } }
  const scryfallSettings = pricingSettings("scryfall")
  const manaPoolSettings = pricingSettings("manapool")
  const link = new MockLink([
    {
      request: { query: PricingSettingsDocument },
      result: { data: { pricingSettings: scryfallSettings } },
    },
    {
      request: { query: AcquisitionPriceRebuildDocument },
      result: { data: { acquisitionPriceRebuild: null } },
    },
    {
      request: { query: UpdatePricingSettingsDocument, variables: { source: "manapool" } },
      delay: 100,
      result: {
        data: { updatePricingSettings: { pricingSettings: manaPoolSettings } },
      },
    },
    {
      request: { query: PricingSettingsDocument },
      result: { data: { pricingSettings: manaPoolSettings } },
    },
    {
      request: { query: AcquisitionPriceRebuildDocument },
      result: { data: { acquisitionPriceRebuild: null } },
    },
    { request: { query: DependentDocument }, result: dependentResult, maxUsageCount: 3 },
    {
      request: { query: PricingSettingsDocument },
      delay: 50,
      result: { data: { pricingSettings: manaPoolSettings } },
      maxUsageCount: 3,
    },
  ])
  const client = new ApolloClient({ cache: new InMemoryCache(), link })

  client.writeQuery({
    query: StaleCollectionPriceDocument,
    data: { collectionItemCount: 42 },
  })

  render(
    <ApolloProvider client={client}>
      <ToastProvider>
        <PricingSection />
        <DependentSection />
      </ToastProvider>
    </ApolloProvider>,
  )

  expect(
    (await screen.findByRole("button", { name: /Scryfall/ })).getAttribute("aria-pressed"),
  ).toBe("true")

  await userEvent.click(screen.getByRole("button", { name: /ManaPool/ }))

  expect(screen.getByRole("button", { name: /ManaPool/ }).getAttribute("aria-pressed")).toBe("true")
  expect(screen.getByRole("button", { name: /Scryfall/ }).getAttribute("aria-pressed")).toBe(
    "false",
  )
  expect(await screen.findByText("Price source updated.")).toBeTruthy()

  await waitFor(() => {
    expect(client.readQuery({ query: StaleCollectionPriceDocument })).toBeNull()
  })
  // The reset unmounts DependentQuery mid-refetch; that abort is not an error to report.
  await waitFor(() => expect(client.readQuery({ query: PricingSettingsDocument })).toBeTruthy())
  expect(screen.queryByText(/aborted/)).toBeNull()
})

function pricingSettings(source: string) {
  return {
    source,
    sources: ["scryfall", "manapool"],
    vendors: [{ vendor: "manapool", priceCount: 100, lastSyncedAt: "2026-08-10T12:00:00Z" }],
  }
}
