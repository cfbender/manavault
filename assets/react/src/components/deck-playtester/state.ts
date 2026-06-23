import { createPlaytestState, type PlaytestState, type PlaytestZone } from "../../lib/deck-playtest"
import { defaultBattlefieldPositions } from "./battlefield-helpers"
import { STARTING_LIFE_TOTAL } from "./constants"
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
  }
}

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

export function cardZone(state: PlaytestState, cardId: string): PlaytestZone | null {
  const zones: PlaytestZone[] = ["hand", "battlefield", "graveyard", "exile", "command", "library"]
  return zones.find((zone) => state[zone].some((card) => card.id === cardId)) || null
}
