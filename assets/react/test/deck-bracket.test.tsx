import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"

import { DeckBracketBadge } from "../src/pages/decks/deck-bracket"

test("bracket label highlights a different practical play bracket", () => {
  const deck = { commanderBracket: 3, commanderBracketEstimate: 2 }

  render(<DeckBracketBadge deck={deck} />)
  expect(screen.getByText("Bracket 3 · Pace 2")).toBeInstanceOf(HTMLElement)
  expect(
    screen.getByTitle("Official Bracket 3; estimated to play like Bracket 2"),
  ).toBeInstanceOf(HTMLElement)
})

test("bracket label is concise when guideline and practical brackets match", () => {
  const { container, rerender } = render(
    <DeckBracketBadge deck={{ commanderBracket: 3, commanderBracketEstimate: 3 }} />,
  )
  expect(screen.getByText("Bracket 3")).toBeInstanceOf(HTMLElement)

  rerender(
    <DeckBracketBadge deck={{ commanderBracket: null, commanderBracketEstimate: null }} />,
  )
  expect(container.innerHTML).toBe("")
})
