import type { CardSize } from "../../lib/card-size"
import type { DeckCardEntry, DeckCardTag, DeckCustomTag } from "./deck-types"

export type DeckStackCardActions = {
  addPartner: () => void
  allocate: (collectionItemId: string) => void
  assignTag: (tagId: string) => void
  delete: () => void
  deallocate: (collectionItemId: string) => void
  edit: () => void
  move: () => void
  preview: () => void
  reveal: () => void
  setCommander: () => void
  tag: (tag: DeckCardTag | null) => void
  toggleProxy: () => void
  toggleSelected: (selectRange?: boolean) => void
  unassignTag: (tagId: string) => void
}

export type DeckStackCardProps = {
  actions: DeckStackCardActions
  capabilities: {
    canAddPartner: boolean
    canSetCommander: boolean
  }
  card: DeckCardEntry
  context: {
    deckId: string
    deckTags: DeckCustomTag[]
    shareMode: boolean
  }
  position: {
    index: number
    size: CardSize
    slideOffset: number
    top: number
  }
  state: {
    isActive: boolean
    isDimmed: boolean
    isSelecting: boolean
    isSelected: boolean
    isUpdating: boolean
  }
}
