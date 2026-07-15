import type { DeckZone } from "./deck-types"

export type DetailZoneCounts = Record<DeckZone, number>

export type DeckLegalityIssue = {
  code?: string | null
  cardName?: string | null
  message: string
}

export type DeckPrice = {
  label: string
  loading: boolean
  unpricedQuantity: number
}
