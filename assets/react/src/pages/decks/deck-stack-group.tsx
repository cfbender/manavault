import { useEffect, useRef, useState, type PointerEvent } from "react"

import type { DeckGroup } from "../../lib/deck-grouping"
import { useIsMobile } from "../../lib/mobile-hover"
import { GroupIcon } from "./deck-card-display"
import { isLegendaryCreature } from "./deck-card-model"
import { DeckStackCard, DeckUnstackedSelectCard } from "./deck-stack-card"
import {
  isDeckStackPointerCaptured,
  shouldClearDeckStackTouchReveal,
  shouldUnstackDeckStackGroup,
  shouldUpdateDeckStackHoverFromPointer,
} from "./deck-stack-interactions"
import type { DeckCardEntry, DeckCardTag, DeckCustomTag } from "./deck-types"
import { DECK_CARD_HOVER_DELAY_MS } from "./deck-types"
import { useCardSize } from "../../lib/card-size"

export function deckStackIndexFromPointer(
  pointerY: number,
  activeIndex: number | null,
  cardCount: number,
  offsetPx: number,
  heightPx: number,
) {
  if (cardCount <= 0) return null

  const lastIndex = cardCount - 1
  const stackHeight = heightPx + lastIndex * offsetPx
  const y = Math.max(0, Math.min(pointerY, stackHeight - 1))

  if (activeIndex != null) {
    const activeTop = activeIndex * offsetPx
    const activeBottom = activeTop + heightPx

    if (y >= activeTop && y < activeBottom) return activeIndex
    if (y >= activeBottom) {
      return Math.min(lastIndex, activeIndex + 1 + Math.floor((y - activeBottom) / offsetPx))
    }
  }

  return Math.min(lastIndex, Math.floor(y / offsetPx))
}

export function DeckStackGroup({
  canSetCommander,
  deckId,
  deckTags,
  group,
  isSelecting,
  isUpdating,
  onAllocate,
  onAssignTag,
  onDelete,
  onDeallocate,
  onEdit,
  onMove,
  onPreview,
  onSetCommander,
  onTag,
  onToggleProxy,
  onToggleSelected,
  onUnassignTag,
  selectedCardIds,
  highlightedCardIds,
  shareMode = false,
}: {
  canSetCommander: boolean
  deckId: string
  deckTags: DeckCustomTag[]
  group: DeckGroup<DeckCardEntry>
  highlightedCardIds: Set<string> | null
  isSelecting: boolean
  isUpdating: boolean
  onAllocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onAssignTag: (deckCard: DeckCardEntry, tagId: string) => void
  onDelete: (deckCard: DeckCardEntry) => void
  onDeallocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onEdit: (deckCard: DeckCardEntry) => void
  onMove: (deckCard: DeckCardEntry) => void
  onPreview: (deckCard: DeckCardEntry) => void
  onSetCommander: (deckCard: DeckCardEntry) => void
  onTag: (deckCard: DeckCardEntry, tag: DeckCardTag | null) => void
  onToggleProxy: (deckCard: DeckCardEntry) => void
  onToggleSelected: (deckCardId: string, selectRange?: boolean) => void
  onUnassignTag: (deckCard: DeckCardEntry, tagId: string) => void
  selectedCardIds: Set<string>
  shareMode?: boolean
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<number | null>(null)
  const pendingHoverIndexRef = useRef<number | null>(null)
  const { isMobile } = useIsMobile()
  const size = useCardSize()
  const isUnstacked = shouldUnstackDeckStackGroup({ isMobile, isSelecting })
  const activeIndex = isSelecting ? null : (hoveredIndex ?? pinnedIndex)
  const revealOffset = group.cards.length > 1 ? size.revealOffsetPx : 0

  useEffect(
    () => () => {
      clearDeckCardHoverDelay()
    },
    [],
  )

  useEffect(() => {
    if (pinnedIndex == null) return

    function clearPinnedCard(event: globalThis.PointerEvent) {
      if (
        !shouldClearDeckStackTouchReveal({
          isInsideStack: stackRef.current?.contains(event.target as Node | null) === true,
          isPinned: pinnedIndex != null,
        })
      ) {
        return
      }

      setPinnedIndex(null)
    }

    document.addEventListener("pointerdown", clearPinnedCard, true)
    return () => document.removeEventListener("pointerdown", clearPinnedCard, true)
  }, [pinnedIndex])

  function clearDeckCardHoverDelay() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    pendingHoverIndexRef.current = null
  }

  function scheduleHoveredIndex(nextIndex: number | null) {
    if (nextIndex === activeIndex) {
      clearDeckCardHoverDelay()
      return
    }
    if (pendingHoverIndexRef.current === nextIndex) return

    clearDeckCardHoverDelay()
    pendingHoverIndexRef.current = nextIndex
    hoverTimerRef.current = window.setTimeout(() => {
      setPinnedIndex(null)
      setHoveredIndex(nextIndex)
      pendingHoverIndexRef.current = null
      hoverTimerRef.current = null
    }, DECK_CARD_HOVER_DELAY_MS)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (
      !shouldUpdateDeckStackHoverFromPointer({
        isPointerCaptured: isDeckStackPointerCaptured(event.target),
        pointerType: event.pointerType,
      })
    ) {
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const nextIndex = deckStackIndexFromPointer(
      event.clientY - bounds.top,
      activeIndex,
      group.cards.length,
      size.offsetPx,
      size.heightPx,
    )
    scheduleHoveredIndex(nextIndex)
  }

  return (
    <section className="mb-5 inline-flex w-full break-inside-avoid flex-col items-center gap-3">
      <div
        className="flex items-center gap-2 text-sm font-black tracking-normal"
        style={{ width: `min(${size.widthPx}px, 100%)` }}
      >
        <GroupIcon icon={group.icon} />
        <h3 className="truncate">{group.label}</h3>
        <span className="text-base-content/55">({group.quantity})</span>
      </div>

      {isUnstacked ? (
        <div className="grid grid-cols-2 gap-2" style={{ width: `min(${size.widthPx}px, 100%)` }}>
          {group.cards.map((deckCard) => (
            <DeckUnstackedSelectCard
              key={deckCard.id}
              deckCard={deckCard}
              isDimmed={highlightedCardIds !== null && !highlightedCardIds.has(deckCard.id)}
              isSelected={selectedCardIds.has(deckCard.id)}
              onToggleSelected={(selectRange) => onToggleSelected(deckCard.id, selectRange)}
            />
          ))}
        </div>
      ) : (
        <div
          ref={stackRef}
          className="relative overflow-hidden rounded-xl"
          style={{
            width: `min(${size.widthPx}px, 100%)`,
            minHeight: `${size.heightPx + Math.max(group.cards.length - 1, 0) * size.offsetPx}px`,
          }}
          onPointerLeave={(event) => {
            clearDeckCardHoverDelay()
            if (event.pointerType === "touch") return

            setHoveredIndex(null)
          }}
          onPointerMove={handlePointerMove}
        >
          {group.cards.map((deckCard, index) => (
            <DeckStackCard
              key={deckCard.id}
              assignedTagIds={deckCard.tagIds ?? []}
              canSetCommander={
                canSetCommander && deckCard.zone !== "commander" && isLegendaryCreature(deckCard)
              }
              deckCard={deckCard}
              deckId={deckId}
              deckTags={deckTags}
              index={index}
              isLast={index === group.cards.length - 1}
              isActive={activeIndex === index}
              isSelecting={isSelecting}
              isSelected={selectedCardIds.has(deckCard.id)}
              isUpdating={isUpdating}
              isDimmed={highlightedCardIds !== null && !highlightedCardIds.has(deckCard.id)}
              onAllocate={(collectionItemId) => onAllocate(deckCard, collectionItemId)}
              onAssignTag={(_, id) => onAssignTag(deckCard, id)}
              onDelete={() => onDelete(deckCard)}
              onDeallocate={(collectionItemId) => onDeallocate(deckCard, collectionItemId)}
              onEdit={() => onEdit(deckCard)}
              onMove={() => onMove(deckCard)}
              onPreview={() => onPreview(deckCard)}
              onSetCommander={() => onSetCommander(deckCard)}
              onTouchReveal={() => {
                clearDeckCardHoverDelay()
                setHoveredIndex(null)
                setPinnedIndex(index)
              }}
              onTag={(tag) => onTag(deckCard, tag)}
              onToggleProxy={() => onToggleProxy(deckCard)}
              onToggleSelected={(selectRange) => onToggleSelected(deckCard.id, selectRange)}
              onUnassignTag={(_, id) => onUnassignTag(deckCard, id)}
              shareMode={shareMode}
              size={size}
              slideOffset={activeIndex != null && index > activeIndex ? revealOffset : 0}
              top={index * size.offsetPx}
            />
          ))}
        </div>
      )}
    </section>
  )
}
