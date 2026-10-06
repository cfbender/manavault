import type { PlaytestZone } from "../../lib/deck-playtest"

export const STARTING_LIFE_TOTAL = 40
export const MAX_HISTORY = 40
export const MAX_LOG_ENTRIES = 30
export const BATTLEFIELD_CARD_WIDTH_REM = 7
export const BATTLEFIELD_CARD_ASPECT_HEIGHT = 7 / 5
export const BATTLEFIELD_DEFAULT_X = 96
export const BATTLEFIELD_DEFAULT_Y = 92
export const BATTLEFIELD_DEFAULT_OFFSET_X = 32
export const BATTLEFIELD_DEFAULT_OFFSET_Y = 24
export const MIN_ZOOM = 0.6
export const COMPACT_ZOOM = 0.85
export const MAX_ZOOM = 1.6
export const ZOOM_STEP = 0.1
export const BATTLEFIELD_SNAP_PX = 8
export const DRAG_MIME = "application/x-manavault-playtest-card"
export const DRAG_PREVIEW_MIN_WIDTH = 112
export const DRAG_PREVIEW_MAX_WIDTH = 168
export const HOVER_PREVIEW_DELAY_MS = 450

export const ZONE_LABELS: Record<PlaytestZone, string> = {
  battlefield: "Battlefield",
  command: "Command",
  exile: "Exile",
  graveyard: "Graveyard",
  hand: "Hand",
  library: "Library",
}
