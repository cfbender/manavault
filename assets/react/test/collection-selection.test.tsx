import { act, renderHook } from "@testing-library/react"
import { expect, test } from "vitest"
import { useCollectionItemSelection } from "../src/pages/collection/selection-grid"
import type { CollectionItemGroup } from "../src/pages/collection/types"

function collectionGroup(printingId: string, itemIds: string[]): CollectionItemGroup {
  return {
    printingId,
    quantity: itemIds.length,
    items: itemIds.map((id) => ({
      id,
      quantity: 1,
      condition: "near_mint",
      language: "en",
      finish: "nonfoil",
      notes: null,
      priceText: "$1",
      purchasePriceCents: 100,
      purchasePriceText: "$1",
      valueGainText: "$0",
      valueGainPercentText: "0%",
      allocatedQuantity: 0,
      forTrade: false,
      allocationDecks: [],
      location: null,
      printing: null,
    })),
  }
}

test("selected group member ids survive pagination and sorting", () => {
  const firstGroup = collectionGroup("printing-1", ["item-1", "item-2"])
  const secondGroup = collectionGroup("printing-2", ["item-3"])
  const { result, rerender } = renderHook(
    ({ groups }) => useCollectionItemSelection({ groups, resetKey: "filters", totalCount: 3 }),
    { initialProps: { groups: [firstGroup] } },
  )

  act(() => result.current.toggleItem(firstGroup))
  rerender({ groups: [secondGroup] })

  expect([...result.current.includedIds]).toEqual(["item-1", "item-2"])
  expect(result.current.selectedCount).toBe(2)
  expect(result.current.addToDeckDisabledReason).toBeUndefined()
})

test("select-all exclusions retain every member id after the group leaves the page", () => {
  const firstGroup = collectionGroup("printing-1", ["item-1", "item-2"])
  const secondGroup = collectionGroup("printing-2", ["item-3"])
  const { result, rerender } = renderHook(
    ({ groups }) => useCollectionItemSelection({ groups, resetKey: "filters", totalCount: 3 }),
    { initialProps: { groups: [firstGroup] } },
  )

  act(() => result.current.selectAll())
  act(() => result.current.toggleItem(firstGroup))
  rerender({ groups: [secondGroup] })

  expect([...result.current.excludedIds]).toEqual(["item-1", "item-2"])
  expect(result.current.selectedCount).toBe(1)
  expect(result.current.addToDeckDisabledReason).toContain("Select all")
})

test("mixed finishes stay ineligible for add-to-deck after leaving the loaded page", () => {
  const mixedGroup = collectionGroup("printing-1", ["item-1", "item-2"])
  mixedGroup.items[1].finish = "foil"
  const secondGroup = collectionGroup("printing-2", ["item-3"])
  const { result, rerender } = renderHook(
    ({ groups }) => useCollectionItemSelection({ groups, resetKey: "filters", totalCount: 3 }),
    { initialProps: { groups: [mixedGroup] } },
  )

  act(() => result.current.toggleItem(mixedGroup))
  rerender({ groups: [secondGroup] })

  expect(result.current.addToDeckDisabledReason).toContain("one finish per card")
})
