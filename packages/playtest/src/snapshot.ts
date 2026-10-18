import { defaultBattlefieldPositions } from "./battlefield-helpers"
import { STARTING_LIFE_TOTAL } from "./constants"
import { createPlaytestState, drawCards, type PlaytestState, type PlaytestZone } from "./engine"
import type { PlaytestSnapshot } from "./types"

export function initialSnapshot(initialState: PlaytestState): PlaytestSnapshot {
  return {
    battlefieldCardPositions: defaultBattlefieldPositions(initialState.battlefield),
    cardStatuses: {},
    state: initialState,
    tappedCardIds: [],
    turn: 1,
    lifeTotal: STARTING_LIFE_TOTAL,
    openingHand: true,
    playerCounters: { energy: 0, experience: 0, poison: 0 },
  }
}

/** A fresh game from the same cards: everything shuffled back and a new opening hand drawn. */
export function shuffledOpeningState(initialState: PlaytestState) {
  return createPlaytestState(
    [
      ...initialState.library,
      ...initialState.hand,
      ...initialState.battlefield,
      ...initialState.graveyard,
      ...initialState.exile,
    ],
    initialState.command,
  )
}

/** The next turn's untap step, plus its draw step unless `draw` is false. */
export function nextTurnSnapshot(
  snapshot: PlaytestSnapshot,
  { draw = true }: { draw?: boolean } = {},
): PlaytestSnapshot {
  return {
    ...snapshot,
    state: draw ? drawCards(snapshot.state, 1) : snapshot.state,
    tappedCardIds: [],
    turn: snapshot.turn + 1,
    openingHand: false,
  }
}

export function cardZone(state: PlaytestState, cardId: string): PlaytestZone | null {
  const zones: PlaytestZone[] = ["hand", "battlefield", "graveyard", "exile", "command", "library"]
  return zones.find((zone) => state[zone].some((card) => card.id === cardId)) || null
}
