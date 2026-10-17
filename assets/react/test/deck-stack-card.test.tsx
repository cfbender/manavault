import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, onTestFinished, test, vi } from "vitest"

import { DeckStackCard } from "../src/pages/decks/deck-stack-card"
import { DeckStackGroup } from "../src/pages/decks/deck-stack-group"
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
    addPartner: vi.fn(),
    allocate: vi.fn(),
    assignTag: vi.fn(),
    delete: vi.fn(),
    deallocate: vi.fn(),
    edit: vi.fn(),
    move: vi.fn(),
    preview: vi.fn(),
    reveal: vi.fn(),
    setCommander: vi.fn(),
    tag: vi.fn(),
    toggleProxy: vi.fn(),
    toggleSelected: vi.fn(),
    unassignTag: vi.fn(),
  }
  render(
    <DeckStackCard
      actions={handlers}
      capabilities={{ canAddPartner: false, canSetCommander: false }}
      card={deckCard}
      context={{ deckId: "deck-1", deckTags: [], shareMode: false }}
      position={{ index: 0, size: "md", slideOffset: 0, top: 0 }}
      state={{
        isActive: true,
        isDimmed: false,
        isSelecting: false,
        isSelected: false,
        isUpdating: false,
      }}
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
  expect(handlers.preview).toHaveBeenCalledTimes(1)
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

test("add as partner menu item shows for pairing candidates and fires its handler", async () => {
  const user = userEvent.setup()
  const handlers = renderCard({ capabilities: { canAddPartner: true, canSetCommander: false } })

  await user.click(screen.getByRole("button", { name: "Sol Ring actions" }))
  await screen.findByRole("menu")

  const partnerItem = screen.getByRole("menuitem", { name: /Add as partner/ })
  await user.click(partnerItem)
  expect(handlers.addPartner).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("menu")).toBeNull()
})

test("add as partner menu item is hidden when the card cannot pair", async () => {
  const user = userEvent.setup()
  renderCard()

  await user.click(screen.getByRole("button", { name: "Sol Ring actions" }))
  await screen.findByRole("menu")

  expect(screen.queryByRole("menuitem", { name: /Add as partner/ })).toBeNull()
})

test("allocation quick menu exposes allocate action through a Radix menu", async () => {
  const user = userEvent.setup()
  const handlers = renderCard()

  const trigger = screen.getByRole("button", { name: /Available to allocate/ })
  await user.click(trigger)

  const allocateItem = await screen.findByRole("menuitem", { name: /Allocate copy/ })
  await user.click(allocateItem)
  expect(handlers.allocate).toHaveBeenCalledWith("item-1")
  expect(screen.queryByRole("menu")).toBeNull()
})

test("a touch that scrolls across a deck stack does not raise the card it started on", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      matches: false,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
  onTestFinished(() => vi.unstubAllGlobals())
  const cards = [deckCard, { ...deckCard, id: "deck-card-2" }]
  const noop = vi.fn()
  const { container } = render(
    <DeckStackGroup
      canSetCommander={false}
      deckId="deck-1"
      deckTags={[]}
      group={{ cards, icon: "none", key: "main", label: "Main", order: 0, quantity: 2 }}
      highlightedCardIds={null}
      isSelecting={false}
      isUpdating={false}
      onAddPartner={noop}
      onAllocate={noop}
      onAssignTag={noop}
      onDelete={noop}
      onDeallocate={noop}
      onEdit={noop}
      onMove={noop}
      onPreview={noop}
      onSetCommander={noop}
      onTag={noop}
      onToggleProxy={noop}
      onToggleSelected={noop}
      onUnassignTag={noop}
      partnerCandidateIds={new Set()}
      selectedCardIds={new Set()}
    />,
  )
  const firstCard = container.querySelector<HTMLElement>("article[data-deck-id]")!
  const touch = (type: "pointerDown" | "pointerMove" | "pointerUp", clientY: number) =>
    fireEvent[type](firstCard, { clientX: 10, clientY, pointerId: 1, pointerType: "touch" })

  touch("pointerDown", 10)
  touch("pointerMove", 40)
  touch("pointerUp", 40)
  expect(firstCard.style.zIndex).toBe("1")

  touch("pointerDown", 10)
  fireEvent.pointerCancel(firstCard, { pointerId: 1, pointerType: "touch" })
  expect(firstCard.style.zIndex).toBe("1")

  touch("pointerDown", 10)
  touch("pointerUp", 10)
  expect(firstCard.style.zIndex).toBe("90")
})
