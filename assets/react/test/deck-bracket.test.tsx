import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"

import { DeckBracketBadge } from "../src/pages/decks/deck-bracket"

afterEach(cleanup)

test.each([
  [2, 3, "Bracket 3-"],
  [4, 3, "Bracket 4-"],
  [3, 2, "Bracket 3-"],
  [3, 4, "Bracket 4-"],
])("official %i and practical %i displays %s", (official, practical, label) => {
  render(
    <DeckBracketBadge deck={{ commanderBracket: official, commanderBracketEstimate: practical }} />,
  )
  expect(screen.getByText(label)).toBeInstanceOf(HTMLElement)
})

test.each(["3-", "3", "3+"])("shows the independently assessed rating %s", (rating) => {
  render(
    <DeckBracketBadge
      deck={{ commanderBracket: 3, commanderBracketEstimate: 3, commanderBracketRating: rating }}
    />,
  )
  const badge = screen.getByText(`Bracket ${rating}`)
  expect(badge.title).toContain("+ upper end")
})

test("explicit rating takes priority over the legacy comparison", () => {
  render(
    <DeckBracketBadge
      deck={{ commanderBracket: 2, commanderBracketEstimate: 3, commanderBracketRating: "3+" }}
    />,
  )
  expect(screen.getByText("Bracket 3+")).toBeInstanceOf(HTMLElement)
  expect(screen.queryByText("Bracket 3-")).toBeNull()
})

test("bracket label is concise when guideline and practical brackets match", () => {
  const { container, rerender } = render(
    <DeckBracketBadge deck={{ commanderBracket: 3, commanderBracketEstimate: 3 }} />,
  )
  expect(screen.getByText("Bracket 3")).toBeInstanceOf(HTMLElement)

  rerender(<DeckBracketBadge deck={{ commanderBracket: null, commanderBracketEstimate: null }} />)
  expect(container.innerHTML).toBe("")
})
