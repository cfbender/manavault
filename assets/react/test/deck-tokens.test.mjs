import test from "node:test"
import assert from "node:assert/strict"

import { buildDeckTokens } from "../src/lib/deck-tokens.ts"

function deckCard(overrides = {}) {
  const { card: cardOverrides, ...deckCardOverrides } = overrides

  return {
    id: "card",
    quantity: 1,
    zone: "mainboard",
    card:
      cardOverrides === null
        ? null
        : {
            name: "Card",
            oracleText: "",
            ...cardOverrides,
          },
    ...deckCardOverrides,
  }
}

test("counts only commander and mainboard token producers and ignores malformed rows", () => {
  assert.deepEqual(
    buildDeckTokens([
      deckCard({
        id: "treasure-maker",
        quantity: 2,
        card: { name: "Treasure Maker", oracleText: "Create a Treasure token." },
      }),
      deckCard({
        id: "food-commander",
        zone: "commander",
        card: { name: "Food Commander", oracleText: "Created a Food token." },
      }),
      deckCard({
        id: "clue-sideboard",
        zone: "sideboard",
        card: { oracleText: "Create a Clue token." },
      }),
      deckCard({
        id: "blood-maybeboard",
        zone: "maybeboard",
        card: { oracleText: "Create a Blood token." },
      }),
      deckCard({ quantity: 0, card: { oracleText: "Create a Map token." } }),
      deckCard({ quantity: Number.NaN, card: { oracleText: "Create a Powerstone token." } }),
      deckCard({ card: null }),
      deckCard({ card: { oracleText: null } }),
      null,
    ]),
    [
      {
        key: "food token",
        name: "Food",
        description: "Food token",
        producers: [{ id: "food-commander", name: "Food Commander", quantity: 1, amount: "1" }],
      },
      {
        key: "treasure token",
        name: "Treasure",
        description: "Treasure token",
        producers: [{ id: "treasure-maker", name: "Treasure Maker", quantity: 2, amount: "1" }],
      },
    ],
  )
})

test("aggregates identical token descriptions case-insensitively across producer cards", () => {
  assert.deepEqual(
    buildDeckTokens([
      deckCard({ id: "bravo", card: { name: "Bravo", oracleText: "Create a Treasure token." } }),
      deckCard({ id: "alpha", card: { name: "Alpha", oracleText: "create two treasure TOKENS." } }),
    ]),
    [
      {
        key: "treasure token",
        name: "Treasure",
        description: "Treasure token",
        producers: [
          { id: "alpha", name: "Alpha", quantity: 1, amount: "2" },
          { id: "bravo", name: "Bravo", quantity: 1, amount: "1" },
        ],
      },
    ],
  )
})

test("parses word, variable, and referential token amounts with practical token names", () => {
  assert.deepEqual(
    buildDeckTokens([
      deckCard({
        id: "soldier-maker",
        card: {
          name: "Soldier Maker",
          oracleText: "Create two 1/1 white Soldier creature tokens.",
        },
      }),
      deckCard({
        id: "zombie-maker",
        card: {
          name: "Zombie Maker",
          oracleText: "When it attacks, it creates X tapped 2/2 black Zombie creature tokens.",
        },
      }),
      deckCard({
        id: "food-maker",
        card: {
          name: "Food Maker",
          oracleText: "Sacrifice any number of artifacts, then create that many Food tokens.",
        },
      }),
    ]),
    [
      {
        key: "food token",
        name: "Food",
        description: "Food token",
        producers: [{ id: "food-maker", name: "Food Maker", quantity: 1, amount: "that many" }],
      },
      {
        key: "1/1 white soldier creature token",
        name: "Soldier",
        description: "1/1 white Soldier creature token",
        producers: [{ id: "soldier-maker", name: "Soldier Maker", quantity: 1, amount: "2" }],
      },
      {
        key: "tapped 2/2 black zombie creature token",
        name: "Zombie",
        description: "tapped 2/2 black Zombie creature token",
        producers: [{ id: "zombie-maker", name: "Zombie Maker", quantity: 1, amount: "X" }],
      },
    ],
  )
})

test("names token-copy descriptions as Copy", () => {
  assert.deepEqual(
    buildDeckTokens([
      deckCard({
        id: "clone-maker",
        card: {
          name: "Clone Maker",
          oracleText: "Create a token that's a copy of target creature.",
        },
      }),
      deckCard({
        id: "artifact-maker",
        card: {
          name: "Artifact Maker",
          oracleText: "Create two tokens that are copies of target artifact.",
        },
      }),
    ]),
    [
      {
        key: "token that's a copy of target creature",
        name: "Copy",
        description: "token that's a copy of target creature",
        producers: [{ id: "clone-maker", name: "Clone Maker", quantity: 1, amount: "1" }],
      },
      {
        key: "tokens that are copies of target artifact",
        name: "Copy",
        description: "tokens that are copies of target artifact",
        producers: [{ id: "artifact-maker", name: "Artifact Maker", quantity: 1, amount: "2" }],
      },
    ],
  )
})

test("sorts token summaries by name then description and producers by card name then id", () => {
  assert.deepEqual(
    buildDeckTokens([
      deckCard({ id: "map", card: { name: "Map Maker", oracleText: "Create a Map token." } }),
      deckCard({
        id: "z-goblin",
        card: { name: "Alpha", oracleText: "Create a 2/2 red Goblin creature token." },
      }),
      deckCard({ id: "blood", card: { name: "Blood Maker", oracleText: "Create a Blood token." } }),
      deckCard({
        id: "a-goblin",
        card: { name: "Alpha", oracleText: "Create a 2/2 red Goblin creature token." },
      }),
      deckCard({ id: "clue", card: { name: "Clue Maker", oracleText: "Create a Clue token." } }),
      deckCard({
        id: "small-goblin",
        card: { name: "Small Goblin Maker", oracleText: "Create a 1/1 red Goblin creature token." },
      }),
    ]),
    [
      {
        key: "blood token",
        name: "Blood",
        description: "Blood token",
        producers: [{ id: "blood", name: "Blood Maker", quantity: 1, amount: "1" }],
      },
      {
        key: "clue token",
        name: "Clue",
        description: "Clue token",
        producers: [{ id: "clue", name: "Clue Maker", quantity: 1, amount: "1" }],
      },
      {
        key: "1/1 red goblin creature token",
        name: "Goblin",
        description: "1/1 red Goblin creature token",
        producers: [{ id: "small-goblin", name: "Small Goblin Maker", quantity: 1, amount: "1" }],
      },
      {
        key: "2/2 red goblin creature token",
        name: "Goblin",
        description: "2/2 red Goblin creature token",
        producers: [
          { id: "a-goblin", name: "Alpha", quantity: 1, amount: "1" },
          { id: "z-goblin", name: "Alpha", quantity: 1, amount: "1" },
        ],
      },
      {
        key: "map token",
        name: "Map",
        description: "Map token",
        producers: [{ id: "map", name: "Map Maker", quantity: 1, amount: "1" }],
      },
    ],
  )
})
