import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  queryResult: {} as Record<string, unknown>,
  refetch: vi.fn(),
  useQuery: vi.fn(),
}))

vi.mock("@apollo/client/react", () => ({
  useQuery: (...args: unknown[]) => mocks.useQuery(...args),
}))

import { DeckCombosDialog } from "../src/pages/decks/deck-combos-dialog"

const deck = { id: "deck-1", name: "Life and Loss" }

beforeEach(() => {
  mocks.refetch.mockReset()
  mocks.useQuery.mockReset()
  mocks.queryResult = {
    data: undefined,
    error: undefined,
    loading: false,
    refetch: mocks.refetch,
  }
  mocks.useQuery.mockImplementation(() => mocks.queryResult)
})

afterEach(cleanup)

test("only requests combos while the dialog is open", () => {
  const { rerender } = render(<DeckCombosDialog deck={deck} open={false} onOpenChange={vi.fn()} />)

  expect(mocks.useQuery.mock.calls.at(-1)?.[1]).toMatchObject({
    skip: true,
    variables: { id: "deck-1" },
  })

  rerender(<DeckCombosDialog deck={deck} open onOpenChange={vi.fn()} />)

  expect(mocks.useQuery.mock.calls.at(-1)?.[1]).toMatchObject({
    fetchPolicy: "network-only",
    skip: false,
    variables: { id: "deck-1" },
  })
})

test("shows the combo cards, outcomes, instructions, and source link", () => {
  mocks.queryResult = {
    data: {
      deckCombos: [
        {
          id: "690-3966",
          url: "https://commanderspellbook.com/combo/690-3966/",
          cards: [
            { name: "Sanguine Bond", quantity: 1, imageUrl: null },
            { name: "Exquisite Blood", quantity: 1, imageUrl: null },
          ],
          produces: ["Infinite lifegain", "Infinite lifeloss"],
          description: "Gain life.\nRepeat the triggered abilities.",
          manaNeeded: null,
          prerequisites: ["You have a way to gain life."],
          notes: null,
        },
      ],
    },
    error: undefined,
    loading: false,
    refetch: mocks.refetch,
  }

  render(<DeckCombosDialog deck={deck} open onOpenChange={vi.fn()} />)

  expect(screen.getByRole("dialog", { name: "Infinite combos" })).toBeInstanceOf(HTMLElement)
  expect(screen.getByText(/found in the current decklist/).textContent).toBe(
    "1 combo found in the current decklist",
  )
  expect(screen.getByRole("list", { name: "Combo cards" }).textContent).toContain("Sanguine Bond")
  expect(screen.getByText("Infinite lifeloss")).toBeInstanceOf(HTMLElement)
  expect(screen.getByText("Repeat the triggered abilities.")).toBeInstanceOf(HTMLElement)
  expect(screen.getByText(/You have a way to gain life\./)).toBeInstanceOf(HTMLElement)
  expect(screen.getByRole("link", { name: "Open combo" }).getAttribute("href")).toBe(
    "https://commanderspellbook.com/combo/690-3966/",
  )
})

test("shows an empty state when Commander Spellbook finds no included combo", () => {
  mocks.queryResult = {
    data: { deckCombos: [] },
    error: undefined,
    loading: false,
    refetch: mocks.refetch,
  }

  render(<DeckCombosDialog deck={deck} open onOpenChange={vi.fn()} />)

  expect(screen.getByText("No infinite combos found")).toBeInstanceOf(HTMLElement)
})

test("shows a failed lookup and retries on request", async () => {
  const user = userEvent.setup()
  mocks.queryResult = {
    data: undefined,
    error: new Error("upstream unavailable"),
    loading: false,
    refetch: mocks.refetch,
  }

  render(<DeckCombosDialog deck={deck} open onOpenChange={vi.fn()} />)

  expect(screen.getByRole("alert").textContent).toContain(
    "Commander Spellbook could not check this deck.",
  )
  await user.click(screen.getByRole("button", { name: "Retry" }))
  expect(mocks.refetch).toHaveBeenCalledTimes(1)
})
