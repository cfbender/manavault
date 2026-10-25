import test from "node:test"
import assert from "node:assert/strict"

import {
  bracketFloor,
  buildDeckHealth,
  landTargetBand,
  withCombos,
} from "../src/lib/deck-health.ts"
import { buildDeckStats } from "../src/lib/deck-stats.ts"

let nextId = 0

function deckCard(overrides = {}) {
  const { card: cardOverrides, ...deckCardOverrides } = overrides
  nextId += 1

  return {
    id: `dc-${nextId}`,
    quantity: 1,
    zone: "mainboard",
    card: {
      name: `Card ${nextId}`,
      typeLine: "Creature",
      cmc: 3,
      manaCost: "{2}{G}",
      oracleText: "",
      gameChanger: false,
      edhrecRank: 12000,
      deckCategory: "other",
      deckThemes: [],
      ...cardOverrides,
    },
    ...deckCardOverrides,
  }
}

function repeat(count, factory) {
  return Array.from({ length: count }, factory)
}

function forest() {
  return deckCard({
    card: {
      name: "Forest",
      typeLine: "Basic Land — Forest",
      cmc: 0,
      manaCost: "",
      oracleText: "{T}: Add {G}.",
      deckCategory: "lands",
    },
  })
}

function health(deckCards, format = "commander") {
  return buildDeckHealth(deckCards, { format, stats: buildDeckStats(deckCards) })
}

function check(report, key) {
  const found = report.mana.checks.find((candidate) => candidate.key === key)
  assert.ok(found, `missing check ${key}`)
  return found
}

function bucket(report, key) {
  const found = report.quality.buckets.find((candidate) => candidate.key === key)
  assert.ok(found, `missing bucket ${key}`)
  return found
}

test("card quality buckets nonland cards by EDHREC rank, with Game Changers as staples", () => {
  const deckCards = [
    // Lands never count, however highly ranked.
    deckCard({ card: { name: "Command Tower", typeLine: "Land", manaCost: "", edhrecRank: 2 } }),
    ...repeat(4, () => deckCard({ card: { edhrecRank: 1000 } })),
    // Both sides of the staple line.
    deckCard({ card: { edhrecRank: 1001 } }),
    ...repeat(2, () => deckCard({ card: { edhrecRank: 5000 } })),
    deckCard({ card: { edhrecRank: 5001 } }),
    // A Game Changer that EDHREC barely ranks is still a staple.
    deckCard({ card: { name: "Drannith Magistrate", gameChanger: true, edhrecRank: 9000 } }),
    deckCard({ card: { name: "Unranked", edhrecRank: null }, quantity: 2 }),
  ]

  const report = health(deckCards)

  assert.equal(report.quality.nonlandCards, 11)
  assert.equal(bucket(report, "staples").count, 5)
  assert.equal(bucket(report, "staples").share, 45)
  assert.equal(bucket(report, "played").count, 3)
  assert.equal(bucket(report, "fringe").count, 3)
  assert.deepEqual(
    bucket(report, "fringe")
      .cards.map((card) => [card.name, card.quantity])
      .slice(-1),
    [["Unranked", 2]],
  )
  // (5 staples + 3 played × 0.5) / 11 nonland cards.
  assert.equal(report.quality.score, 59)
})

test("card quality is skipped when the catalog has no EDHREC ranks", () => {
  const report = health([
    ...repeat(3, forest),
    ...repeat(3, () => deckCard({ card: { edhrecRank: null } })),
  ])

  assert.equal(report.quality, null)
  assert.equal(report.overall, report.mana.score)
})

test("overall averages quality and mana, and ignores cards outside the deck", () => {
  const deckCards = [
    ...repeat(36, forest),
    ...repeat(33, () => deckCard({ card: { edhrecRank: 500 } })),
    deckCard({ zone: "considering", card: { gameChanger: true, edhrecRank: 1 } }),
    deckCard({ zone: "sideboard", card: { gameChanger: true, edhrecRank: 1 } }),
  ]

  const report = health(deckCards)

  assert.equal(report.countedCards, 69)
  assert.equal(report.quality.score, 100)
  assert.equal(check(report, "lands").status, "ok")
  assert.equal(check(report, "manaValue").score, 100)
  assert.equal(check(report, "colorCoverage").score, 100)
  assert.equal(report.mana.score, 100)
  assert.equal(report.overall, 100)
  assert.equal(report.power.signals[0].count, 0)
  assert.equal(report.power.combos, null)
  assert.equal(report.power.bracketFloor.bracket, 2)
})

test("mana checks flag a short color and a high curve", () => {
  const deckCards = [
    ...repeat(20, forest),
    ...repeat(10, () =>
      deckCard({ card: { manaCost: "{3}{U}{U}", cmc: 5, deckThemes: ["card_advantage"] } }),
    ),
    ...repeat(5, () => deckCard({ card: { manaCost: "{4}{G}", cmc: 5 } })),
  ]

  const report = health(deckCards)
  const coverage = check(report, "colorCoverage")
  const manaValue = check(report, "manaValue")
  const lands = check(report, "lands")

  // Blue is 80% of the pips but none of the sources; green's 20% is covered.
  assert.equal(coverage.score, 20)
  assert.equal(coverage.status, "low")
  assert.equal(coverage.note, "Short on U")
  assert.equal(manaValue.count, 5)
  assert.equal(manaValue.status, "high")
  assert.equal(manaValue.score, 0)
  // A 5.0 curve asks for 42 lands; 20 is 20 under the band.
  assert.deepEqual(lands.target, [40, 44])
  assert.equal(lands.score, 0)
})

test("color coverage compares source share with pip share, so few duals can cover many pips", () => {
  // 60 blue pips and 20 green pips from 8 sources: six U/G duals and two
  // Forests. Blue holds 75% of the pips and 6 of 8 sources; green holds 25%
  // of the pips and every source. Counting producers against pips would
  // call both colors short.
  const dual = () =>
    deckCard({
      card: {
        name: "Breeding Pool",
        typeLine: "Land — Forest Island",
        cmc: 0,
        manaCost: "",
        oracleText: "({T}: Add {G} or {U}.)",
        deckCategory: "lands",
      },
    })
  const deckCards = [
    ...repeat(6, dual),
    ...repeat(2, forest),
    ...repeat(20, () => deckCard({ card: { manaCost: "{U}{U}{U}", cmc: 3 } })),
    ...repeat(20, () => deckCard({ card: { manaCost: "{G}", cmc: 1 } })),
  ]

  const coverage = check(health(deckCards), "colorCoverage")

  assert.equal(coverage.score, 100)
  assert.equal(coverage.status, "ok")
  assert.equal(coverage.note, "Every color covered")

  // Swap the duals for Forests and blue has no sources at all.
  const monoGreenSources = check(
    health([...repeat(8, forest), ...deckCards.slice(8)]),
    "colorCoverage",
  )

  assert.equal(monoGreenSources.score, 25)
  assert.equal(monoGreenSources.note, "Short on U")
})

test("land target follows the average mana value and the deck size", () => {
  assert.deepEqual(landTargetBand(3, "commander"), [34, 38])
  assert.deepEqual(landTargetBand(2.3, "commander"), [32, 36])
  assert.deepEqual(landTargetBand(3.6, "commander"), [36, 40])
  assert.deepEqual(landTargetBand(9, "commander"), [40, 44])
  assert.deepEqual(landTargetBand(2.5, "constructed"), [22, 26])
  assert.deepEqual(landTargetBand(1.6, "constructed"), [20, 24])
  assert.deepEqual(landTargetBand(0, "constructed"), [17, 21])
})

test("the bracket floor follows the Game Changer, land denial, and combo checklist", () => {
  assert.equal(bracketFloor({ gameChangers: 0, massLandDenial: 0 }).bracket, 2)
  assert.equal(bracketFloor({ gameChangers: 1, massLandDenial: 0 }).bracket, 3)
  assert.equal(bracketFloor({ gameChangers: 3, massLandDenial: 0 }).bracket, 3)
  assert.equal(bracketFloor({ gameChangers: 4, massLandDenial: 0 }).bracket, 4)
  assert.equal(bracketFloor({ gameChangers: 0, massLandDenial: 1 }).bracket, 4)
  assert.equal(bracketFloor({ gameChangers: 0, massLandDenial: 0, twoCardCombos: 1 }).bracket, 3)
  assert.deepEqual(bracketFloor({ gameChangers: 4, massLandDenial: 1 }).reasons, [
    "1 mass land denial card",
    "4 Game Changers (bracket 3 allows 3)",
  ])
  assert.deepEqual(bracketFloor({ gameChangers: 2, massLandDenial: 0, twoCardCombos: 1 }).reasons, [
    "2 Game Changers (brackets 1–2 allow none)",
    "1 two-card combo (brackets 1–2 allow none)",
  ])
})

test("combos from Commander Spellbook match deck cards by name and raise the floor", () => {
  const deckCards = [
    deckCard({ zone: "commander", card: { name: "Kiki-Jiki, Mirror Breaker" } }),
    deckCard({ card: { name: "Zealous Conscripts" } }),
    deckCard({ card: { name: "Thassa's Oracle" } }),
    deckCard({ card: { name: "Demonic Consultation" } }),
    deckCard({ card: { name: "Fire // Ice" } }),
    deckCard({ zone: "considering", card: { name: "Pestermite" } }),
    forest(),
  ]
  const combos = [
    { cards: [{ name: "Kiki-Jiki, Mirror Breaker" }, { name: "Zealous Conscripts" }] },
    { cards: [{ name: "kiki-jiki, mirror breaker" }, { name: "Pestermite" }] },
    {
      cards: [{ name: "Thassa's Oracle" }, { name: "Demonic Consultation" }, { name: "Fire" }],
    },
  ]

  const report = withCombos(health(deckCards), combos, deckCards)

  assert.equal(report.power.combos.count, 3)
  assert.equal(report.power.combos.twoCard, 2)
  assert.deepEqual(
    report.power.combos.cards.map((card) => card.name),
    [
      "Demonic Consultation",
      "Fire // Ice",
      "Kiki-Jiki, Mirror Breaker",
      "Thassa's Oracle",
      "Zealous Conscripts",
    ],
  )
  assert.equal(report.power.bracketFloor.bracket, 3)

  const unchecked = withCombos(health(deckCards), null, deckCards)
  assert.equal(unchecked.power.combos, null)
  assert.equal(unchecked.power.bracketFloor.bracket, 2)

  const modern = withCombos(health(deckCards, "modern"), combos, deckCards)
  assert.equal(modern.power, null)
})

test("power signals read Game Changers, land denial text, extra turns, and tutors", () => {
  const deckCards = [
    deckCard({ zone: "commander", card: { name: "Rhystic Study", gameChanger: true } }),
    deckCard({ card: { name: "Armageddon", oracleText: "Destroy all lands." } }),
    deckCard({
      card: {
        name: "Winter Orb",
        oracleText: "Lands don't untap during their controllers' untap steps.",
      },
    }),
    deckCard({
      card: {
        name: "Wrath of God",
        oracleText: "Destroy all creatures. They can't be regenerated.",
      },
    }),
    deckCard({ card: { name: "Time Warp", deckThemes: ["extra_turns"] } }),
    deckCard({ card: { name: "Demonic Tutor", deckThemes: ["tutor"], gameChanger: true } }),
    deckCard({ card: { name: "Diabolic Tutor", deckThemes: ["tutor"] } }),
    // A land fetcher is tagged tutor and ramp; it counts as ramp, not a tutor.
    deckCard({ card: { name: "Cultivate", deckThemes: ["tutor", "ramp"] } }),
    deckCard({
      card: { name: "Evolving Wilds", typeLine: "Land", manaCost: "", deckThemes: ["tutor"] },
    }),
  ]

  const report = health(deckCards)
  const signals = Object.fromEntries(report.power.signals.map((signal) => [signal.key, signal]))

  assert.deepEqual(
    signals.gameChangers.cards.map((card) => card.name),
    ["Demonic Tutor", "Rhystic Study"],
  )
  assert.deepEqual(
    signals.massLandDenial.cards.map((card) => card.name),
    ["Armageddon", "Winter Orb"],
  )
  assert.equal(signals.extraTurns.count, 1)
  assert.equal(signals.tutors.count, 2)
  assert.equal(report.power.bracketFloor.bracket, 4)
})

test("non-commander formats score mana only", () => {
  const deckCards = [
    ...repeat(24, forest),
    ...repeat(36, () => deckCard({ card: { cmc: 2, manaCost: "{1}{G}", deckThemes: ["ramp"] } })),
  ]

  const report = health(deckCards, "modern")

  assert.equal(report.template, "constructed")
  assert.equal(report.quality, null)
  assert.equal(report.power, null)
  assert.deepEqual(check(report, "lands").target, [21, 25])
  assert.equal(report.overall, report.mana.score)
})

test("an empty deck counts nothing and scores zero overall", () => {
  const report = health([])

  assert.equal(report.countedCards, 0)
  assert.equal(report.overall, 0)
})
