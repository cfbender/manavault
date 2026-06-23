import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { PlaytestState, PlaytestZone } from "../../lib/deck-playtest"

export type DeckPlaytesterProps = {
  closeSlot?: ReactNode
  deckId: string
  deckName: string
  initialState: PlaytestState
}

export type CardAction = {
  label: string
  to: PlaytestZone
  icon?: LucideIcon
  placement?: "top" | "bottom"
}

export type CardStatus = {
  faceDown?: boolean
  markers: number
  minusOneCounters: number
  plusOneCounters: number
  power?: string
  toughness?: string
}

export type ContextMenuState = {
  cardId: string
  zone: PlaytestZone
  x: number
  y: number
} | null

export type CardHoverTarget = {
  cardId: string
  zone: PlaytestZone
}

export type PeekMode = "Library" | "Look" | "Scry" | "Surveil"

export type PeekState = {
  count: number
  mode: PeekMode
} | null

export type TokenFormValues = {
  name: string
  power: string
  toughness: string
  typeLine: string
}

export type DragPayload = {
  cardId: string
  from: PlaytestZone
  offsetX?: number
  offsetY?: number
}

export type BattlefieldCardPosition = {
  x: number
  y: number
}

export type BattlefieldPointerDrag = {
  cardId: string
  frame: number | null
  latestClientX: number
  latestClientY: number
  offset: BattlefieldCardPosition
  pointerId: number
  surface: HTMLDivElement
}

export type PlaytestSnapshot = {
  battlefieldCardPositions: Record<string, BattlefieldCardPosition>
  cardStatuses: Record<string, CardStatus>
  state: PlaytestState
  tappedCardIds: string[]
  turn: number
  lifeTotal: number
  openingHand: boolean
}
