import test from "node:test"
import assert from "node:assert/strict"

import {
  compareCollectorNumbers,
  setSections,
  treatmentLabel,
} from "../src/pages/sets/set-sections.ts"

// Printings as Scryfall describes Edge of Eternities' treatments.
const draft = { collectorNumber: "1", frameEffects: [], borderColor: "black", promoTypes: [] }
const basic = {
  collectorNumber: "262",
  borderColor: "black",
  fullArt: true,
  card: { typeLine: "Basic Land — Plains" },
}
const viewport = {
  collectorNumber: "277",
  promoTypes: ["boosterfun"],
  frameEffects: ["showcase", "inverted"],
  borderColor: "borderless",
}
const extended = {
  collectorNumber: "330",
  promoTypes: ["boosterfun"],
  frameEffects: ["enchantment", "extendedart"],
  borderColor: "black",
}
const galaxyBasic = {
  collectorNumber: "367",
  promoTypes: ["galaxyfoil", "boosterfun"],
  frameEffects: ["inverted"],
  borderColor: "borderless",
  fullArt: true,
  finishes: ["foil"],
  card: { typeLine: "Basic Land — Plains" },
}
const fractureJapan = {
  collectorNumber: "383",
  promoTypes: ["fracturefoil", "japanshowcase", "boosterfun"],
  frameEffects: ["showcase", "inverted"],
  borderColor: "white",
  fullArt: true,
  finishes: ["foil"],
}
const promoPack = { collectorNumber: "395", promo: true, promoTypes: ["promopack"] }

test("treatmentLabel names a printing's section from its foil, border, and frame", () => {
  assert.equal(treatmentLabel(draft), "Main set")
  // Full-art basics in the main run stay in the main set.
  assert.equal(treatmentLabel(basic), "Main set")
  assert.equal(treatmentLabel(viewport), "Borderless Showcase")
  assert.equal(treatmentLabel(extended), "Extended Art")
  assert.equal(treatmentLabel(galaxyBasic), "Galaxy Foil Borderless Basic Lands")
  // Japan showcase wins over the plain showcase frame, and full art is implied.
  assert.equal(treatmentLabel(fractureJapan), "Fracture Foil Japan Showcase")
  assert.equal(treatmentLabel(promoPack), "Promos")
  assert.equal(treatmentLabel({ promoTypes: ["chocobotrackfoil"] }), "Chocobotrack Foil")
  assert.equal(treatmentLabel({ finishes: ["etched"] }), "Foil Etched")
})

test("compareCollectorNumbers orders numbers numerically, then suffixes, then the rest", () => {
  const numbers = ["300", "★1", "10", "2a", "2"]
  assert.deepEqual(numbers.sort(compareCollectorNumbers), ["2", "2a", "10", "300", "★1"])
})

test("setSections orders sections by where the set numbers them, promos last, keeping the given order", () => {
  // Sorted by price: the order within each section is kept.
  const printings = [
    promoPack,
    fractureJapan,
    extended,
    { ...draft, collectorNumber: "9" },
    viewport,
    draft,
  ]
  const sections = setSections(printings)
  assert.deepEqual(
    sections.map((section) => section.label),
    ["Main set", "Borderless Showcase", "Extended Art", "Fracture Foil Japan Showcase", "Promos"],
  )
  assert.deepEqual(
    sections[0].printings.map((printing) => printing.collectorNumber),
    ["9", "1"],
  )
  assert.equal(new Set(sections.map((section) => section.key)).size, sections.length)
})

test("setSections without grouping is one section of everything", () => {
  const sections = setSections([viewport, draft], false)
  assert.equal(sections.length, 1)
  assert.deepEqual(sections[0].printings, [viewport, draft])
  assert.deepEqual(setSections([]), [])
})
