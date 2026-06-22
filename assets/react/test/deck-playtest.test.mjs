import test from "node:test"
import assert from "node:assert/strict"

import {
  createPlaytestState,
  drawCards,
  exileFromLibrary,
  millCards,
  movePlaytestCard,
  mulliganPlaytest,
  shuffleCards,
} from "../src/lib/deck-playtest.ts"

const cards = Array.from({ length: 10 }, (_, index) => ({
  id: `card-${index + 1}`,
  deckCardId: `deck-card-${index + 1}`,
  name: `Card ${index + 1}`,
}))
const command = [{ id: "commander-1", deckCardId: "commander", name: "Commander" }]
const steadyRandom = () => 0

test("createPlaytestState shuffles library and draws an opening hand", () => {
  const state = createPlaytestState(cards, command, { random: steadyRandom })

  assert.equal(state.hand.length, 7)
  assert.equal(state.library.length, 3)
  assert.deepEqual(state.command, command)
  assert.equal(state.hand[0].id, "card-2")
})

test("draw mill and exile move cards from the top of library", () => {
  let state = createPlaytestState(cards.slice(0, 4), [], { handSize: 0, random: steadyRandom })

  state = drawCards(state, 1)
  assert.deepEqual(
    state.hand.map((card) => card.id),
    ["card-2"],
  )

  state = millCards(state, 1)
  assert.deepEqual(
    state.graveyard.map((card) => card.id),
    ["card-3"],
  )

  state = exileFromLibrary(state, 1)
  assert.deepEqual(
    state.exile.map((card) => card.id),
    ["card-4"],
  )
})

test("movePlaytestCard moves cards between visible zones and to library bottom", () => {
  let state = createPlaytestState(cards.slice(0, 2), [], { handSize: 2, random: steadyRandom })
  const firstCard = state.hand[0]

  state = movePlaytestCard(state, "hand", "battlefield", firstCard.id)
  assert.equal(
    state.hand.some((card) => card.id === firstCard.id),
    false,
  )
  assert.equal(state.battlefield[0].id, firstCard.id)

  state = movePlaytestCard(state, "battlefield", "library", firstCard.id, "bottom")
  assert.equal(state.library.at(-1)?.id, firstCard.id)
})

test("mulligan keeps the first multiplayer mulligan free then subtracts cards", () => {
  let state = createPlaytestState(cards, command, { random: steadyRandom })
  state = movePlaytestCard(state, "hand", "battlefield", state.hand[0].id)
  state = mulliganPlaytest(state, steadyRandom)

  assert.equal(state.mulligans, 1)
  assert.equal(state.hand.length, 7)
  assert.equal(state.battlefield.length, 0)
  assert.equal(state.graveyard.length, 0)
  assert.equal(state.exile.length, 0)
  assert.deepEqual(state.command, command)
  assert.equal(state.hand.length + state.library.length, 10)

  state = mulliganPlaytest(state, steadyRandom)
  assert.equal(state.mulligans, 2)
  assert.equal(state.hand.length, 6)
})

test("shuffleCards returns a new array without mutating input", () => {
  const original = cards.slice(0, 3)
  const shuffled = shuffleCards(original, steadyRandom)

  assert.notEqual(shuffled, original)
  assert.deepEqual(
    original.map((card) => card.id),
    ["card-1", "card-2", "card-3"],
  )
  assert.deepEqual(
    shuffled.map((card) => card.id),
    ["card-2", "card-3", "card-1"],
  )
})
