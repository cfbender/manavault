import type { PlaytestZone } from "./engine"

/**
 * Whether a press has travelled far enough to become a drag. Shorter presses stay clicks; fingers
 * wobble more than mice, so taps get more slack.
 */
export function movedPastThreshold(dx: number, dy: number, pointerType: string) {
  return Math.abs(dx) + Math.abs(dy) > (pointerType === "touch" ? 10 : 3)
}

/** Finds the zone (hand, graveyard, ...) under a point, ignoring the dragged card itself. */
export function dropZoneAt(clientX: number, clientY: number): PlaytestZone | null {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const zone = (element as HTMLElement).closest<HTMLElement>("[data-playtest-zone]")
    if (zone) return zone.dataset.playtestZone as PlaytestZone
  }
  return null
}
