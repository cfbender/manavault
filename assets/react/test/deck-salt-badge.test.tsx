import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"

import { DeckSaltBadge } from "../src/pages/decks/deck-detail-header"

afterEach(cleanup)

test("shows an accessible icon and two-decimal salt sum", () => {
  render(<DeckSaltBadge saltSum={12.9} />)

  const badge = screen.getByLabelText("EDHREC salt sum: 12.90")

  expect(badge.textContent).toBe("12.90")
  expect(badge.querySelector("svg")?.classList.contains("lucide-salt-shaker")).toBe(true)
})

test("does not show a salt badge when no cards have a score", () => {
  const { container } = render(<DeckSaltBadge saltSum={null} />)

  expect(container.childElementCount).toBe(0)
})
