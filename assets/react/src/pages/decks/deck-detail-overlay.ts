import type { DeckPullListExclusions, DeckPullListMode } from "./deck-allocation-model"
import type { DeckCardEntry, DeckDisassemblyResult } from "./deck-types"

export type DeckDetailOverlay =
  | { kind: "none" }
  | { kind: "add-card" }
  | {
      kind: "bulk-allocation"
      error: string | null
      excludedEntryIds: DeckPullListExclusions
      mode: DeckPullListMode
      selectedItemIds: Record<string, string | null>
    }
  | { kind: "delete-card"; deckCard: DeckCardEntry }
  | { kind: "delete-selected" }
  | { kind: "disassembly"; result: DeckDisassemblyResult }
  | { kind: "edit-card"; deckCard: DeckCardEntry; error: string | null }
  | { kind: "edit-deck" }
  | { kind: "edhrec" }
  | { kind: "export-deck" }
  | { kind: "import-deck" }
  | { kind: "missing-cards" }
  | { kind: "move-card"; deckCard: DeckCardEntry; error: string | null }
  | { kind: "optimize-printings"; error: string | null }
  | { kind: "preview-card"; deckCard: DeckCardEntry }
  | { kind: "readiness" }
  | { kind: "select-from-list" }
  | { kind: "share-buylist" }
  | { kind: "share-deck" }
  | { kind: "share-playtest" }
  | { kind: "shortcuts" }

export const NO_DECK_DETAIL_OVERLAY: DeckDetailOverlay = { kind: "none" }

export function bulkAllocationOverlay(): DeckDetailOverlay {
  return {
    kind: "bulk-allocation",
    error: null,
    excludedEntryIds: {},
    mode: "any",
    selectedItemIds: {},
  }
}

export function editCardOverlay(deckCard: DeckCardEntry): DeckDetailOverlay {
  return { kind: "edit-card", deckCard, error: null }
}

export function moveCardOverlay(deckCard: DeckCardEntry): DeckDetailOverlay {
  return { kind: "move-card", deckCard, error: null }
}

export function updateBulkAllocationOverlay(
  overlay: DeckDetailOverlay,
  update: Partial<Extract<DeckDetailOverlay, { kind: "bulk-allocation" }>>,
): DeckDetailOverlay {
  if (overlay.kind !== "bulk-allocation") return overlay
  return { ...overlay, ...update }
}

export function updateCardWorkflowError(
  overlay: DeckDetailOverlay,
  kind: "edit-card" | "move-card",
  error: string | null,
): DeckDetailOverlay {
  if (overlay.kind !== kind) return overlay
  return { ...overlay, error }
}
