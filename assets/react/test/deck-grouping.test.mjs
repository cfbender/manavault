import test from "node:test"
import assert from "node:assert/strict"

import { DECK_GROUP_OPTIONS, groupDeckCards } from "../src/lib/deck-grouping.ts"

function deckCard(id, overrides = {}) {
  const { card: cardOverrides, ...deckCardOverrides } = overrides

  return {
    id,
    quantity: 1,
    zone: "mainboard",
    card: {
      name: id,
      typeLine: "Creature",
      cmc: 2,
      colors: ["G"],
      colorIdentity: ["G"],
      deckCategory: null,
      deckThemes: null,
      printings: [],
      ...cardOverrides,
    },
    preferredPrinting: null,
    ...deckCardOverrides,
  }
}

test("theme grouping is the first option and uses the first non-empty theme", () => {
  assert.deepEqual(DECK_GROUP_OPTIONS.slice(0, 2), [
    { label: "Theme", value: "theme" },
    { label: "Category", value: "category" },
  ])

  const groups = groupDeckCards(
    [
      deckCard("sol-ring", {
        quantity: 2,
        card: { name: "Sol Ring", deckThemes: ["", "artifact-ramp", "treasure"] },
      }),
      deckCard("dockside", {
        card: { name: "Dockside Extortionist", deckThemes: ["treasure", "artifact-ramp"] },
      }),
    ],
    DECK_GROUP_OPTIONS[0].value,
  )

  assert.deepEqual(
    groups.map((group) => ({ key: group.key, label: group.label, quantity: group.quantity })),
    [
      { key: "artifact-ramp", label: "Artifact Ramp", quantity: 2 },
      { key: "treasure", label: "Treasure", quantity: 1 },
    ],
  )
})

test("theme grouping falls back to Other for missing themes and sorts it last", () => {
  const groups = groupDeckCards(
    [
      deckCard("nameless-one", { card: { name: "Nameless One", deckThemes: null } }),
      deckCard("blank-theme", { card: { name: "Blank Theme", deckThemes: ["   "] } }),
      deckCard("blood-artist", { card: { name: "Blood Artist", deckThemes: ["aristocrats"] } }),
    ],
    "theme",
  )

  assert.deepEqual(
    groups.map((group) => ({ key: group.key, label: group.label, quantity: group.quantity })),
    [
      { key: "aristocrats", label: "Aristocrats", quantity: 1 },
      { key: "other", label: "Other", quantity: 2 },
    ],
  )
})

test("category grouping follows contract order with lands and other last", () => {
  const groups = groupDeckCards(
    [
      deckCard("unknown", { card: { name: "Unknown", deckCategory: null } }),
      deckCard("forest", {
        card: { name: "Forest", typeLine: "Basic Land", deckCategory: "lands" },
      }),
      deckCard("beast-whisperer", {
        card: { name: "Beast Whisperer", deckCategory: "card_advantage" },
      }),
      deckCard("nature-lore", { card: { name: "Nature's Lore", deckCategory: "ramp" } }),
    ],
    "category",
  )

  assert.deepEqual(
    groups.map((group) => group.label),
    ["Ramp", "Card Advantage", "Lands", "Other"],
  )
})

test("type grouping keeps commander first and other grouping modes keep commander in normal groups", () => {
  const cards = [
    deckCard("main-ramp", {
      card: { name: "Birds of Paradise", typeLine: "Creature", deckCategory: "ramp" },
    }),
    deckCard("commander", {
      zone: "commander",
      card: {
        name: "Atraxa, Praetors' Voice",
        typeLine: "Legendary Creature",
        deckCategory: "ramp",
      },
    }),
    deckCard("instant", { card: { name: "Counterspell", typeLine: "Instant" } }),
  ]

  const typeGroups = groupDeckCards(cards, "type")
  assert.equal(typeGroups[0].label, "Commander")
  assert.deepEqual(
    typeGroups[0].cards.map((card) => card.id),
    ["commander"],
  )

  const categoryGroups = groupDeckCards(cards, "category")
  const rampGroup = categoryGroups.find((group) => group.key === "ramp")
  assert.ok(rampGroup)
  assert.deepEqual(
    rampGroup.cards.map((card) => card.id),
    ["commander", "main-ramp"],
  )
  assert.equal(
    categoryGroups.some((group) => group.key === "commander"),
    false,
  )
})

test("existing labels remain human-readable for category and mana value", () => {
  const groups = groupDeckCards(
    [
      deckCard("draw", { card: { name: "Phyrexian Arena", deckCategory: "card_advantage" } }),
      deckCard("six", { card: { name: "Sun Titan", cmc: 6 } }),
    ],
    "category",
  )
  const manaGroups = groupDeckCards(
    [deckCard("six", { card: { name: "Sun Titan", cmc: 6 } })],
    "manaValue",
  )

  assert.equal(groups.find((group) => group.key === "card_advantage")?.label, "Card Advantage")
  assert.equal(manaGroups[0].label, "Mana 6+")
})
