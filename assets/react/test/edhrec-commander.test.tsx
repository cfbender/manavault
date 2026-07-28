import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import { EDHRecCommanderHero } from "../src/pages/decks/edhrec-commander"
import type { EDHRecCommanderPage } from "../src/pages/decks/deck-types"

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
