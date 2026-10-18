import { expect, test } from "vitest"

import {
  createPlaytestState,
  drawCards,
  exileFromLibrary,
  millCards,
  moveAllPlaytestCards,
  movePlaytestCard,
  mulliganPlaytest,
  resolveLibraryTop,
  shuffleCards,
} from "../src/engine"

const cards = Array.from({ length: 10 }, (_, index) => ({
  id: `card-${index + 1}`,
  deckCardId: `deck-card-${index + 1}`,
  name: `Card ${index + 1}`,
}))
const command = [{ id: "commander-1", deckCardId: "commander", name: "Commander" }]
const steadyRandom = () => 0

test("createPlaytestState shuffles library and draws an opening hand", () => {
  const state = createPlaytestState(cards, command, { random: steadyRandom })

  expect(state.hand.length).toBe(7)
  expect(state.library.length).toBe(3)
  expect(state.command).toEqual(command)
  expect(state.hand[0].id).toBe("card-2")
})

test("draw mill and exile move cards from the top of library", () => {
  let state = createPlaytestState(cards.slice(0, 4), [], { handSize: 0, random: steadyRandom })

  state = drawCards(state, 1)
  expect(state.hand.map((card) => card.id)).toEqual(["card-2"])

  state = millCards(state, 1)
  expect(state.graveyard.map((card) => card.id)).toEqual(["card-3"])

  state = exileFromLibrary(state, 1)
  expect(state.exile.map((card) => card.id)).toEqual(["card-4"])
})

test("movePlaytestCard moves cards between visible zones and to library bottom", () => {
  let state = createPlaytestState(cards.slice(0, 2), [], { handSize: 2, random: steadyRandom })
  const firstCard = state.hand[0]

  state = movePlaytestCard(state, "hand", "battlefield", firstCard.id)
  expect(state.hand.some((card) => card.id === firstCard.id)).toBe(false)
  expect(state.battlefield[0].id).toBe(firstCard.id)

  state = movePlaytestCard(state, "battlefield", "library", firstCard.id, "bottom")
  expect(state.library.at(-1)?.id).toBe(firstCard.id)
})

test("mulligan keeps the first multiplayer mulligan free then subtracts cards", () => {
  let state = createPlaytestState(cards, command, { random: steadyRandom })
  state = movePlaytestCard(state, "hand", "battlefield", state.hand[0].id)
  state = mulliganPlaytest(state, steadyRandom)

  expect(state.mulligans).toBe(1)
  expect(state.hand.length).toBe(7)
  expect(state.battlefield.length).toBe(0)
  expect(state.graveyard.length).toBe(0)
  expect(state.exile.length).toBe(0)
  expect(state.command).toEqual(command)
  expect(state.hand.length + state.library.length).toBe(10)

  state = mulliganPlaytest(state, steadyRandom)
  expect(state.mulligans).toBe(2)
  expect(state.hand.length).toBe(6)
})

test("shuffleCards returns a new array without mutating input", () => {
  const original = cards.slice(0, 3)
  const shuffled = shuffleCards(original, steadyRandom)

  expect(shuffled).not.toBe(original)
  expect(original.map((card) => card.id)).toEqual(["card-1", "card-2", "card-3"])
  expect(shuffled.map((card) => card.id)).toEqual(["card-2", "card-3", "card-1"])
})

test("milled and exiled cards land on top of their pile", () => {
  let state = createPlaytestState(cards.slice(0, 4), [], { handSize: 0, random: steadyRandom })
  const [first, second, third] = state.library

  state = millCards(state, 2)
  expect(state.graveyard.map((card) => card.id)).toEqual([second.id, first.id])

  state = exileFromLibrary(state, 1)
  expect(state.exile[0].id).toBe(third.id)
})

test("movePlaytestCard can send a library card to the bottom of the library", () => {
  let state = createPlaytestState(cards.slice(0, 3), [], { handSize: 0, random: steadyRandom })
  const top = state.library[0]

  state = movePlaytestCard(state, "library", "library", top.id, "bottom")
  expect(state.library.length).toBe(3)
  expect(state.library.at(-1)?.id).toBe(top.id)
})

test("resolveLibraryTop applies scry and surveil choices in one step", () => {
  let state = createPlaytestState(cards.slice(0, 5), [], { handSize: 0, random: steadyRandom })
  const [first, second, third, fourth] = state.library

  state = resolveLibraryTop(state, {
    [first.id]: "bottom",
    [second.id]: "top",
    [third.id]: "graveyard",
  })

  expect(state.library[0].id).toBe(second.id)
  expect(state.library[1].id).toBe(fourth.id)
  expect(state.library.at(-1)?.id).toBe(first.id)
  expect(state.graveyard.map((card) => card.id)).toEqual([third.id])
})

test("moveAllPlaytestCards empties a zone into another", () => {
  let state = createPlaytestState(cards.slice(0, 4), [], { handSize: 0, random: steadyRandom })
  state = millCards(state, 2)

  const toHand = moveAllPlaytestCards(state, "graveyard", "hand")
  expect(toHand.graveyard.length).toBe(0)
  expect(toHand.hand.length).toBe(2)

  const shuffledIn = moveAllPlaytestCards(state, "graveyard", "library", {
    random: steadyRandom,
    shuffle: true,
  })
  expect(shuffledIn.graveyard.length).toBe(0)
  expect(shuffledIn.library.length).toBe(4)
})
