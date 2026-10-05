import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import { TokenBackFaceOptions } from "../src/components/token-back-face-options"
import type { TokenPrintingOption } from "../src/components/token-printing-grid"

afterEach(cleanup)

function option(name: string, collectorNumber: string): TokenPrintingOption {
  return {
    id: `${name}-${collectorNumber}`,
    scryfallId: `sf-${name}-${collectorNumber}`,
    setCode: "tm3c",
    collectorNumber,
    imageUrl: null,
    card: { name, typeLine: `Token Creature — ${name}` },
  }
}

const copy = option("Copy", "1")
const treasure = option("Treasure", "34")
const goblin = option("Goblin", "13")
const beast = option("Beast", "4")

function names(region: HTMLElement) {
  return within(region)
    .getAllByRole("button")
    .map((button) => button.textContent)
}

test("known backs come first and the rest of the set stays visible below them", () => {
  render(
    <TokenBackFaceOptions
      known={[copy, treasure]}
      sameSet={[goblin, beast]}
      selectedScryfallId={beast.scryfallId}
      setCode="tm3c"
      onPick={vi.fn()}
    />,
  )

  expect(names(screen.getByRole("region", { name: "Known backs" }))).toEqual([
    expect.stringContaining("Copy"),
    expect.stringContaining("Treasure"),
  ])
  expect(names(screen.getByRole("region", { name: "Other TM3C tokens" }))).toEqual([
    expect.stringContaining("Goblin"),
    expect.stringContaining("Beast"),
  ])
  expect(screen.getByRole("button", { name: /Beast/ }).getAttribute("aria-pressed")).toBe("true")
})

test("without known backs it renders the plain set grid and picks report the option", async () => {
  const onPick = vi.fn()
  render(
    <TokenBackFaceOptions known={[]} sameSet={[goblin, beast]} setCode="tm3c" onPick={onPick} />,
  )

  expect(screen.queryByRole("region")).toBeNull()
  expect(screen.queryByText(/Other TM3C tokens/)).toBeNull()

  await userEvent.click(screen.getByRole("button", { name: /Goblin/ }))
  expect(onPick).toHaveBeenCalledWith(goblin)
})
