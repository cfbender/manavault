import test from "node:test"
import assert from "node:assert/strict"

import { buildDeckStats, MANA_STAT_COLORS } from "../src/lib/deck-stats.ts"

const CURVE_BUCKETS = ["0", "1", "2", "3", "4", "5", "6", "7+"]

function deckCard(overrides = {}) {
  const { card: cardOverrides, ...deckCardOverrides } = overrides

  return {
    quantity: 1,
    zone: "mainboard",
    card:
      cardOverrides === null
        ? null
        : {
            typeLine: "Creature",
            cmc: 0,
            manaCost: "",
            oracleText: "",
            ...cardOverrides,
          },
    ...deckCardOverrides,
  }
}

function curve(buckets = {}) {
  return CURVE_BUCKETS.map((bucket) => {
    const bucketStats = buckets[bucket] || {}
    const permanents = bucketStats.permanents || 0
    const spells = bucketStats.spells || 0

    return {
      bucket,
      quantity: bucketStats.quantity ?? permanents + spells,
      permanents,
      spells,
    }
  })
}

function manaCost(overrides = {}) {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, total: 0, ...overrides }
}

function productionCards(overrides = {}) {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, any: 0, total: 0, ...overrides }
}

function costContributors(overrides = {}) {
  return { W: [], U: [], B: [], R: [], G: [], C: [], ...overrides }
}

function productionContributors(overrides = {}) {
  return { ...costContributors(), any: [], ...overrides }
}

function contributor(overrides = {}) {
  return { id: "card", name: "Card", quantity: 1, value: 1, category: "other", typeLine: "Creature", ...overrides }
}

function production(overrides = {}) {
  const { cards: cardOverrides, contributors: contributorOverrides, ...productionOverrides } = overrides

  return {
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    C: 0,
    any: 0,
    total: 0,
    cards: productionCards(cardOverrides),
    contributors: productionContributors(contributorOverrides),
    ...productionOverrides,
  }
}

test("mana curve excludes lands, sideboard, and maybeboard", () => {
  const stats = buildDeckStats([
    deckCard({ zone: "commander", card: { cmc: 1, manaCost: "{W}" } }),
    deckCard({ card: { typeLine: "Sorcery", cmc: 7, manaCost: "{5}{G}{G}" } }),
    deckCard({ quantity: 4, card: { typeLine: "Basic Land — Forest", cmc: 0, manaCost: "" } }),
    deckCard({ zone: "sideboard", card: { cmc: 2, manaCost: "{1}{U}" } }),
    deckCard({ zone: "maybeboard", card: { cmc: 3, manaCost: "{2}{B}" } }),
  ])

  assert.equal(stats.totalCards, 6)
  assert.equal(stats.nonlandCards, 2)
  assert.equal(stats.landCards, 4)
  assert.equal(stats.averageManaValue, 4)
  assert.equal(stats.totalManaValue, 8)
  assert.equal(stats.medianManaValue, 4)
  assert.deepEqual(
    stats.manaCurve,
    curve({ 1: { permanents: 1 }, "7+": { spells: 1 } }),
  )
})

test("quantity clamps to integers and multiplies hybrid mana cost pips", () => {
  const stats = buildDeckStats([
    deckCard({
      quantity: 3.9,
      card: {
        cmc: 4,
        manaCost: "{1}{W}{W}{G/P}{2/U}{C}{X}{100}",
      },
    }),
  ])

  assert.deepEqual(stats.manaCurve, curve({ 4: { permanents: 3 } }))
  assert.deepEqual(stats.manaCost, manaCost({ W: 6, U: 3, G: 3, C: 3, total: 15 }))
})

test("mana cost contributors carry weighted pips and sorted metadata", () => {
  const stats = buildDeckStats([
    deckCard({
      id: "ramp-elf",
      quantity: 3,
      card: {
        name: "Llanowar Elves",
        typeLine: "Creature — Elf Druid",
        manaCost: "{G}",
        deckCategory: "ramp",
      },
    }),
    deckCard({
      id: "draw-beast",
      quantity: 2,
      card: {
        name: "Beast Whisperer",
        typeLine: "Creature — Elf Druid",
        manaCost: "{2}{G}{G}",
        deckCategory: "card_advantage",
      },
    }),
    deckCard({
      id: "mind-stone",
      card: {
        name: "Mind Stone",
        typeLine: "Artifact",
        manaCost: "{2}",
        deckCategory: "ramp",
      },
    }),
    deckCard({
      id: "sideboard-growth",
      zone: "sideboard",
      quantity: 4,
      card: {
        name: "Sideboard Growth",
        manaCost: "{G}",
      },
    }),
  ])

  assert.deepEqual(stats.manaCost, manaCost({ G: 7, total: 7 }))
  assert.deepEqual(
    stats.costContributors,
    costContributors({
      G: [
        contributor({
          id: "draw-beast",
          name: "Beast Whisperer",
          quantity: 2,
          value: 4,
          category: "card_advantage",
          typeLine: "Creature — Elf Druid",
        }),
        contributor({
          id: "ramp-elf",
          name: "Llanowar Elves",
          quantity: 3,
          value: 3,
          category: "ramp",
          typeLine: "Creature — Elf Druid",
        }),
      ],
    }),
  )
})

test("weighted mana values use counted nonland quantities without expanding cards", () => {
  const oddStats = buildDeckStats([
    deckCard({ card: { typeLine: "Creature", cmc: 1 } }),
    deckCard({ quantity: 3, card: { typeLine: "Instant", cmc: 2 } }),
    deckCard({ card: { typeLine: "Sorcery", cmc: 6 } }),
  ])

  assert.equal(oddStats.nonlandCards, 5)
  assert.equal(oddStats.totalManaValue, 13)
  assert.equal(oddStats.averageManaValue, 13 / 5)
  assert.equal(oddStats.medianManaValue, 2)
  assert.deepEqual(
    oddStats.manaCurve,
    curve({ 1: { permanents: 1 }, 2: { spells: 3 }, 6: { spells: 1 } }),
  )

  const evenStats = buildDeckStats([
    deckCard({ quantity: 2, card: { typeLine: "Artifact", cmc: 1 } }),
    deckCard({ quantity: 2, card: { typeLine: "Sorcery", cmc: 5 } }),
  ])

  assert.equal(evenStats.nonlandCards, 4)
  assert.equal(evenStats.totalManaValue, 12)
  assert.equal(evenStats.averageManaValue, 3)
  assert.equal(evenStats.medianManaValue, 3)
  assert.deepEqual(
    evenStats.manaCurve,
    curve({ 1: { permanents: 2 }, 5: { spells: 2 } }),
  )
})

test("explicit production counts only add fragments", () => {
  const stats = buildDeckStats([
    deckCard({
      quantity: 2,
      card: {
        typeLine: "Land",
        oracleText: "({W})\n{T}: Add {G}. Add {C}{C}.",
      },
    }),
  ])

  assert.deepEqual(
    stats.manaProduction,
    production({
      G: 2,
      C: 4,
      total: 6,
      cards: { G: 2, C: 2, total: 2 },
      contributors: {
        G: [
          contributor({
            id: "card-1",
            name: "Unknown card",
            quantity: 2,
            value: 2,
            category: "other",
            typeLine: "Land",
          }),
        ],
        C: [
          contributor({
            id: "card-1",
            name: "Unknown card",
            quantity: 2,
            value: 4,
            category: "other",
            typeLine: "Land",
          }),
        ],
      },
    }),
  )
})

test("any-color production uses an any bucket without spreading colors", () => {
  const stats = buildDeckStats([
    deckCard({
      quantity: 2,
      card: {
        oracleText: "Add one mana of any color. Spend this mana only to cast creature spells.",
      },
    }),
  ])

  assert.deepEqual(
    stats.manaProduction,
    production({
      any: 2,
      total: 2,
      cards: { any: 2, total: 2 },
      contributors: {
        any: [
          contributor({
            id: "card-1",
            name: "Unknown card",
            quantity: 2,
            value: 2,
            category: "other",
            typeLine: "Creature",
          }),
        ],
      },
    }),
  )
})

test("any-color production recognizes flexible phrasing and stated amounts", () => {
  const stats = buildDeckStats([
    deckCard({
      card: {
        oracleText: "Add two mana in any combination of colors.",
      },
    }),
    deckCard({
      quantity: 3,
      card: {
        oracleText: "This land produces mana of any type.",
      },
    }),
    deckCard({
      card: {
        oracleText: "Add 4 mana of any color that a land an opponent controls could produce.",
      },
    }),
    deckCard({
      card: {
        oracleText: "Add three mana of any one color.",
      },
    }),
  ])

  assert.deepEqual(
    stats.manaProduction,
    production({
      any: 12,
      total: 12,
      cards: { any: 6, total: 6 },
      contributors: {
        any: [
          contributor({
            id: "card-1",
            name: "Unknown card",
            value: 2,
            category: "other",
            typeLine: "Creature",
          }),
          contributor({
            id: "card-2",
            name: "Unknown card",
            quantity: 3,
            value: 3,
            category: "other",
            typeLine: "Creature",
          }),
          contributor({
            id: "card-3",
            name: "Unknown card",
            value: 4,
            category: "other",
            typeLine: "Creature",
          }),
          contributor({
            id: "card-4",
            name: "Unknown card",
            value: 3,
            category: "other",
            typeLine: "Creature",
          }),
        ],
      },
    }),
  )
})

test("choice clauses count the maximum possible symbols per color", () => {
  const stats = buildDeckStats([
    deckCard({
      quantity: 2,
      card: {
        oracleText: "Add {G}{G}, {G}{U}, or {U}{U}.",
      },
    }),
  ])

  assert.deepEqual(
    stats.manaProduction,
    production({
      U: 4,
      G: 4,
      total: 8,
      cards: { U: 2, G: 2, total: 2 },
      contributors: {
        U: [
          contributor({
            id: "card-1",
            name: "Unknown card",
            quantity: 2,
            value: 4,
            category: "other",
            typeLine: "Creature",
          }),
        ],
        G: [
          contributor({
            id: "card-1",
            name: "Unknown card",
            quantity: 2,
            value: 4,
            category: "other",
            typeLine: "Creature",
          }),
        ],
      },
    }),
  )
})

test("production card counts count each card once per bucket", () => {
  const stats = buildDeckStats([
    deckCard({
      quantity: 2,
      card: {
        oracleText: "Add {G}{G}. Add {G}. Add one mana of any color.",
      },
    }),
  ])

  assert.deepEqual(
    stats.manaProduction,
    production({
      G: 6,
      any: 2,
      total: 8,
      cards: { G: 2, any: 2, total: 2 },
      contributors: {
        G: [
          contributor({
            id: "card-1",
            name: "Unknown card",
            quantity: 2,
            value: 6,
            category: "other",
            typeLine: "Creature",
          }),
        ],
        any: [
          contributor({
            id: "card-1",
            name: "Unknown card",
            quantity: 2,
            value: 2,
            category: "other",
            typeLine: "Creature",
          }),
        ],
      },
    }),
  )
})

test("mana production contributors include explicit, any, and practical green union metadata", () => {
  const stats = buildDeckStats([
    deckCard({
      id: "forest",
      quantity: 3,
      card: {
        name: "Forest",
        typeLine: "Basic Land — Forest",
        oracleText: "{T}: Add {G}.",
        deckCategory: "lands",
      },
    }),
    deckCard({
      id: "signet",
      quantity: 2,
      card: {
        name: "Arcane Signet",
        typeLine: "Artifact",
        oracleText: "{T}: Add one mana of any color.",
        deckCategory: "ramp",
      },
    }),
    deckCard({
      id: "druid",
      card: {
        name: "Druid of the Open Hand",
        typeLine: "Creature — Elf Druid",
        oracleText: "Add {G}. Add one mana of any color.",
        deckCategory: "ramp",
      },
    }),
    deckCard({
      id: "maybe",
      zone: "maybeboard",
      card: {
        name: "Maybe Mox",
        oracleText: "Add {G}. Add one mana of any color.",
      },
    }),
  ])

  assert.deepEqual(
    stats.manaProduction,
    production({
      G: 4,
      any: 3,
      total: 7,
      cards: { G: 4, any: 3, total: 6 },
      contributors: {
        G: [
          contributor({
            id: "forest",
            name: "Forest",
            quantity: 3,
            value: 3,
            category: "lands",
            typeLine: "Basic Land — Forest",
          }),
          contributor({
            id: "druid",
            name: "Druid of the Open Hand",
            value: 1,
            category: "ramp",
            typeLine: "Creature — Elf Druid",
          }),
        ],
        any: [
          contributor({
            id: "signet",
            name: "Arcane Signet",
            quantity: 2,
            value: 2,
            category: "ramp",
            typeLine: "Artifact",
          }),
          contributor({
            id: "druid",
            name: "Druid of the Open Hand",
            value: 1,
            category: "ramp",
            typeLine: "Creature — Elf Druid",
          }),
        ],
      },
    }),
  )

  const practicalGreenContributorIds = new Set(
    [...stats.manaProduction.contributors.G, ...stats.manaProduction.contributors.any].map(({ id }) => id),
  )

  assert.deepEqual([...practicalGreenContributorIds].sort(), ["druid", "forest", "signet"])
  assert.ok(stats.manaProduction.contributors.G.some(({ id }) => id === "druid"))
  assert.ok(stats.manaProduction.contributors.any.some(({ id }) => id === "druid"))
})

test("empty and malformed inputs return visible zero-shaped stats", () => {
  const emptyStats = {
    totalCards: 0,
    nonlandCards: 0,
    landCards: 0,
    averageManaValue: 0,
    totalManaValue: 0,
    medianManaValue: 0,
    manaCurve: curve(),
    manaCost: manaCost(),
    costContributors: costContributors(),
    manaProduction: production(),
  }

  assert.deepEqual(buildDeckStats([]), emptyStats)
  assert.deepEqual(buildDeckStats(null), emptyStats)
  assert.deepEqual(
    buildDeckStats([null, deckCard({ quantity: -2 }), deckCard({ quantity: Number.NaN }), deckCard({ card: null })]),
    emptyStats,
  )
})

test("exported mana color order is stable for UI summaries", () => {
  assert.deepEqual(MANA_STAT_COLORS, ["W", "U", "B", "R", "G", "C"])
})
