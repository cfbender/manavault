import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

const apolloMocks = vi.hoisted(() => ({
  runCheck: vi.fn(),
}))

vi.mock("@apollo/client/react", () => ({
  useMutation: () => [apolloMocks.runCheck, { error: null, loading: false }],
}))

vi.mock("../src/pages/decks/buylist-marketplace-actions", () => ({
  BuylistMarketplaceActions: ({ entries }: { entries: Array<{ cardName: string }> }) => (
    <div data-testid="marketplaces">{entries.map((entry) => entry.cardName).join(", ")}</div>
  ),
}))

import { CollectionQuickCheck } from "../src/pages/collection/collection-quick-check"

const RESULT = {
  sourceName: "Weekend brew",
  entryCount: 3,
  requestedQuantity: 4,
  excludedQuantity: 1,
  availableQuantity: 2,
  unavailableQuantity: 1,
  missingQuantity: 1,
  estimatedCostCents: 2_500,
  estimatedCostText: "$25",
  unpricedQuantity: 0,
  unrecognized: ["Almost Sol Ring"],
  cards: [
    {
      cardName: "Black Lotus",
      oracleId: "oracle-lotus",
      required: 3,
      owned: 2,
      available: 1,
      unavailable: 1,
      missing: 1,
      toSource: 2,
      status: "partial",
      setCode: "leb",
      collectorNumber: "233",
      unitPriceCents: 1_250,
      unitPriceText: "$12.50",
      totalPriceCents: 2_500,
      totalPriceText: "$25",
      printing: {
        id: "printing-lotus",
        scryfallId: "scryfall-lotus",
        imageUrl: "https://example.test/lotus.jpg",
        setCode: "leb",
        collectorNumber: "233",
      },
    },
    {
      cardName: "Plains",
      oracleId: "oracle-plains",
      required: 1,
      owned: 0,
      available: 1,
      unavailable: 0,
      missing: 0,
      toSource: 0,
      status: "basic_land",
      setCode: null,
      collectorNumber: null,
      unitPriceCents: null,
      unitPriceText: null,
      totalPriceCents: null,
      totalPriceText: null,
      printing: null,
    },
  ],
}

beforeEach(() => {
  apolloMocks.runCheck.mockReset()
  apolloMocks.runCheck.mockResolvedValue({ data: { collectionCheck: RESULT } })
})

afterEach(cleanup)

test("checks a pasted list and surfaces actionable availability, cost, and recovery details", async () => {
  const user = userEvent.setup()
  render(<CollectionQuickCheck open onOpenChange={vi.fn()} />)

  await user.type(screen.getByLabelText("Card or deck list"), "3 Black Lotus\n1 Plains")
  await user.click(screen.getByRole("button", { name: "Check collection" }))

  expect(apolloMocks.runCheck).toHaveBeenCalledWith({
    variables: {
      includeConsidering: false,
      text: "3 Black Lotus\n1 Plains",
      url: undefined,
    },
  })

  expect(await screen.findByText("Weekend brew")).not.toBeNull()
  expect(screen.getAllByText("$25")).toHaveLength(2)
  expect(screen.getByText("1 in decks")).not.toBeNull()
  expect(screen.getByText("1 not owned")).not.toBeNull()
  expect(screen.getByText("Almost Sol Ring")).not.toBeNull()
  expect(screen.getByTestId("marketplaces").textContent).toBe("Black Lotus")
  expect(screen.queryByText("Plains")).toBeNull()

  await user.click(screen.getByRole("button", { name: "Ready 1" }))
  expect(screen.getByText("Plains")).not.toBeNull()
  expect(screen.getByText("Basic covered")).not.toBeNull()
})

test("accepts a supported deck link and includes optional sideboard cards", async () => {
  const user = userEvent.setup()
  render(<CollectionQuickCheck open onOpenChange={vi.fn()} />)

  await user.click(screen.getByRole("button", { name: "Deck link" }))
  await user.type(screen.getByLabelText("Deck link"), "https://moxfield.com/decks/abcde")
  await user.click(
    screen.getByRole("checkbox", { name: "Include considering and sideboard cards" }),
  )
  await user.click(screen.getByRole("button", { name: "Check collection" }))

  expect(apolloMocks.runCheck).toHaveBeenCalledWith({
    variables: {
      includeConsidering: true,
      text: undefined,
      url: "https://moxfield.com/decks/abcde",
    },
  })

  const summary = await screen.findByText("Weekend brew")
  expect(within(summary.parentElement as HTMLElement).getByText(/3 list entries/)).not.toBeNull()
})
