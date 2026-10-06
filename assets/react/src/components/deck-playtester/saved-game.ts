import type { PlaytestCard, PlaytestState } from "../../lib/deck-playtest"
import type { PlaytestSettings, PlaytestSnapshot } from "./types"

const GAME_VERSION = 1
const ZONES = ["battlefield", "command", "exile", "graveyard", "hand", "library"] as const

export const DEFAULT_SETTINGS: PlaytestSettings = { drawOnNextTurn: true, showHoverPreview: true }

function gameKey(deckId: string) {
  return `manavault:playtest:${deckId}`
}

function deckCardIds(cards: PlaytestCard[]) {
  return cards
    .filter((card) => card.deckCardId !== "playtest-token")
    .map((card) => card.id)
    .sort()
    .join("|")
}

function allCards(state: PlaytestState) {
  return ZONES.flatMap((zone) => state[zone])
}

/**
 * Returns the in-progress game saved for this deck, or null when there is none or the decklist has
 * changed since it was saved (the saved cards would no longer match the deck).
 */
export function loadSavedGame(deckId: string, initialState: PlaytestState) {
  try {
    const raw = window.localStorage.getItem(gameKey(deckId))
    if (!raw) return null
    const saved = JSON.parse(raw) as { snapshot?: PlaytestSnapshot; version?: number }
    const snapshot = saved.snapshot
    if (saved.version !== GAME_VERSION || !snapshot?.state) return null
    if (!ZONES.every((zone) => Array.isArray(snapshot.state[zone]))) return null
    if (deckCardIds(allCards(snapshot.state)) !== deckCardIds(allCards(initialState))) return null
    return snapshot
  } catch {
    return null
  }
}

export function saveGame(deckId: string, snapshot: PlaytestSnapshot) {
  try {
    window.localStorage.setItem(
      gameKey(deckId),
      JSON.stringify({ snapshot, version: GAME_VERSION }),
    )
  } catch {
    // Storage can be full or disabled (private mode); the game still works without autosave.
  }
}

const SETTINGS_KEY = "manavault:playtest-settings"

export function loadSettings(): PlaytestSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}") }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: PlaytestSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Settings simply won't persist.
  }
}
