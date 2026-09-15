import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"

import { BuylistMarketplaceActions } from "../src/pages/decks/buylist-marketplace-actions"
import type { BuylistEntry } from "../src/pages/decks/deck-types"

afterEach(cleanup)

const entries: BuylistEntry[] = [
  {
    cardName: "Sol Ring",
    quantity: 2,
    missing: 2,
    unavailable: 0,
    reason: "missing",
    finish: null,
    setCode: null,
    collectorNumber: null,
    language: null,
    unitPriceText: null,
    totalPriceCents: null,
    totalPriceText: null,
  },
]

function setCsrfToken(token: string) {
  const meta = document.createElement("meta")
  meta.name = "csrf-token"
  meta.content = token
  document.head.replaceChildren(meta)
}

test("renders marketplace actions in purchase order and prepares the SCG handoff form", () => {
  setCsrfToken("current-csrf-token")
  const { container } = render(<BuylistMarketplaceActions entries={entries} />)

  const actionLabels = Array.from(container.querySelectorAll("a, button")).map((element) =>
    element.textContent?.trim(),
  )
  expect(actionLabels).toEqual(["Mana Pool", "Card Kingdom", "StarCityGames", "TCGplayer"])

  const scgButton = screen.getByRole("button", { name: "StarCityGames" })
  const form = scgButton.closest("form")
  expect(form).not.toBeNull()
  if (!form) throw new Error("Expected StarCityGames handoff form")

  expect(form.getAttribute("action")).toBe("/vendors/star-city-games/deck-builder")
  expect(form.getAttribute("method")).toBe("post")
  expect(form.getAttribute("target")).toBe("_blank")
  expect((form.querySelector("input[name='data']") as HTMLInputElement).value).toBe("2 Sol Ring")
  expect((form.querySelector("input[name='_csrf_token']") as HTMLInputElement).value).toBe(
    "current-csrf-token",
  )
})

test("disables StarCityGames when the buylist is empty", () => {
  render(<BuylistMarketplaceActions entries={[]} />)

  expect(
    (screen.getByRole("button", { name: "StarCityGames" }) as HTMLButtonElement).disabled,
  ).toBe(true)
})
