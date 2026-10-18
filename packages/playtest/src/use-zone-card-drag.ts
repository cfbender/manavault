import { useCallback, useRef, useState, type PointerEvent } from "react"
import { dropZoneAt, movedPastThreshold } from "./drag-helpers"
import type { PlaytestCard, PlaytestZone } from "./engine"

type Point = { x: number; y: number }

/** A card dragged out of the hand or a pile, drawn under the pointer while it moves. */
export type ZoneCardGhost = {
  card: PlaytestCard
  /** Where the card was grabbed, relative to its top-left corner. */
  offset: Point
  pointer: Point
  size: { height: number; width: number }
}

type ZoneCardDrag = ZoneCardGhost & {
  frame: number | null
  from: PlaytestZone
  moved: boolean
  pointerId: number
  pointerType: string
  start: Point
}

export type ZoneCardDrop = ZoneCardGhost & { from: PlaytestZone; to: PlaytestZone | null }

/**
 * Pointer-event dragging for cards outside the battlefield (hand, graveyard, exile, command), so it
 * works the same with a mouse, a pen, or a finger. A press that never moves stays a click.
 */
export function useZoneCardDrag({
  onDragEnd,
  onDragStart,
  onDrop,
  onOverZone,
}: {
  onDragEnd: () => void
  onDragStart: (card: PlaytestCard) => void
  onDrop: (drop: ZoneCardDrop) => void
  onOverZone: (zone: PlaytestZone | null) => void
}) {
  const dragRef = useRef<ZoneCardDrag | null>(null)
  const [ghost, setGhost] = useState<ZoneCardGhost | null>(null)

  const flush = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    drag.frame = null
    setGhost({ card: drag.card, offset: drag.offset, pointer: drag.pointer, size: drag.size })
    const zone = dropZoneAt(drag.pointer.x, drag.pointer.y)
    onOverZone(zone === drag.from ? null : zone)
  }, [onOverZone])

  const end = useCallback(
    (event: PointerEvent<HTMLElement>, drop: boolean) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (drag.frame !== null) window.cancelAnimationFrame(drag.frame)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      dragRef.current = null
      setGhost(null)
      if (!drag.moved) return
      onDragEnd()
      if (!drop) return
      onDrop({
        card: drag.card,
        from: drag.from,
        offset: drag.offset,
        pointer: { x: event.clientX, y: event.clientY },
        size: drag.size,
        to: dropZoneAt(event.clientX, event.clientY),
      })
    },
    [onDragEnd, onDrop],
  )

  /** Pointer handlers for one draggable card. */
  const dragHandlers = useCallback(
    (card: PlaytestCard, from: PlaytestZone) => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey) return
        const rect = event.currentTarget.getBoundingClientRect()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = {
          card,
          frame: null,
          from,
          moved: false,
          offset: { x: event.clientX - rect.left, y: event.clientY - rect.top },
          pointer: { x: event.clientX, y: event.clientY },
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          size: { height: rect.height, width: rect.width },
          start: { x: event.clientX, y: event.clientY },
        }
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        drag.pointer = { x: event.clientX, y: event.clientY }
        if (!drag.moved) {
          const dx = event.clientX - drag.start.x
          const dy = event.clientY - drag.start.y
          if (!movedPastThreshold(dx, dy, drag.pointerType)) return
          drag.moved = true
          onDragStart(card)
        }
        event.preventDefault()
        if (drag.frame === null) drag.frame = window.requestAnimationFrame(flush)
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => end(event, true),
      onPointerCancel: (event: PointerEvent<HTMLElement>) => end(event, false),
    }),
    [end, flush, onDragStart],
  )

  return { dragHandlers, ghost }
}
