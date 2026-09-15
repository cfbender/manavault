import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"

import { DeckGroupMenu } from "../src/pages/decks/deck-group-menu"

afterEach(cleanup)

test("group control matches the compact deck action buttons", () => {
  render(<DeckGroupMenu value="theme" onChange={() => undefined} />)

  expect(screen.getByRole("button", { name: /group decks by/i }).className).toContain("btn-sm")
})
