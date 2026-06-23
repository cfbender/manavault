import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Flame,
  Hand,
  Skull,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import type { PlaytestZone } from "../../lib/deck-playtest"
import type { CardAction } from "./types"

export const STARTING_LIFE_TOTAL = 40
export const MAX_HISTORY = 40
export const BATTLEFIELD_CARD_WIDTH_REM = 9
export const BATTLEFIELD_CARD_ASPECT_HEIGHT = 7 / 5
export const BATTLEFIELD_DEFAULT_X = 96
export const BATTLEFIELD_DEFAULT_Y = 92
export const BATTLEFIELD_DEFAULT_OFFSET_X = 32
export const BATTLEFIELD_DEFAULT_OFFSET_Y = 24
export const MIN_ZOOM = 0.7
export const MAX_ZOOM = 1.35
export const ZOOM_STEP = 0.1
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

export const ZONE_ACTIONS: Partial<Record<PlaytestZone, CardAction[]>> = {
  battlefield: [
    { icon: Hand, label: "Hand", to: "hand" },
    { icon: Skull, label: "Graveyard", to: "graveyard" },
    { icon: Flame, label: "Exile", to: "exile" },
    { icon: ArrowUpFromLine, label: "Top", placement: "top", to: "library" },
    { icon: ArrowDownToLine, label: "Bottom", placement: "bottom", to: "library" },
  ],
  command: [
    { icon: Sparkles, label: "Cast", to: "battlefield" },
    { icon: Hand, label: "Hand", to: "hand" },
  ],
  exile: [
    { icon: Hand, label: "Hand", to: "hand" },
    { icon: Skull, label: "Graveyard", to: "graveyard" },
    { icon: Sparkles, label: "Battlefield", to: "battlefield" },
  ],
  graveyard: [
    { icon: Hand, label: "Hand", to: "hand" },
    { icon: Sparkles, label: "Battlefield", to: "battlefield" },
    { icon: Flame, label: "Exile", to: "exile" },
  ],
  hand: [
    { icon: Sparkles, label: "Play", to: "battlefield" },
    { icon: Skull, label: "Discard", to: "graveyard" },
    { icon: Flame, label: "Exile", to: "exile" },
    { icon: ArrowUpFromLine, label: "Top", placement: "top", to: "library" },
    { icon: ArrowDownToLine, label: "Bottom", placement: "bottom", to: "library" },
  ],
}

export const PEEK_LIBRARY_ACTIONS = [
  { icon: Hand, label: "Hand", shortcut: "H", title: "Add to Hand", to: "hand" },
  { icon: Sparkles, label: "Play", shortcut: "B", title: "Play / Battlefield", to: "battlefield" },
  { icon: Skull, label: "Graveyard", shortcut: "G", title: "Move to Graveyard", to: "graveyard" },
  { icon: Flame, label: "Exile", shortcut: "E", title: "Move to Exile", to: "exile" },
] satisfies Array<CardAction & { icon: LucideIcon; shortcut: string; title: string }>
