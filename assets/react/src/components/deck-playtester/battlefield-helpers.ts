import type { DragEvent } from "react"
import type { PlaytestCard } from "../../lib/deck-playtest"
import {
  BATTLEFIELD_CARD_ASPECT_HEIGHT,
  BATTLEFIELD_CARD_WIDTH_REM,
  BATTLEFIELD_DEFAULT_OFFSET_X,
  BATTLEFIELD_DEFAULT_OFFSET_Y,
  BATTLEFIELD_DEFAULT_X,
  BATTLEFIELD_DEFAULT_Y,
  BATTLEFIELD_SNAP_PX,
  MAX_ZOOM,
  MIN_ZOOM,
} from "./constants"
import type { BattlefieldCardPosition } from "./types"

export function defaultBattlefieldPosition(index: number): BattlefieldCardPosition {
  const safeIndex = Math.max(0, index)

  return {
    x: BATTLEFIELD_DEFAULT_X + (safeIndex % 8) * BATTLEFIELD_DEFAULT_OFFSET_X,
    y: BATTLEFIELD_DEFAULT_Y + (safeIndex % 6) * BATTLEFIELD_DEFAULT_OFFSET_Y,
  }
}

export function defaultBattlefieldPositions(cards: PlaytestCard[]) {
  return Object.fromEntries(
    cards.map((card, index) => [card.id, defaultBattlefieldPosition(index)]),
  )
}

export function battlefieldCardDimensions(surface: HTMLElement, zoom: number) {
  const fontSize = Number.parseFloat(getComputedStyle(surface).fontSize) || 16
  const width = BATTLEFIELD_CARD_WIDTH_REM * zoom * fontSize

  return { height: width * BATTLEFIELD_CARD_ASPECT_HEIGHT, width }
}

/** Keeps a card fully on the battlefield and snaps it to a small grid so rows line up. */
export function clampBattlefieldPosition(
  position: BattlefieldCardPosition,
  surface: HTMLElement,
  zoom: number,
): BattlefieldCardPosition {
  const { height, width } = battlefieldCardDimensions(surface, zoom)
  const maxX = Math.max(0, surface.clientWidth - width)
  const maxY = Math.max(0, surface.clientHeight - height)
  const snap = (value: number) => Math.round(value / BATTLEFIELD_SNAP_PX) * BATTLEFIELD_SNAP_PX

  return {
    x: Math.min(Math.max(0, snap(position.x)), maxX),
    y: Math.min(Math.max(0, snap(position.y)), maxY),
  }
}

/** Cards whose resting rectangle intersects a marquee drawn in surface coordinates. */
export function cardsInMarquee(
  positions: Record<string, BattlefieldCardPosition>,
  marquee: { x: number; y: number; width: number; height: number },
  card: { width: number; height: number },
) {
  return Object.entries(positions)
    .filter(
      ([, position]) =>
        position.x < marquee.x + marquee.width &&
        position.x + card.width > marquee.x &&
        position.y < marquee.y + marquee.height &&
        position.y + card.height > marquee.y,
    )
    .map(([cardId]) => cardId)
}

export function battlefieldPositionFromDrop(
  event: DragEvent<HTMLElement>,
  surface: HTMLElement,
  zoom: number,
  dragOffset?: BattlefieldCardPosition,
): BattlefieldCardPosition {
  const rect = surface.getBoundingClientRect()
  const { height, width } = battlefieldCardDimensions(surface, zoom)
  const offset = dragOffset || { x: width / 2, y: height / 2 }

  return clampBattlefieldPosition(
    {
      x: event.clientX - rect.left - offset.x,
      y: event.clientY - rect.top - offset.y,
    },
    surface,
    zoom,
  )
}

export function battlefieldPositionFromPointer(
  clientX: number,
  clientY: number,
  surface: HTMLElement,
  zoom: number,
  offset: BattlefieldCardPosition,
): BattlefieldCardPosition {
  const rect = surface.getBoundingClientRect()

  return clampBattlefieldPosition(
    {
      x: clientX - rect.left - offset.x,
      y: clientY - rect.top - offset.y,
    },
    surface,
    zoom,
  )
}

const SLOT_GAP_PX = 16
const SLOT_PADDING_PX = 16
// Keeps the bottom land row clear of the floating game log and selection toolbar.
const SLOT_BOTTOM_CLEARANCE_PX = 76

/**
 * Finds the first open slot for a newly played card so cards line up instead of piling on top of
 * each other: nonland permanents fill rows from the top, lands fill rows from the bottom.
 */
export function findOpenBattlefieldPosition(
  positions: BattlefieldCardPosition[],
  bounds: { height: number; width: number },
  { isLand, remPx = 16, zoom = 1 }: { isLand: boolean; remPx?: number; zoom?: number },
): BattlefieldCardPosition {
  const width = BATTLEFIELD_CARD_WIDTH_REM * remPx * zoom
  const height = width * BATTLEFIELD_CARD_ASPECT_HEIGHT
  // A tapped card turns sideways about its centre, so slots are spaced for that footprint and
  // neighbours never overlap when tapped.
  const tappedOverhang = (height - width) / 2
  const strideX = height + SLOT_GAP_PX / 2
  const strideY = height + SLOT_GAP_PX
  const left = SLOT_PADDING_PX + tappedOverhang
  const columns = Math.max(1, Math.floor((bounds.width - left * 2 + strideX - width) / strideX))
  const rows = Math.max(
    1,
    Math.floor(
      (bounds.height - SLOT_PADDING_PX - SLOT_BOTTOM_CLEARANCE_PX + SLOT_GAP_PX) / strideY,
    ),
  )
  const isOpen = (slot: BattlefieldCardPosition) =>
    positions.every(
      (position) =>
        Math.abs(position.x - slot.x) >= width * 0.6 ||
        Math.abs(position.y - slot.y) >= height * 0.6,
    )

  for (let row = 0; row < rows; row += 1) {
    const y = isLand
      ? Math.max(SLOT_PADDING_PX, bounds.height - SLOT_BOTTOM_CLEARANCE_PX - height - row * strideY)
      : SLOT_PADDING_PX + row * strideY
    for (let column = 0; column < columns; column += 1) {
      const slot = { x: Math.round(left + column * strideX), y }
      if (isOpen(slot)) return slot
    }
  }

  // The board is full: cascade from the first slot so the new card stays visible.
  const overflow = positions.length % 8
  return {
    x: SLOT_PADDING_PX + overflow * BATTLEFIELD_DEFAULT_OFFSET_X,
    y: SLOT_PADDING_PX + overflow * BATTLEFIELD_DEFAULT_OFFSET_Y,
  }
}

const CARD_TYPES = [
  "artifact",
  "battle",
  "creature",
  "enchantment",
  "instant",
  "kindred",
  "land",
  "planeswalker",
  "sorcery",
]

/** Distinct card types among cards, as counted for delirium. */
export function countCardTypes(cards: Pick<PlaytestCard, "typeLine">[]) {
  const types = new Set<string>()
  for (const card of cards) {
    const front = (card.typeLine || "").split("—")[0].toLowerCase()
    for (const type of CARD_TYPES) if (new RegExp(`\\b${type}\\b`).test(front)) types.add(type)
    if (/\btribal\b/.test(front)) types.add("kindred")
  }
  return types.size
}

export function isLandCard(card: Pick<PlaytestCard, "typeLine">) {
  return /\bland\b/i.test(card.typeLine || "")
}

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 10) / 10))
}
