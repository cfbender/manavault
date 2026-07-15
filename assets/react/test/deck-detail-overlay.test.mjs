import assert from "node:assert/strict"
import test from "node:test"

import {
  bulkAllocationOverlay,
  editCardOverlay,
  moveCardOverlay,
  NO_DECK_DETAIL_OVERLAY,
  updateBulkAllocationOverlay,
  updateCardWorkflowError,
} from "../src/pages/decks/deck-detail-overlay.ts"

const deckCard = { id: "deck-card-1" }

test("deck detail overlays switch workflows without retaining a prior card target or error", () => {
  const editing = updateCardWorkflowError(editCardOverlay(deckCard), "edit-card", "Name is required")
  const bulk = bulkAllocationOverlay()

  assert.deepEqual(editing, {
    kind: "edit-card",
    deckCard,
    error: "Name is required",
  })
  assert.deepEqual(bulk, {
    kind: "bulk-allocation",
    error: null,
    excludedEntryIds: {},
    mode: "any",
    selectedItemIds: {},
  })
  assert.equal("deckCard" in bulk, false)
})

test("deck detail bulk allocation mode switches clear stale choices, exclusions, and failures", () => {
  const initial = bulkAllocationOverlay()
  const withStaleState = updateBulkAllocationOverlay(initial, {
    error: "One copy is no longer available",
    excludedEntryIds: { "entry-1": true },
    selectedItemIds: { "choice-1": "collection-item-1" },
  })
  const switched = updateBulkAllocationOverlay(withStaleState, {
    error: null,
    excludedEntryIds: {},
    mode: "exact",
    selectedItemIds: {},
  })

  assert.deepEqual(switched, {
    kind: "bulk-allocation",
    error: null,
    excludedEntryIds: {},
    mode: "exact",
    selectedItemIds: {},
  })
})

test("deck detail cancel and completion reset an active overlay to the explicit empty state", () => {
  const moving = moveCardOverlay(deckCard)

  assert.equal(moving.kind, "move-card")
  assert.equal(NO_DECK_DETAIL_OVERLAY.kind, "none")
  assert.equal(updateCardWorkflowError(NO_DECK_DETAIL_OVERLAY, "move-card", "ignored"), NO_DECK_DETAIL_OVERLAY)
})
