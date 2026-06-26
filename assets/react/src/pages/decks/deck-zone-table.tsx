import { Box, CheckSquare, ChevronDown, Edit3, MoveRight, Square, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import { DeckCardTagButton } from "./deck-card-allocation"
import { GameChangerBadge } from "./deck-card-display"
import type { DeckCardEntry, DeckCardTag } from "./deck-types"
import { CollectionStatusBadge } from "./edhrec-card-menu"

type PreviewPosition = {
  left: number
  top: number
}

function deckZoneCardImageUrl(deckCard: DeckCardEntry) {
  return deckCard.preferredPrinting?.imageUrl || deckCard.fallbackPrinting?.imageUrl || null
}

function DeckZoneCardName({
  deckCard,
  onPreview,
}: {
  deckCard: DeckCardEntry
  onPreview: (deckCard: DeckCardEntry) => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const hideTimeoutRef = useRef<number | null>(null)
  const [position, setPosition] = useState<PreviewPosition | null>(null)
  const cardName = deckCard.card?.name || "Unknown card"
  const imageUrl = deckZoneCardImageUrl(deckCard)

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current === null) return

      window.clearTimeout(hideTimeoutRef.current)
    }
  }, [])

  function clearHidePreview() {
    if (hideTimeoutRef.current === null) return

    window.clearTimeout(hideTimeoutRef.current)
    hideTimeoutRef.current = null
  }

  function hidePreviewSoon() {
    clearHidePreview()
    hideTimeoutRef.current = window.setTimeout(() => {
      setPosition(null)
      hideTimeoutRef.current = null
    }, 120)
  }

  function showPreview() {
    if (!imageUrl) return

    clearHidePreview()
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return

    const previewWidth = 176
    setPosition({
      left: Math.min(Math.max(rect.left, 12), window.innerWidth - previewWidth - 12),
      top: rect.top - 6,
    })
  }

  return (
    <span className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        className="cursor-pointer font-semibold text-accent underline decoration-accent/40 decoration-dotted underline-offset-4 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
        onBlur={hidePreviewSoon}
        onClick={() => onPreview(deckCard)}
        onFocus={showPreview}
        onPointerEnter={showPreview}
        onPointerLeave={hidePreviewSoon}
      >
        {cardName}
      </button>
      {position && imageUrl
        ? createPortal(
            <div
              aria-hidden="true"
              className="fixed z-[9999] block w-44 -translate-y-full rounded-xl border border-base-300 bg-base-100 p-2 shadow-2xl"
              style={{ left: position.left, top: position.top }}
              onPointerEnter={showPreview}
              onPointerLeave={hidePreviewSoon}
            >
              <img src={imageUrl} alt="" className="aspect-[5/7] w-full rounded-lg object-cover" />
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}

export function DeckZoneTable({
  cards,
  deckId,
  isSelecting,
  highlightedCardIds,
  isUpdating,
  onDelete,
  onEdit,
  onMove,
  onPreview,
  onTag,
  onToggleSelected,
  selectedCardIds,
  shareMode = false,
  title,
}: {
  cards: DeckCardEntry[]
  deckId: string
  highlightedCardIds: Set<string> | null
  isSelecting: boolean
  isUpdating: boolean
  onDelete: (deckCard: DeckCardEntry) => void
  onEdit: (deckCard: DeckCardEntry) => void
  onMove: (deckCard: DeckCardEntry) => void
  onPreview: (deckCard: DeckCardEntry) => void
  onTag: (deckCard: DeckCardEntry, tag: DeckCardTag | null) => void
  onToggleSelected: (deckCardId: string, selectRange?: boolean) => void
  selectedCardIds: Set<string>
  shareMode?: boolean
  title: string
}) {
  if (!cards.length) return null
  const sectionId = `${deckId}-${title.toLowerCase()}-zone`

  return (
    <details
      id={sectionId}
      className="group rounded-box border border-base-300 bg-base-100 shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-black tracking-normal marker:hidden">
        <span className="flex items-center gap-2">
          <Box className="h-4 w-4 text-warning" />
          {title}
          <span className="text-base-content/55">
            ({cards.reduce((total, deckCard) => total + deckCard.quantity, 0)})
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-base-content/50 transition group-open:rotate-180" />
      </summary>

      <div className="overflow-x-auto border-t border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              {isSelecting && !shareMode ? <th className="w-10">Select</th> : null}
              <th className="w-14">Qty</th>
              <th>Name</th>
              <th>Type</th>
              <th>Printing</th>
              {shareMode ? null : <th className="w-48">Collection</th>}
              {shareMode ? null : <th className="w-32">Tag</th>}
              {shareMode ? null : <th className="w-36 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {cards.map((deckCard) => {
              const printing = deckCard.preferredPrinting || deckCard.fallbackPrinting
              const selected = selectedCardIds.has(deckCard.id)
              const isGameChanger = deckCard.card?.gameChanger === true

              return (
                <tr
                  key={deckCard.id}
                  className={cn(
                    "transition-opacity duration-200",
                    highlightedCardIds !== null &&
                      !highlightedCardIds.has(deckCard.id) &&
                      "opacity-30",
                  )}
                >
                  {isSelecting && !shareMode ? (
                    <td>
                      <button
                        type="button"
                        className="btn btn-circle btn-xs"
                        aria-label={
                          selected
                            ? `Deselect ${deckCard.card?.name}`
                            : `Select ${deckCard.card?.name}`
                        }
                        onClick={(event) => onToggleSelected(deckCard.id, event.shiftKey)}
                      >
                        {selected ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  ) : null}
                  <td className="font-mono">{deckCard.quantity}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <DeckZoneCardName deckCard={deckCard} onPreview={onPreview} />
                      {isGameChanger ? <GameChangerBadge /> : null}
                    </div>
                  </td>
                  <td className="max-w-xs truncate text-base-content/65">
                    {deckCard.card?.typeLine}
                  </td>
                  <td className="text-base-content/65">
                    {printing?.setName || printing?.setCode?.toUpperCase() || "Unknown"} #
                    {printing?.collectorNumber || "?"}
                  </td>
                  {shareMode ? null : (
                    <td>
                      <CollectionStatusBadge status={deckCard.allocationStatus} />
                    </td>
                  )}
                  {shareMode ? null : (
                    <td>
                      <DeckCardTagButton
                        className="opacity-100"
                        disabled={isUpdating}
                        value={deckCard.tag}
                        onChange={(tag) => onTag(deckCard, tag)}
                      />
                    </td>
                  )}
                  {shareMode ? null : (
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isUpdating}
                          onClick={() => onEdit(deckCard)}
                          title="Edit"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isUpdating}
                          onClick={() => onMove(deckCard)}
                        >
                          <MoveRight className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-error hover:bg-error/10"
                          disabled={isUpdating}
                          onClick={() => onDelete(deckCard)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}
