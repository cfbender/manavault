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

test("category and theme grouping assign purpose-specific icons", () => {
  const categoryGroups = groupDeckCards(
    [
      deckCard("ramp", { card: { name: "Ramp", deckCategory: "ramp" } }),
      deckCard("draw", { card: { name: "Draw", deckCategory: "card_advantage" } }),
      deckCard("removal", { card: { name: "Removal", deckCategory: "targeted_disruption" } }),
      deckCard("wipe", { card: { name: "Wipe", deckCategory: "mass_disruption" } }),
      deckCard("land", { card: { name: "Land", deckCategory: "lands" } }),
    ],
    "category",
  )
  const themeGroups = groupDeckCards(
    [
      deckCard("burn", { card: { name: "Burn", deckThemes: ["burn"] } }),
      deckCard("tokens", { card: { name: "Tokens", deckThemes: ["tokens"] } }),
      deckCard("tutor", { card: { name: "Tutor", deckThemes: ["tutor"] } }),
    ],
    "theme",
  )

  assert.deepEqual(
    categoryGroups.map((group) => [group.key, group.icon]),
    [
      ["ramp", "ramp"],
      ["card_advantage", "card_advantage"],
      ["targeted_disruption", "targeted_disruption"],
      ["mass_disruption", "mass_disruption"],
      ["lands", "land"],
    ],
  )
  assert.deepEqual(
    themeGroups.map((group) => [group.key, group.icon]),
    [
      ["burn", "burn"],
      ["tokens", "tokens"],
      ["tutor", "tutor"],
    ],
  )
})

test("category and theme grouping keep commander in its own first group", () => {
  const cards = [
    deckCard("main-ramp", {
      card: {
        name: "Birds of Paradise",
        typeLine: "Creature",
        deckCategory: "ramp",
        deckThemes: ["ramp"],
      },
    }),
    deckCard("commander", {
      zone: "commander",
      card: {
        name: "Atraxa, Praetors' Voice",
        typeLine: "Legendary Creature",
        deckCategory: "ramp",
        deckThemes: ["ramp"],
      },
    }),
    deckCard("instant", { card: { name: "Counterspell", typeLine: "Instant" } }),
  ]

  for (const groupBy of ["category", "theme"]) {
    const groups = groupDeckCards(cards, groupBy)

    assert.equal(groups[0].key, "commander")
    assert.equal(groups[0].label, "Commander")
    assert.deepEqual(
      groups[0].cards.map((card) => card.id),
      ["commander"],
    )

    const rampGroup = groups.find((group) => group.key === "ramp")
    assert.ok(rampGroup)
    assert.deepEqual(
      rampGroup.cards.map((card) => card.id),
      ["main-ramp"],
    )
  }
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

test("tag grouping orders getting, consider cutting, then untagged", () => {
  const groups = groupDeckCards(
    [
      deckCard("plain", { card: { name: "Llanowar Elves" } }),
      deckCard("cut", { tag: "consider_cutting", card: { name: "Fog" } }),
      deckCard("get", { quantity: 2, tag: "getting", card: { name: "Sol Ring" } }),
    ],
    "tag",
  )

  assert.deepEqual(
    groups.map((group) => ({ key: group.key, label: group.label, quantity: group.quantity })),
    [
      { key: "getting", label: "Getting", quantity: 2 },
      { key: "consider_cutting", label: "Consider Cutting", quantity: 1 },
      { key: "untagged", label: "Untagged", quantity: 1 },
    ],
  )
  assert.equal(groups[0].icon, "getting")
  assert.equal(groups[1].icon, "consider_cutting")
})

test("price grouping buckets cards by per-card price", () => {
  const groups = groupDeckCards(
    [
      deckCard("free", { priceCents: 0 }),
      deckCard("cheap", { quantity: 2, priceCents: 99 }),
      deckCard("one", { priceCents: 100 }),
      deckCard("three", { priceCents: 300 }),
      deckCard("five", { priceCents: 500 }),
      deckCard("ten", { priceCents: 1000 }),
      deckCard("twenty-five", { priceCents: 2500 }),
      deckCard("fifty", { priceCents: 5000 }),
      deckCard("unknown", { priceCents: null }),
    ],
    "price",
  )

  assert.deepEqual(
    groups.map((group) => ({ key: group.key, label: group.label, quantity: group.quantity })),
    [
      { key: "under-1", label: "<$1", quantity: 3 },
      { key: "1-3", label: "$1–$3", quantity: 1 },
      { key: "3-5", label: "$3–$5", quantity: 1 },
      { key: "5-10", label: "$5–$10", quantity: 1 },
      { key: "10-25", label: "$10–$25", quantity: 1 },
      { key: "25-50", label: "$25–$50", quantity: 1 },
      { key: "50-plus", label: "$50+", quantity: 1 },
      { key: "unpriced", label: "Unpriced", quantity: 1 },
    ],
  )
})

test("price is offered as a grouping option", () => {
  assert.ok(
    DECK_GROUP_OPTIONS.some((option) => option.value === "price" && option.label === "Price"),
  )
})

test("tag is offered as a grouping option", () => {
  assert.ok(DECK_GROUP_OPTIONS.some((option) => option.value === "tag" && option.label === "Tag"))
})

test("allocation grouping labels and orders cards by allocation state", () => {
  const groups = groupDeckCards(
    [
      deckCard("missing-card", { allocationStatus: { state: "missing" } }),
      deckCard("basic-card", { allocationStatus: { state: "basic_land" } }),
      deckCard("ready-a", { quantity: 2, allocationStatus: { state: "allocated" } }),
      deckCard("ready-b", { allocationStatus: { state: "allocated" } }),
      deckCard("available-card", { allocationStatus: { state: "available" } }),
      deckCard("partial-card", { allocationStatus: { state: "partial" } }),
    ],
    "allocation",
  )

  assert.deepEqual(
    groups.map((group) => ({ key: group.key, label: group.label, quantity: group.quantity })),
    [
      { key: "allocated", label: "Fully allocated", quantity: 3 },
      { key: "available", label: "Available to allocate", quantity: 1 },
      { key: "partial", label: "Partially available", quantity: 1 },
      { key: "basic_land", label: "Basic land", quantity: 1 },
      { key: "missing", label: "Missing from collection", quantity: 1 },
    ],
  )
})

test("allocation grouping falls back to missing for unknown or absent state", () => {
  const groups = groupDeckCards(
    [deckCard("no-status"), deckCard("weird", { allocationStatus: { state: "bogus" } })],
    "allocation",
  )

  assert.deepEqual(
    groups.map((group) => ({ key: group.key, quantity: group.quantity })),
    [{ key: "missing", quantity: 2 }],
  )
})

test("allocation is offered as a grouping option", () => {
  assert.ok(
    DECK_GROUP_OPTIONS.some(
      (option) => option.value === "allocation" && option.label === "Allocation",
    ),
  )
})
