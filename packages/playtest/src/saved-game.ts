import type { PlaytestCard, PlaytestState } from "./engine"
import type { PlaytestSettings, PlaytestSnapshot } from "./types"

const GAME_VERSION = 1
const ZONES = ["battlefield", "command", "exile", "graveyard", "hand", "library"] as const

export const DEFAULT_SETTINGS: PlaytestSettings = { drawOnNextTurn: true, showHoverPreview: true }

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
 * Returns the in-progress game saved under this key, or null when there is none or the decklist has
 * changed since it was saved (the saved cards would no longer match the deck).
 */
export function loadSavedGame(key: string, initialState: PlaytestState) {
  try {
    const raw = window.localStorage.getItem(key)
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

export function saveGame(key: string, snapshot: PlaytestSnapshot) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ snapshot, version: GAME_VERSION }))
  } catch {
    // Storage can be full or disabled (private mode); the game still works without autosave.
  }
}

export function loadSettings(key: string | undefined): PlaytestSettings {
  if (!key) return DEFAULT_SETTINGS
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(window.localStorage.getItem(key) || "{}") }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(key: string | undefined, settings: PlaytestSettings) {
  if (!key) return
  try {
    window.localStorage.setItem(key, JSON.stringify(settings))
  } catch {
    // Settings simply won't persist.
  }
}
