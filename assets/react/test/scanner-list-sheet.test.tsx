import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import { ScanListSheet } from "../src/pages/scan/scan-list-sheet"
import type { ScanEntry } from "../src/pages/scan/scan-list"

afterEach(cleanup)

const entry: ScanEntry = {
  id: "e1",
  cardKey: "card",
  illustrationId: "art",
  name: "Lightning Bolt",
  scryfallId: "card",
  setCode: "m10",
  setName: "Magic 2010",
  collectorNumber: "146",
  rarity: "common",
  finish: "nonfoil",
  finishes: ["nonfoil", "foil"],
  language: "en",
  quantity: 2,
  prices: { nonfoil: 150, foil: 900, etched: null },
  imageUrl: null,
  resolved: true,
  scannedAt: 0,
}

async function openRow(rowEntry: ScanEntry) {
  const onPurchasePrice = vi.fn()
  render(
    <ScanListSheet
      open
      entries={[rowEntry]}
      totalMinCents={0}
      onClose={vi.fn()}
      onQuantity={vi.fn()}
      onFinish={vi.fn()}
      onPrinting={vi.fn()}
      onLanguage={vi.fn()}
      onPurchasePrice={onPurchasePrice}
      onBackFace={vi.fn()}
      onRemove={vi.fn()}
      onClear={vi.fn()}
      onAddToCollection={vi.fn()}
    />,
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { expanded: false }))
  const input = screen.getByRole<HTMLInputElement>("textbox", {
    name: "Purchase price for Lightning Bolt",
  })
  return { user, input, onPurchasePrice }
}

test("purchase price defaults to market and saves an edit on Enter", async () => {
  const { user, input, onPurchasePrice } = await openRow(entry)
  expect(input.value).toBe("")
  expect(input.placeholder).toBe("$1.50")
  expect(screen.getByText("Defaults to market")).toBeTruthy()

  await user.type(input, "0.75{Enter}")
  expect(onPurchasePrice).toHaveBeenCalledWith("e1", 75)
})

test("clearing an edited price goes back to market; invalid input is discarded", async () => {
  const { user, input, onPurchasePrice } = await openRow({ ...entry, purchasePriceCents: 75 })
  expect(input.value).toBe("0.75")
  expect(screen.getByText("Market $1.50")).toBeTruthy()

  await user.clear(input)
  await user.type(input, "abc")
  await user.tab()
  expect(onPurchasePrice).not.toHaveBeenCalled()
  expect(input.value).toBe("0.75")

  await user.clear(input)
  await user.tab()
  expect(onPurchasePrice).toHaveBeenCalledWith("e1", null)
})
