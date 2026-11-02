import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"

import { CardLegalityPanel, CardTagSummary } from "../src/pages/cards/detail-sections"
import type { CardDetail } from "../src/pages/cards/data"

afterEach(cleanup)

function card(overrides: Partial<CardDetail> = {}): CardDetail {
  return {
    id: "card-id",
    oracleId: "oracle-id",
    name: "Ranked Card",
    typeLine: "Artifact",
    manaCost: null,
    oracleText: null,
    colorIdentity: [],
    gameChanger: false,
    edhrecRank: 1234,
    edhrecCommanderRank: null,
    edhrecSaltiness: 2.5,
    deckCategory: null,
    deckThemes: [],
    oracleTags: [],
    legalities: [],
    rulings: [],
    printings: null,
    ...overrides,
  }
}

test("nonlegendary cards link only their card rank and show the bare salt score", () => {
  render(<CardTagSummary card={card()} />)

  const cardRank = screen.getByRole("link", { name: "#1,234 as card" })
  expect(cardRank.getAttribute("href")).toBe("https://edhrec.com/cards/ranked-card")
  expect(screen.queryByText(/as commander/)).toBeNull()
  expect(screen.getByText("2.50")).toBeTruthy()
  expect(screen.queryByText(/\/ 4|Community survey|MTGJSON/)).toBeNull()
})

test("legendary creatures link commander and card ranks to their respective pages", () => {
  render(
    <CardTagSummary
      card={card({
        name: "Esika, God of the Tree // The Prismatic Bridge",
        typeLine: "Legendary Creature — God // Legendary Enchantment",
        edhrecRank: 2603,
        edhrecCommanderRank: 33,
      })}
    />,
  )

  const commanderRank = screen.getByRole("link", { name: "#33 as commander" })
  const cardRank = screen.getByRole("link", { name: "#2,603 as card" })

  expect(commanderRank.getAttribute("href")).toBe(
    "https://edhrec.com/commanders/esika-god-of-the-tree",
  )
  expect(cardRank.getAttribute("href")).toBe("https://edhrec.com/cards/esika-god-of-the-tree")
})

test("legalities show banned and restricted statuses per format", () => {
  render(
    <CardLegalityPanel
      legalities={[
        { format: "vintage", status: "restricted" },
        { format: "legacy", status: "banned" },
        { format: "commander", status: "banned" },
        { format: "competitivebrawl", status: "legal" },
        { format: "modern", status: "not_legal" },
      ]}
    />,
  )

  const statusOf = (format: string) =>
    screen.getByText(format, { selector: "dt" }).nextElementSibling?.textContent

  expect(statusOf("Vintage")).toBe("RESTRICTED")
  expect(statusOf("Legacy")).toBe("BANNED")
  expect(statusOf("Commander")).toBe("BANNED")
  expect(statusOf("Comp. Brawl")).toBe("LEGAL")
  expect(statusOf("Modern")).toBe("NOT LEGAL")
  expect(statusOf("Pauper")).toBe("NOT LEGAL")
})
