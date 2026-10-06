import { describe, expect, test } from "vitest"
import {
  cardsInMarquee,
  countCardTypes,
  findOpenBattlefieldPosition,
  isLandCard,
} from "../src/components/deck-playtester/battlefield-helpers"
import { BATTLEFIELD_CARD_WIDTH_REM } from "../src/components/deck-playtester/constants"
import { loadSavedGame, saveGame } from "../src/components/deck-playtester/saved-game"
import { initialSnapshot } from "../src/components/deck-playtester/state"
import { createPlaytestState } from "../src/lib/deck-playtest"

const bounds = { height: 620, width: 1390 }
const cardWidth = BATTLEFIELD_CARD_WIDTH_REM * 16
const cardHeight = cardWidth * 1.4
// Slots fit a tapped (sideways) card, which overhangs its untapped footprint on both sides.
const left = 16 + (cardHeight - cardWidth) / 2
const stride = cardHeight + 8

describe("findOpenBattlefieldPosition", () => {
  test("fills nonland rows left to right from the top", () => {
    const first = findOpenBattlefieldPosition([], bounds, { isLand: false })
    const second = findOpenBattlefieldPosition([first], bounds, { isLand: false })

    expect(first).toEqual({ x: Math.round(left), y: 16 })
    expect(second.y).toBe(16)
    expect(second.x - first.x).toBeCloseTo(stride, 0)
    // Two tapped neighbours (each cardHeight wide) don't overlap.
    expect(second.x - first.x).toBeGreaterThanOrEqual(cardHeight)
  })

  test("places lands along the bottom, clear of the floating toolbars", () => {
    const land = findOpenBattlefieldPosition([], bounds, { isLand: true })

    expect(land.x).toBe(Math.round(left))
    expect(land.y + cardWidth * 1.4).toBeLessThanOrEqual(bounds.height - 76)
    expect(land.y).toBeGreaterThan(200)
  })

  test("skips slots covered by a nudged card and finds the next open one", () => {
    const positions = [
      { x: Math.round(left), y: 16 },
      { x: Math.round(left + stride), y: 16 },
      { x: Math.round(left + stride * 2) + 24, y: 24 },
    ]

    expect(findOpenBattlefieldPosition(positions, bounds, { isLand: false })).toEqual({
      x: Math.round(left + stride * 3),
      y: 16,
    })
  })

  test("cascades instead of failing when the board is full", () => {
    const tiny = { height: 240, width: 200 }
    const full = [findOpenBattlefieldPosition([], tiny, { isLand: false })]

    const next = findOpenBattlefieldPosition(full, tiny, { isLand: false })
    expect(next).not.toEqual(full[0])
  })
})

test("isLandCard matches land type lines only", () => {
  expect(isLandCard({ typeLine: "Land — Forest Island" })).toBe(true)
  expect(isLandCard({ typeLine: "Basic Land — Plains" })).toBe(true)
  expect(isLandCard({ typeLine: "Creature — Elf Druid" })).toBe(false)
  expect(isLandCard({ typeLine: "Token Artifact — Treasure" })).toBe(false)
})

test("countCardTypes counts distinct types for delirium", () => {
  expect(
    countCardTypes([
      { typeLine: "Artifact Creature — Golem" },
      { typeLine: "Creature — Elf" },
      { typeLine: "Land — Forest" },
      { typeLine: "Tribal Instant — Elf" },
    ]),
  ).toBe(5)
  expect(countCardTypes([{ typeLine: "Token Creature — Soldier" }])).toBe(1)
})

test("cardsInMarquee returns cards the box touches", () => {
  const positions = { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 0, y: 300 } }
  const card = { height: 140, width: 100 }

  expect(cardsInMarquee(positions, { height: 50, width: 250, x: 50, y: 50 }, card)).toEqual([
    "a",
    "b",
  ])
  expect(cardsInMarquee(positions, { height: 10, width: 10, x: 150, y: 200 }, card)).toEqual([])
})

describe("saved games", () => {
  const cards = Array.from({ length: 10 }, (_, index) => ({
    deckCardId: `deck-card-${index}`,
    id: `deck-card-${index}:0`,
    name: `Card ${index}`,
  }))

  test("resume only while the decklist is unchanged", () => {
    const state = createPlaytestState(cards)
    const snapshot = { ...initialSnapshot(state), turn: 4 }
    saveGame("deck-1", snapshot)

    expect(loadSavedGame("deck-1", createPlaytestState(cards))?.turn).toBe(4)
    expect(loadSavedGame("deck-1", createPlaytestState(cards.slice(1)))).toBeNull()
    expect(loadSavedGame("deck-2", createPlaytestState(cards))).toBeNull()
  })

  test("tokens on the battlefield don't block resuming", () => {
    const state = createPlaytestState(cards)
    const token = { deckCardId: "playtest-token", id: "playtest-token-1", name: "Treasure" }
    saveGame("deck-3", {
      ...initialSnapshot(state),
      state: { ...state, battlefield: [token] },
    })

    expect(loadSavedGame("deck-3", createPlaytestState(cards))?.state.battlefield).toEqual([token])
  })
})
