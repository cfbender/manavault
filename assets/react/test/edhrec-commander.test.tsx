import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import { EDHRecCardMenu } from "../src/pages/decks/edhrec-card-menu"
import { EDHRecCardTile } from "../src/pages/decks/edhrec-card-grid"
import { EDHRecCommanderHero } from "../src/pages/decks/edhrec-commander"
import type { EDHRecCard, EDHRecCommanderPage } from "../src/pages/decks/deck-types"

afterEach(cleanup)

const page: EDHRecCommanderPage = {
  name: "Zirda, the Dawnwaker",
  title: "Zirda, the Dawnwaker (Commander)",
  description: "Popular decks and cards for Zirda, the Dawnwaker",
  url: "https://edhrec.com/commanders/zirda-the-dawnwaker",
  rank: 953,
  deckCount: 530,
  salt: null,
  avgPrice: null,
  colorIdentity: ["R", "W"],
  similar: [],
  themes: [{ name: "Cycling", slug: "cycling", count: 48 }],
  stats: [],
  sections: [],
}

const card: EDHRecCard = {
  name: "Arcane Signet",
  oracleId: "arcane-signet",
  primaryType: "Artifact",
  score: 18,
  salt: 0.1,
  edhrecUrl: "https://edhrec.com/cards/arcane-signet",
  card: null,
  collectionStatus: {
    state: "allocated",
    required: 1,
    owned: 1,
    allocated: 1,
    available: 0,
    allocatedElsewhere: 0,
    missing: 0,
    deckZone: "mainboard",
    candidates: [],
  },
}

test("commander deck types select with the keyboard and reset with All decks", async () => {
  const user = userEvent.setup()
  const onThemeChange = vi.fn()
  const { rerender } = render(
    <EDHRecCommanderHero deck={null} onThemeChange={onThemeChange} page={page} />,
  )

  const cycling = screen.getByRole("button", { name: "Cycling 48" })
  expect(cycling.getAttribute("aria-pressed")).toBe("false")
  cycling.focus()
  await user.keyboard("{Enter}")
  expect(onThemeChange).toHaveBeenLastCalledWith({
    commanderName: "Zirda, the Dawnwaker",
    themeSlug: "cycling",
  })

  rerender(
    <EDHRecCommanderHero
      deck={null}
      onThemeChange={onThemeChange}
      page={{ ...page, title: "Zirda, the Dawnwaker (Commander) - Cycling" }}
      selectedTheme={{ commanderName: "Zirda, the Dawnwaker", themeSlug: "cycling" }}
    />,
  )

  expect(screen.getByRole("button", { name: "Cycling 48" }).getAttribute("aria-pressed")).toBe(
    "true",
  )
  await user.click(screen.getByRole("button", { name: "All decks" }))
  expect(onThemeChange).toHaveBeenLastCalledWith(null)
})

test("cuts menu offers cutting actions instead of recommendation actions", async () => {
  const user = userEvent.setup()
  const onConsiderCutting = vi.fn()
  const onCut = vi.fn()

  render(
    <EDHRecCardMenu
      card={card}
      isPending={false}
      mode="cuts"
      onAddCard={vi.fn()}
      onConsiderCutting={onConsiderCutting}
      onCut={onCut}
      onPreviewCard={vi.fn()}
    />,
  )

  await user.click(screen.getByRole("button", { name: "Arcane Signet actions" }))
  expect(screen.queryByRole("menuitem", { name: "Add to Main" })).toBeNull()
  await user.click(screen.getByRole("menuitem", { name: "Consider cutting" }))
  expect(onConsiderCutting).toHaveBeenCalledOnce()
  expect(screen.queryByRole("menuitem", { name: "Consider cutting" })).toBeNull()

  await user.click(screen.getByRole("button", { name: "Arcane Signet actions" }))
  await user.click(screen.getByRole("menuitem", { name: "Cut" }))
  expect(onCut).toHaveBeenCalledOnce()
  expect(screen.queryByRole("menuitem", { name: "Cut" })).toBeNull()
})

test("recommendation menu add actions work with touch input and close the menu", async () => {
  const user = userEvent.setup()
  const onAddCard = vi.fn()

  render(
    <EDHRecCardTile
      card={card}
      isAddingCard={false}
      isUpdatingCard={false}
      mode="recs"
      onAddCard={onAddCard}
      onConsiderCutting={vi.fn()}
      onCutCard={vi.fn()}
      onPreviewCard={vi.fn()}
    />,
  )

  await user.click(screen.getByRole("button", { name: "Arcane Signet actions" }))
  const addToMain = screen.getByRole("menuitem", { name: "Add to Main" })
  fireEvent.pointerDown(addToMain, { pointerId: 1, pointerType: "touch" })
  fireEvent.pointerUp(addToMain, { pointerId: 1, pointerType: "touch" })
  fireEvent.click(addToMain)

  expect(onAddCard).toHaveBeenCalledWith(card, "mainboard")
  expect(screen.queryByRole("menuitem", { name: "Add to Main" })).toBeNull()
})
