import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react"

import { cn } from "../../lib/utils"
import { DeckCardTagRadial, type DeckCardTagRadialHandle } from "./deck-card-tag-radial"
import type { DeckStackCardActions } from "./deck-stack-card-types"
import type { DeckCustomTag } from "./deck-types"

const TAG_DRAG_THRESHOLD_PX = 8

export function DeckStackTagControl({
  actions,
  assignedTagIds,
  deckTags,
  isActive,
  name,
}: {
  actions: DeckStackCardActions
  assignedTagIds: string[]
  deckTags: DeckCustomTag[]
  isActive: boolean
  name: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedTagId, setHighlightedTagId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ key: number; label: string; added: boolean } | null>(
    null,
  )
  const radialRef = useRef<DeckCardTagRadialHandle>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    isDrag: boolean
  } | null>(null)
  const pointerHandledRef = useRef(false)

  useEffect(() => {
    if (!isActive) {
      setIsOpen(false)
      setHighlightedTagId(null)
    }
  }, [isActive])

  function toggleTag(tagId: string) {
    const isAssigned = assignedTagIds.includes(tagId)
    const label = deckTags.find((tag) => tag.id === tagId)?.name ?? "Tag"
    if (isAssigned) actions.unassignTag(tagId)
    else actions.assignTag(tagId)
    setFeedback({ key: Date.now(), label, added: !isAssigned })
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false
      return
    }
    setIsOpen((open) => !open)
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation()
    pointerHandledRef.current = true
    setIsOpen(true)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      isDrag: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.isDrag) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < TAG_DRAG_THRESHOLD_PX)
        return
      drag.isDrag = true
    }
    setHighlightedTagId(radialRef.current?.hitTest(event.clientX, event.clientY) ?? null)
  }

  function finishPointer(event: PointerEvent<HTMLButtonElement>, cancelled: boolean) {
    const drag = dragRef.current
    if (drag?.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!cancelled && drag?.isDrag) {
      const tagId = radialRef.current?.hitTest(event.clientX, event.clientY) ?? null
      if (tagId) {
        toggleTag(tagId)
        setIsOpen(false)
      }
    }
    dragRef.current = null
    if (cancelled) pointerHandledRef.current = false
    setHighlightedTagId(null)
  }

  return (
    <>
      <button
        type="button"
        className="relative flex h-16 w-16 touch-none items-center justify-center rounded-full border-0 bg-neutral/60 text-sm font-black uppercase tracking-wide text-neutral-content shadow-lg backdrop-blur transition hover:bg-neutral/75"
        aria-label={`Tag ${name}`}
        tabIndex={isActive ? 0 : -1}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointer(event, false)}
        onPointerCancel={(event) => finishPointer(event, true)}
      >
        TAG
        {assignedTagIds.length > 0 ? (
          <span
            className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-base-100/80 bg-secondary px-1 text-[0.65rem] font-black text-secondary-content shadow"
            aria-hidden="true"
          >
            {assignedTagIds.length}
          </span>
        ) : null}
      </button>
      <DeckCardTagRadial
        ref={radialRef}
        open={isOpen}
        tags={deckTags}
        assignedTagIds={assignedTagIds}
        highlightedTagId={highlightedTagId}
        onToggleTag={toggleTag}
        onClose={() => setIsOpen(false)}
        anchorLabel={name}
      />
      {feedback ? (
        <span
          key={feedback.key}
          aria-hidden="true"
          className={cn(
            "deck-tag-feedback pointer-events-none absolute left-1/2 top-1/2 z-[150] -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-black tabular-nums shadow-lg backdrop-blur",
            feedback.added ? "bg-success/25 text-success" : "bg-error/25 text-error",
          )}
          onAnimationEnd={() => setFeedback(null)}
        >
          {feedback.added ? "+" : "−"} {feedback.label}
        </span>
      ) : null}
    </>
  )
}
