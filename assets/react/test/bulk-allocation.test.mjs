import test from "node:test"
import assert from "node:assert/strict"

import {
  allocatableDeckPullListEntries,
  createDeckPullList,
  deckPullListSelectionError,
  groupDeckPullListEntriesByLocation,
  selectedDeckPullListEntries,
} from "../src/pages/decks/deck-allocation-model.ts"
import {
  allocationFinishCounts,
  finishLabel,
  isFoilFinish,
} from "../src/pages/decks/printing-labels.ts"

function allocationEntry(quantity, finish) {
  return {
    quantity,
    item: { finish },
  }
}

function allocationCandidate({
  id,
  available,
  scryfallId = id,
  location = { id: "binder", name: "Binder" },
}) {
  return {
    allocated: 0,
    allocatedElsewhere: 0,
    available,
    item: {
      id,
      location,
      printing: {
        scryfallId,
      },
    },
  }
}

function deckCard({
  id = "deck-card-1",
  required,
  allocated = 0,
  preferredScryfallId = "preferred-printing",
  candidates,
  state,
  zone = "mainboard",
}) {
  return {
    id,
    zone,
    preferredPrinting: {
      id: `preferred-${id}`,
      scryfallId: preferredScryfallId,
    },
    allocationStatus: {
      state: state ?? (allocated >= required ? "allocated" : "partial"),
      required,
      allocated,
      available: candidates.reduce((total, candidate) => total + candidate.available, 0),
      candidates,
    },
  }
}

test("allocationFinishCounts summarizes allocated quantities by finish", () => {
  assert.deepEqual(
    allocationFinishCounts([
      allocationEntry(2, "foil"),
      allocationEntry(1, "nonfoil"),
      allocationEntry(3, "etched"),
      allocationEntry(1, null),
    ]),
    [
      { finish: "nonfoil", label: "Nonfoil", quantity: 2 },
      { finish: "foil", label: "Foil", quantity: 2 },
      { finish: "etched", label: "Etched", quantity: 3 },
    ],
  )
})

test("finish helpers identify foil statuses", () => {
  assert.equal(finishLabel(null), "Nonfoil")
  assert.equal(finishLabel("foil"), "Foil")
  assert.equal(finishLabel("etched"), "Etched")
  assert.equal(isFoilFinish("nonfoil"), false)
  assert.equal(isFoilFinish("foil"), true)
  assert.equal(isFoilFinish("etched"), true)
})

test("deck pull list ignores non-mainboard basic land and filled cards", () => {
  const copy = allocationCandidate({
    id: "mainboard-copy",
    available: 1,
    scryfallId: "preferred-printing",
  })
  const ignoredCopy = allocationCandidate({
    id: "ignored-copy",
    available: 1,
    scryfallId: "preferred-printing",
  })
  const pullList = createDeckPullList([
    deckCard({
      id: "sideboard-card",
      required: 1,
      candidates: [ignoredCopy],
      zone: "sideboard",
    }),
    deckCard({
      id: "basic-land-card",
      required: 1,
      candidates: [ignoredCopy],
      state: "basic_land",
    }),
    deckCard({
      id: "filled-card",
      required: 1,
      allocated: 1,
      candidates: [ignoredCopy],
    }),
    deckCard({ id: "mainboard-card", required: 1, candidates: [copy] }),
  ])

  assert.equal(pullList.needed, 1)
  assert.equal(pullList.selected, 1)
  assert.deepEqual(
    selectedDeckPullListEntries(pullList).map((entry) => entry.deckCard.id),
    ["mainboard-card"],
  )
})

test("deck pull list selects exact candidates before partial choices", () => {
  const exact = allocationCandidate({
    id: "exact-copy",
    available: 2,
    scryfallId: "preferred-printing",
  })
  const partial = allocationCandidate({
    id: "partial-copy",
    available: 2,
    scryfallId: "alternate-printing",
  })
  const pullList = createDeckPullList([deckCard({ required: 3, candidates: [exact, partial] })])

  assert.equal(pullList.needed, 3)
  assert.equal(pullList.selected, 3)
  assert.equal(pullList.skipped, 0)
  assert.equal(pullList.exactEntries.length, 1)
  assert.equal(pullList.exactEntries[0].candidate.item.id, "exact-copy")
  assert.equal(pullList.exactEntries[0].quantity, 2)
  assert.equal(pullList.choices.length, 1)
  assert.equal(pullList.choices[0].selectedItemId, "partial-copy")
})

test("deck pull list exact mode skips non-exact copies instead of choices", () => {
  const exact = allocationCandidate({
    id: "exact-copy",
    available: 1,
    scryfallId: "preferred-printing",
  })
  const alternate = allocationCandidate({
    id: "alternate-copy",
    available: 2,
    scryfallId: "alternate-printing",
  })
  const pullList = createDeckPullList(
    [deckCard({ required: 3, candidates: [exact, alternate] })],
    undefined,
    "exact",
  )

  assert.equal(pullList.needed, 3)
  assert.equal(pullList.selected, 1)
  assert.equal(pullList.skipped, 2)
  assert.equal(pullList.exactEntries.length, 1)
  assert.equal(pullList.exactEntries[0].candidate.item.id, "exact-copy")
  assert.equal(pullList.exactEntries[0].quantity, 1)
  assert.equal(pullList.choices.length, 0)
  assert.deepEqual(
    pullList.skippedDeckCards.map((deckCard) => deckCard.id),
    ["deck-card-1"],
  )
})

test("deck pull list creates non-exact choice slots with availability-aware defaults", () => {
  const first = allocationCandidate({
    id: "first-copy",
    available: 1,
    scryfallId: "alternate-one",
  })
  const second = allocationCandidate({
    id: "second-copy",
    available: 2,
    scryfallId: "alternate-two",
  })
  const pullList = createDeckPullList(
    [deckCard({ required: 3, candidates: [first, second] })],
    undefined,
    "any",
  )

  assert.equal(pullList.exactEntries.length, 0)
  assert.equal(pullList.choices.length, 3)
  assert.deepEqual(
    pullList.choices.map((choice) => choice.selectedItemId),
    ["first-copy", "second-copy", "second-copy"],
  )
  assert.deepEqual(
    pullList.choices[0].candidates.map((candidate) => candidate.item.id),
    ["first-copy", "second-copy"],
  )
  assert.equal(deckPullListSelectionError(pullList), null)
})

test("deck pull list defaults respect shared candidate availability across cards", () => {
  const shared = allocationCandidate({
    id: "shared-copy",
    available: 1,
    scryfallId: "alternate-printing",
  })
  const pullList = createDeckPullList([
    deckCard({ id: "first-card", required: 1, candidates: [shared] }),
    deckCard({ id: "second-card", required: 1, candidates: [shared] }),
  ])

  assert.equal(pullList.needed, 2)
  assert.equal(pullList.selected, 1)
  assert.equal(pullList.skipped, 1)
  assert.deepEqual(
    pullList.choices.map((choice) => choice.deckCard.id),
    ["first-card"],
  )
  assert.deepEqual(
    pullList.skippedDeckCards.map((deckCard) => deckCard.id),
    ["second-card"],
  )
})

test("deck pull list groups selected entries by source location", () => {
  const binderCopy = allocationCandidate({
    id: "binder-copy",
    available: 1,
    scryfallId: "preferred-printing",
    location: { id: "binder", name: "Trade Binder" },
  })
  const unfiledCopy = allocationCandidate({
    id: "unfiled-copy",
    available: 1,
    scryfallId: "preferred-printing",
    location: null,
  })
  const pullList = createDeckPullList([
    deckCard({ id: "deck-card-1", required: 1, candidates: [binderCopy] }),
    deckCard({ id: "deck-card-2", required: 1, candidates: [unfiledCopy] }),
  ])
  const groups = groupDeckPullListEntriesByLocation(selectedDeckPullListEntries(pullList))

  assert.deepEqual(
    groups.map((group) => ({
      locationId: group.locationId,
      locationName: group.locationName,
      itemIds: group.entries.map((entry) => entry.candidate.item.id),
    })),
    [
      {
        locationId: "binder",
        locationName: "Trade Binder",
        itemIds: ["binder-copy"],
      },
      {
        locationId: "unfiled",
        locationName: "Unfiled",
        itemIds: ["unfiled-copy"],
      },
    ],
  )
})

test("deck pull list selection error catches over-selecting a candidate", () => {
  const first = allocationCandidate({
    id: "first-copy",
    available: 1,
    scryfallId: "alternate-one",
  })
  const second = allocationCandidate({
    id: "second-copy",
    available: 1,
    scryfallId: "alternate-two",
  })
  const card = deckCard({ required: 2, candidates: [first, second] })
  const defaultPullList = createDeckPullList([card])
  const overSelectedPullList = createDeckPullList([card], {
    [defaultPullList.choices[1].id]: "first-copy",
  })

  assert.equal(deckPullListSelectionError(defaultPullList), null)
  assert.match(deckPullListSelectionError(overSelectedPullList), /exceed/)
})

test("deck pull list selection error catches unselected choices", () => {
  const copy = allocationCandidate({
    id: "available-copy",
    available: 1,
    scryfallId: "alternate-printing",
  })
  const card = deckCard({ required: 1, candidates: [copy] })
  const defaultPullList = createDeckPullList([card])
  const unselectedPullList = createDeckPullList([card], {
    [defaultPullList.choices[0].id]: null,
  })

  assert.match(deckPullListSelectionError(unselectedPullList), /Choose/)
})

test("deck pull list excludes toggled-off entries from allocation", () => {
  const exact = allocationCandidate({
    id: "exact-copy",
    available: 1,
    scryfallId: "preferred-printing",
  })
  const alternate = allocationCandidate({
    id: "alternate-copy",
    available: 1,
    scryfallId: "alternate-printing",
  })
  const pullList = createDeckPullList([
    deckCard({ id: "deck-card-1", required: 2, candidates: [exact, alternate] }),
  ])
  const selectedEntries = selectedDeckPullListEntries(pullList)
  const excludedEntryIds = { [selectedEntries[0].id]: true, [pullList.choices[0].id]: true }

  assert.equal(allocatableDeckPullListEntries(pullList, excludedEntryIds).length, 0)
  assert.equal(deckPullListSelectionError(pullList, excludedEntryIds), null)
})
