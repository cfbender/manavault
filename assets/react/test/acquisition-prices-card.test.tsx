import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { ToastProvider } from "../src/components/ui/toast"
import { AcquisitionPricesCard } from "../src/pages/settings/acquisition-prices-card"
import {
  AcquisitionPriceRebuildDocument,
  RebuildAcquisitionPricesDocument,
} from "../src/pages/settings/data"

afterEach(cleanup)

function rebuild(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: "1",
    status,
    source: null,
    startedAt: null,
    completedAt: null,
    historyFrom: null,
    historyTo: null,
    itemsInWindow: 0,
    itemsUpdated: 0,
    itemsWithoutHistory: 0,
    error: null,
    ...extra,
  }
}

function renderCard(link: MockLink) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link })
  render(
    <ApolloProvider client={client}>
      <ToastProvider>
        <AcquisitionPricesCard />
      </ToastProvider>
    </ApolloProvider>,
  )
}

test("queuing a rebuild shows it pending and polls until it finishes", async () => {
  const succeeded = rebuild("succeeded", {
    source: "cardkingdom",
    completedAt: "2026-10-09T10:00:00Z",
    historyFrom: "2026-07-11",
    historyTo: "2026-10-08",
    itemsInWindow: 12,
    itemsUpdated: 9,
    itemsWithoutHistory: 2,
  })
  const link = new MockLink([
    {
      request: { query: AcquisitionPriceRebuildDocument },
      result: { data: { acquisitionPriceRebuild: null } },
    },
    {
      request: { query: RebuildAcquisitionPricesDocument, variables: {} },
      result: { data: { rebuildAcquisitionPrices: { rebuild: rebuild("queued") } } },
    },
    {
      request: { query: AcquisitionPriceRebuildDocument },
      result: { data: { acquisitionPriceRebuild: rebuild("running", { source: "cardkingdom" }) } },
    },
    {
      request: { query: AcquisitionPriceRebuildDocument },
      result: { data: { acquisitionPriceRebuild: succeeded } },
    },
  ])
  renderCard(link)

  expect(await screen.findByText("Never rebuilt.")).toBeTruthy()
  const button = screen.getByRole("button", { name: /Rebuild from price history/ })
  await userEvent.click(button)

  expect(await screen.findByText("Rebuild queued…")).toBeTruthy()
  expect(screen.getByRole("button", { name: /Rebuilding/ }).hasAttribute("disabled")).toBe(true)

  expect(
    await screen.findByText(/Rebuilding from Card Kingdom/, undefined, { timeout: 8_000 }),
  ).toBeTruthy()
  expect(
    await screen.findByText(
      /12 items added in that window · 9 updated · 2 without history/,
      undefined,
      {
        timeout: 8_000,
      },
    ),
  ).toBeTruthy()
  expect(screen.getByText(/Last rebuilt .* from Card Kingdom using history from/)).toBeTruthy()
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: /Rebuild from price history/ }).hasAttribute("disabled"),
    ).toBe(false)
  })
}, 20_000)

test("a failed rebuild shows its error and allows another attempt", async () => {
  const link = new MockLink([
    {
      request: { query: AcquisitionPriceRebuildDocument },
      result: {
        data: {
          acquisitionPriceRebuild: rebuild("failed", {
            completedAt: "2026-10-09T10:00:00Z",
            error: "MTGJSON request failed with HTTP 503",
          }),
        },
      },
    },
  ])
  renderCard(link)

  expect(
    await screen.findByText(/Last rebuild failed .*: MTGJSON request failed with HTTP 503/),
  ).toBeTruthy()
  expect(
    screen.getByRole("button", { name: /Rebuild from price history/ }).hasAttribute("disabled"),
  ).toBe(false)
})
