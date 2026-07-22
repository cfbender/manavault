import test from "node:test"
import assert from "node:assert/strict"

import { exportDecklistText } from "../src/lib/deck-export.ts"

test("exportDecklistText groups zones in decklist order and sorts names", () => {
  const text = exportDecklistText([
    {
      quantity: 2,
      zone: "mainboard",
      finish: "foil",
      card: { name: "Zedruu the Greathearted" },
      preferredPrinting: { setCode: "c16", collectorNumber: "229" },
    },
    {
      quantity: 1,
      zone: "commander",
      card: { name: "Atraxa, Praetors' Voice" },
      preferredPrinting: { setCode: "mul", collectorNumber: "98" },
    },
    {
      quantity: 4,
      zone: "mainboard",
      card: { name: "Arcane Signet" },
    },
    {
      quantity: 1,
      zone: "sideboard",
      finish: "etched",
      card: { name: "Negate" },
    },
  ])

  assert.equal(
    text,
    [
      "Mainboard\n4x Arcane Signet\n2x Zedruu the Greathearted (C16) 229 *F*",
      "Sideboard\n1x Negate *E*",
      "Commander\n1x Atraxa, Praetors' Voice (MUL) 98",
    ].join("\n\n"),
  )
})

test("exportDecklistText skips empty and nameless entries", () => {
  const text = exportDecklistText([
    { quantity: 1, zone: "mainboard", card: { name: "" } },
    { quantity: 1, zone: "maybeboard", card: { name: "Consider" } },
  ])

  assert.equal(text, "Maybeboard\n1x Consider")
})

test("exportDecklistText limits output to selected zones without headers", () => {
  const text = exportDecklistText(
    [
      { quantity: 1, zone: "mainboard", card: { name: "Sol Ring" } },
      { quantity: 1, zone: "sideboard", card: { name: "Negate" } },
      { quantity: 1, zone: "commander", card: { name: "Atraxa, Praetors' Voice" } },
    ],
    { zones: ["mainboard", "commander"], zoneHeaders: false },
  )

  assert.equal(text, "1x Sol Ring\n\n1x Atraxa, Praetors' Voice")
})

test("exportDecklistText omits printing and finish when disabled", () => {
  const text = exportDecklistText(
    [
      {
        quantity: 2,
        zone: "mainboard",
        finish: "foil",
        card: { name: "Zedruu the Greathearted" },
        preferredPrinting: { setCode: "c16", collectorNumber: "229" },
      },
    ],
    { zoneHeaders: false, includePrinting: false, includeFinish: false },
  )

  assert.equal(text, "2x Zedruu the Greathearted")
})

test("exportDecklistText supports bare quantity style", () => {
  const text = exportDecklistText(
    [{ quantity: 3, zone: "mainboard", card: { name: "Llanowar Elves" } }],
    { zoneHeaders: false, quantityStyle: "1" },
  )

  assert.equal(text, "3 Llanowar Elves")
})
