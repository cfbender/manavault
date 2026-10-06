import type { ReactNode } from "react"
import type { PlaytestState, PlaytestZone } from "../../lib/deck-playtest"

export type DeckPlaytesterProps = {
  closeSlot?: ReactNode
  deckId: string
  deckName: string
  initialState: PlaytestState
  /** Tokens this deck's cards can make, offered first in the token dialog. */
  tokenOptions?: TokenFormValues[]
}

export type PlaytestSettings = {
  drawOnNextTurn: boolean
  showHoverPreview: boolean
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

export type PeekMode = "Library" | "Look" | "Scry" | "Surveil" | "Graveyard" | "Exile"

export type CounterKind = "plusOneCounters" | "minusOneCounters" | "markers"

export type PlayerCounterKind = "poison" | "energy" | "experience"

export type PlayerCounters = Record<PlayerCounterKind, number>

export type PeekState = {
  count: number
  mode: PeekMode
} | null

export type TokenFormValues = {
  imageUrl?: string | null
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
  /** Every card moving together (the selection when dragging a selected card). */
  cardIds: string[]
  frame: number | null
  moved: boolean
  startClientX: number
  startClientY: number
  startPositions: Record<string, BattlefieldCardPosition>
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
  playerCounters: PlayerCounters
}
