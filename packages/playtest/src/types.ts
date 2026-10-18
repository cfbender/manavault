import type { ReactNode } from "react"
import type { PlaytestState, PlaytestZone } from "./engine"

/** A value the host app owns (the table's life total, say) and the playtester displays and edits. */
export type HostValue<T> = {
  onChange: (next: T) => void
  value: T
}

export type PlaytestAppearance = {
  /**
   * Maps a mana symbol to an image URL. Symbols use Scryfall's file names: braces and slashes
   * removed, uppercase (`{2/W}` becomes `2W`). Without it, hand cards show no mana cost pips.
   */
  manaSymbolUrl?: (symbol: string) => string
  /** Logo printed on card backs (the library and face-down cards). Omit for a plain sleeve. */
  sleeveImageUrl?: string
}

export type DeckPlaytesterProps = PlaytestAppearance & {
  /** Rendered at the start of the top bar, e.g. a back link or a close button. */
  closeSlot?: ReactNode
  /** The deal a new game starts from; restarting reshuffles it. */
  initialState: PlaytestState
  /**
   * Host-owned life total. Omit to let the playtester track life in its snapshot; pass `null` to
   * hide the life control.
   */
  life?: HostValue<number> | null
  /** Called after every change to the game, including undo and restart. */
  onSnapshotChange?: (snapshot: PlaytestSnapshot) => void
  /** Host-owned poison, energy, and experience. Omit to track them here; `null` hides them. */
  playerCounters?: HostValue<PlayerCounters> | null
  /**
   * localStorage key for autosaving an uncontrolled game, resumed while the decklist is unchanged.
   * Omit to disable autosave.
   */
  saveKey?: string
  /** localStorage key for the player's settings. Omit to keep settings for this session only. */
  settingsKey?: string
  /** Controlled game state. Pair it with `onSnapshotChange`; omit for a local game. */
  snapshot?: PlaytestSnapshot
  /** Shown in the top bar. */
  title: string
  /** Tokens this deck's cards can make, offered first in the token dialog. */
  tokenOptions?: TokenFormValues[]
  /**
   * Host-owned turn number. "Next turn" still untaps and draws, then asks the host to advance.
   * Omit to count turns here; `null` hides the turn counter and the next-turn button.
   */
  turn?: HostValue<number> | null
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

export type BattlefieldCardPosition = {
  x: number
  y: number
}

/**
 * One player's whole game: zones, battlefield layout, card statuses, and the player's own
 * life, counters, and turn. Serializable as JSON.
 */
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
