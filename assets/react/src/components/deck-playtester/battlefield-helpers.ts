import type { DragEvent } from "react"
import type { PlaytestCard } from "../../lib/deck-playtest"
import {
  BATTLEFIELD_CARD_ASPECT_HEIGHT,
  BATTLEFIELD_CARD_WIDTH_REM,
  BATTLEFIELD_DEFAULT_OFFSET_X,
  BATTLEFIELD_DEFAULT_OFFSET_Y,
  BATTLEFIELD_DEFAULT_X,
  BATTLEFIELD_DEFAULT_Y,
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

function battlefieldCardDimensions(surface: HTMLElement, zoom: number) {
  const fontSize = Number.parseFloat(getComputedStyle(surface).fontSize) || 16
  const width = BATTLEFIELD_CARD_WIDTH_REM * zoom * fontSize

  return { height: width * BATTLEFIELD_CARD_ASPECT_HEIGHT, width }
}

function clampBattlefieldPosition(
  position: BattlefieldCardPosition,
  surface: HTMLElement,
  zoom: number,
): BattlefieldCardPosition {
  const { height, width } = battlefieldCardDimensions(surface, zoom)
  const maxX = Math.max(0, surface.clientWidth - width)
  const maxY = Math.max(0, surface.clientHeight - height)

  return {
    x: Math.min(Math.max(0, position.x), maxX),
    y: Math.min(Math.max(0, position.y), maxY),
  }
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

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 10) / 10))
}
