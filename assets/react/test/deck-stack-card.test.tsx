import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import { DeckStackCard } from "../src/pages/decks/deck-stack-card"
import {
  DECK_STACK_CARD_MENU_ATTRIBUTE,
  deckStackCardMenuOwnerId,
} from "../src/pages/decks/deck-stack-interactions"
import type { DeckCardEntry } from "../src/pages/decks/deck-types"

afterEach(cleanup)

const deckCard = {
  id: "deck-card-1",
  quantity: 1,
  zone: "mainboard",
  tag: null,
  finish: "nonfoil",
  card: { id: "card-1", name: "Sol Ring", gameChanger: false },
  preferredPrinting: null,
  fallbackPrinting: null,
  allocationStatus: {
    state: "available",
    allocated: 0,
    required: 1,
    available: 1,
    proxyAllocated: 0,
    candidates: [
      {
        allocated: 0,
        available: 1,
        item: { id: "item-1", quantity: 1 },
      },
    ],
  },
} as unknown as DeckCardEntry

function renderCard(overrides: Partial<Parameters<typeof DeckStackCard>[0]> = {}) {
  const handlers = {
    onAllocate: vi.fn(),
    onAssignTag: vi.fn(),
    onDelete: vi.fn(),
    onDeallocate: vi.fn(),
    onEdit: vi.fn(),
    onMove: vi.fn(),
    onPreview: vi.fn(),
    onSetCommander: vi.fn(),
    onTouchReveal: vi.fn(),
    onTag: vi.fn(),
    onToggleProxy: vi.fn(),
    onToggleSelected: vi.fn(),
    onUnassignTag: vi.fn(),
  }
  render(
    <DeckStackCard
      assignedTagIds={[]}
      canSetCommander={false}
      deckId="deck-1"
      deckCard={deckCard}
      deckTags={[]}
      index={0}
      isActive
      isDimmed={false}
      isSelecting={false}
      isSelected={false}
      isUpdating={false}
      shareMode={false}
      size="md"
      slideOffset={0}
      top={0}
      {...handlers}
      {...overrides}
    />,
  )
  return handlers
}

test("card action menu opens as a Radix menu with expected items and closes on Escape", async () => {
  const user = userEvent.setup()
  const handlers = renderCard()

  const trigger = screen.getByRole("button", { name: "Sol Ring actions" })
  await user.click(trigger)

  const menu = await screen.findByRole("menu")
  expect(menu).toBeInstanceOf(HTMLElement)
  expect(screen.getByRole("menuitem", { name: /View card details/ })).toBeInstanceOf(HTMLElement)
  expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeInstanceOf(HTMLElement)

  await user.click(screen.getByRole("menuitem", { name: /View card details/ }))
  expect(handlers.onPreview).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("menu")).toBeNull()

  await user.click(trigger)
  await screen.findByRole("menu")
  await user.keyboard("{Escape}")
  expect(screen.queryByRole("menu")).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

test("portalled menu content is tagged with its owning card so stack pin-clearing can identify it", async () => {
  const user = userEvent.setup()
  renderCard()

  await user.click(screen.getByRole("button", { name: "Sol Ring actions" }))
  const menu = await screen.findByRole("menu")

  expect(menu.getAttribute(DECK_STACK_CARD_MENU_ATTRIBUTE)).toBe("deck-card-1")
  const item = screen.getByRole("menuitem", { name: /View card details/ })
  expect(deckStackCardMenuOwnerId(item)).toBe("deck-card-1")
  expect(deckStackCardMenuOwnerId(document.body)).toBeNull()
})

test("allocation quick menu exposes allocate action through a Radix menu", async () => {
  const user = userEvent.setup()
  const handlers = renderCard()

  const trigger = screen.getByRole("button", { name: /Available to allocate/ })
  await user.click(trigger)

  const allocateItem = await screen.findByRole("menuitem", { name: /Allocate copy/ })
  await user.click(allocateItem)
  expect(handlers.onAllocate).toHaveBeenCalledWith("item-1")
  expect(screen.queryByRole("menu")).toBeNull()
})
