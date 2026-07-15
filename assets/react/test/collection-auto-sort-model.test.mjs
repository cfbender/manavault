import assert from "node:assert/strict"
import test from "node:test"

import {
  AUTO_SORT_RARITIES,
  centsToCurrencyInput,
  cloneAutoSortRuleRow,
  formRowsToAutoSortRuleInput,
  moveAutoSortRuleRow,
  newAutoSortRuleRow,
  parseCurrencyInputCents,
  releaseDateInputValue,
  rulesToFormRows,
} from "../src/pages/settings/collection-auto-sort-model.ts"

const BOX = { id: "box-1", kind: "box", name: "Trade binder" }

function formRow(key, changes = {}) {
  return {
    ...newAutoSortRuleRow(BOX),
    id: key,
    key,
    name: `Rule ${key}`,
    ...changes,
  }
}

function sourceRule(id, changes = {}) {
  return {
    colorMode: "any",
    colors: [],
    enabled: true,
    id,
    maxPriceCents: null,
    minPriceCents: null,
    name: `Rule ${id}`,
    priority: 1,
    rarities: [],
    releaseDate: null,
    releaseDateOperator: "after",
    setCodes: [],
    setOperator: "in",
    targetLocation: BOX,
    typeLineExcludes: [],
    typeLineIncludes: [],
    ...changes,
  }
}

test("form conversion normalizes lists, enums, currency, and one-based priorities", () => {
  const result = formRowsToAutoSortRuleInput([
    formRow("rule-1", {
      colorMode: "exact",
      colors: ["G", "W", "invalid", "W"],
      maxPrice: "1,234.56",
      minPrice: " $1,234.5",
      name: "  Treasury cards  ",
      rarities: ["bonus", "rare", "unknown", "rare"],
      releaseDate: "2024-02-29",
      releaseDateOperator: "before",
      setCodes: " lea, dmu, lea ",
      setOperator: "not_in",
      typeLineExcludes: " token, basic ",
      typeLineIncludes: " creature, legendary ",
    }),
    formRow("rule-2", {
      colorMode: "not-a-mode",
      colors: ["U"],
      releaseDateOperator: "not-an-operator",
      setOperator: "not-an-operator",
    }),
  ])

  assert.deepEqual(result, [
    {
      id: "rule-1",
      colorMode: "exact",
      colors: ["W", "G"],
      enabled: true,
      maxPriceCents: 123456,
      minPriceCents: 123450,
      name: "Treasury cards",
      priority: 1,
      rarities: ["rare", "bonus"],
      releaseDate: "2024-02-29",
      releaseDateOperator: "before",
      setCodes: ["lea", "dmu", "lea"],
      setOperator: "not_in",
      targetLocationId: "box-1",
      typeLineExcludes: ["token", "basic"],
      typeLineIncludes: ["creature", "legendary"],
    },
    {
      id: "rule-2",
      colorMode: "any",
      colors: [],
      enabled: true,
      maxPriceCents: null,
      minPriceCents: null,
      name: "Rule rule-2",
      priority: 2,
      rarities: [],
      releaseDate: null,
      releaseDateOperator: "after",
      setCodes: [],
      setOperator: "in",
      targetLocationId: "box-1",
      typeLineExcludes: [],
      typeLineIncludes: [],
    },
  ])
})

test("form conversion preserves every validation message and rejects invalid ranges", () => {
  const cases = [
    [formRow("blank", { name: "  " }), "Each auto-sort rule needs a name."],
    [
      formRow("target", { name: "No destination", targetLocationId: "" }),
      "No destination: choose a box or binder destination.",
    ],
    [
      formRow("minimum", { name: "Minimum", minPrice: "5.678" }),
      "Minimum: minimum price must be a dollar amount.",
    ],
    [
      formRow("maximum", { name: "Maximum", maxPrice: "USD 5" }),
      "Maximum: maximum price must be a dollar amount.",
    ],
    [
      formRow("range", { name: "Range", minPrice: "5", maxPrice: "4.99" }),
      "Range: minimum price cannot be greater than maximum price.",
    ],
    [
      formRow("date", { name: "Date", releaseDate: "2023-02-29" }),
      "Date: release date must be a valid date.",
    ],
  ]

  for (const [row, message] of cases) {
    assert.equal(formRowsToAutoSortRuleInput([row]), message)
  }
})

test("currency and release-date parsing accepts valid user input and rejects invalid values", () => {
  assert.equal(parseCurrencyInputCents(""), null)
  assert.equal(parseCurrencyInputCents(" $1,234.5 "), 123450)
  assert.equal(parseCurrencyInputCents("0.01"), 1)
  assert.equal(parseCurrencyInputCents("-1"), undefined)
  assert.equal(parseCurrencyInputCents("1.234"), undefined)
  assert.equal(centsToCurrencyInput(123400), "1234")
  assert.equal(centsToCurrencyInput(123456), "1234.56")
  assert.equal(centsToCurrencyInput(Number.NaN), "")

  assert.equal(releaseDateInputValue("  "), null)
  assert.equal(releaseDateInputValue("2024-02-29"), "2024-02-29")
  assert.equal(releaseDateInputValue("2024-2-29"), undefined)
  assert.equal(releaseDateInputValue("2023-02-29"), undefined)
})

test("server rules normalize allowed values and sort deterministically by priority, name, then id", () => {
  const rows = rulesToFormRows(
    [
      sourceRule("id-b", { name: "Alpha", priority: 2 }),
      sourceRule("id-c", { name: "Beta", priority: 1 }),
      sourceRule("id-a", { name: "Alpha", priority: 1 }),
      sourceRule("id-d", {
        colorMode: "unknown",
        colors: ["U", "U", "X", "W"],
        rarities: ["bonus", "rare", "bad"],
        setCodes: ["lea", "dmu"],
      }),
    ],
    [BOX],
  )

  assert.deepEqual(
    rows.map((row) => row.key),
    ["id-a", "id-c", "id-d", "id-b"],
  )
  assert.deepEqual(rows[2].colors, ["W", "U"])
  assert.deepEqual(rows[2].rarities, ["rare", "bonus"])
  assert.equal(rows[2].colorMode, "any")
  assert.equal(rows[2].setCodes, "lea, dmu")
  assert.deepEqual(AUTO_SORT_RARITIES, ["common", "uncommon", "rare", "mythic", "special", "bonus"])
})

test("row cloning isolates list edits and movement preserves deterministic boundaries", () => {
  const first = formRow("first", { colors: ["W"], rarities: ["rare"] })
  const clone = cloneAutoSortRuleRow(first)
  clone.colors.push("U")
  clone.rarities.push("bonus")

  assert.deepEqual(first.colors, ["W"])
  assert.deepEqual(first.rarities, ["rare"])

  const rows = [first, formRow("second"), formRow("third")]
  assert.deepEqual(
    moveAutoSortRuleRow(rows, "second", -1).map((row) => row.key),
    ["second", "first", "third"],
  )
  assert.strictEqual(moveAutoSortRuleRow(rows, "first", -1), rows)
  assert.strictEqual(moveAutoSortRuleRow(rows, "missing", 1), rows)
})
