import {
  CheckSquare,
  Crown,
  Edit3,
  Eye,
  Maximize2,
  MoreVertical,
  MoveRight,
  Square,
  Tag,
  Trash2,
} from "lucide-react"
import { useRef, useState, type FocusEvent, type PointerEvent } from "react"

import { cn, titleize } from "../../lib/utils"
import { ShareModeHidden, blurFocusedMenuItem } from "./deck-actions"
import { DeckCardAllocationMenu, DeckCardTagButton } from "./deck-card-allocation"
import { cardImageUrl } from "./deck-card-model"
import { GameChangerBadge } from "./deck-card-display"
import { deckCardTag } from "./deck-card-tags"
import { shouldRevealDeckStackCardOnPointerDown } from "./deck-stack-interactions"
import type { DeckCardEntry, DeckCardTag } from "./deck-types"
import { DECK_CARD_TAGS } from "./deck-types"

export function DeckStackCard({
  allocationError,
  canSetCommander,
  deckId,
  deckCard,
  index,
  isLast,
  isActive,
  isDimmed,
  isSelecting,
  isSelected,
  isUpdating,
  onAllocate,
  onDeallocate,
  onDelete,
  onEdit,
  onExpand,
  onMove,
  onPreview,
  onSetCommander,
  onTag,
  onTouchReveal,
  onToggleProxy,
  onToggleSelected,
  shareMode = false,
  slideOffset,
  top,
}: {
  allocationError: string | null
  canSetCommander: boolean
  deckId: string
  deckCard: DeckCardEntry
  index: number
  isLast: boolean
  isActive: boolean
  isDimmed: boolean
  isUpdating: boolean
  isSelecting: boolean
  isSelected: boolean
  onAllocate: (collectionItemId: string) => void
  onDeallocate: (collectionItemId: string) => void
  onDelete: () => void
  onEdit: () => void
  onExpand: () => void
  onMove: () => void
  onPreview: () => void
  onSetCommander: () => void
  onToggleProxy: () => void
  onTouchReveal: () => void
  onTag: (tag: DeckCardTag | null) => void
  onToggleSelected: (selectRange?: boolean) => void
  shareMode?: boolean
  slideOffset: number
  top: number
}) {
  const [hasFocusWithin, setHasFocusWithin] = useState(false)
  const [isAllocationMenuOpen, setIsAllocationMenuOpen] = useState(false)
  const touchRevealWasActivatedRef = useRef(false)
  const imageUrl = cardImageUrl(deckCard, "imageUrl")
  const name = deckCard.card?.name || "Unknown card"
  const printing = deckCard.preferredPrinting || deckCard.fallbackPrinting
  const tag = deckCardTag(deckCard.tag)
  const hasFoilFinish = deckCard.finish === "foil" || deckCard.finish === "etched"
  const isGameChanger = deckCard.card?.gameChanger === true
  const isInteractive = isActive || isAllocationMenuOpen || (!isSelecting && hasFocusWithin)

  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setHasFocusWithin(false)
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    touchRevealWasActivatedRef.current = false

    if (
      !shouldRevealDeckStackCardOnPointerDown({
        isActive,
        pointerType: event.pointerType,
      })
    ) {
      return
    }

    touchRevealWasActivatedRef.current = true
    onTouchReveal()
  }

  return (
    <article
      className={cn(
        "group/deck-card absolute left-0 w-56 origin-top rounded-xl transition-transform duration-200 ease-out",
        isInteractive && "z-[90]",
      )}
      onBlur={handleBlur}
      data-deck-id={deckId}
      onFocus={() => setHasFocusWithin(true)}
      style={{
        top,
        transform: slideOffset ? `translateY(${slideOffset}px)` : undefined,
        zIndex: isInteractive ? 90 : index + 1,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl bg-black"
      />
      <div
        className={cn(
          "relative transition-[filter,opacity] duration-200 ease-out",
          isDimmed && "opacity-30 saturate-50",
        )}
      >
        <ShareModeHidden shareMode={shareMode}>
          <div className="absolute left-1 top-1 z-[130] flex h-5 items-start gap-1">
            <DeckCardAllocationMenu
              deckCard={deckCard}
              error={allocationError}
              isInteractive={isInteractive}
              isUpdating={isUpdating}
              open={isAllocationMenuOpen}
              onOpenChange={setIsAllocationMenuOpen}
              onAllocate={onAllocate}
              onDeallocate={onDeallocate}
              onToggleProxy={onToggleProxy}
            />
            <DeckCardTagButton
              className="relative"
              disabled={isUpdating}
              shareMode={shareMode}
              value={deckCard.tag}
              onChange={onTag}
            />
          </div>

          <button
            type="button"
            className={cn(
              "btn btn-circle btn-xs absolute right-2 top-10 z-[125] border-2 shadow transition",
              isSelected
                ? "border-secondary bg-secondary text-secondary-content opacity-100"
                : "border-base-100/80 bg-base-100/90 text-base-content opacity-80 hover:opacity-100",
            )}
            aria-label={isSelected ? `Deselect ${name}` : `Select ${name}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggleSelected(event.shiftKey)
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>

          <button
            type="button"
            className={cn(
              "btn btn-circle btn-xs absolute bottom-2 right-2 z-[125] border-0 bg-neutral/85 text-neutral-content shadow transition hover:bg-neutral group-hover/deck-card:opacity-100 group-focus-within/deck-card:opacity-100",
              isActive ? "opacity-100" : "opacity-0",
            )}
            aria-label={`Reveal ${name} in stack`}
            onClick={(event) => {
              event.stopPropagation()
              onExpand()
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Maximize2 className="h-4 w-4" />
          </button>

          <div
            className={cn(
              "dropdown dropdown-end absolute right-2 top-2 z-[120] transition-opacity group-focus-within/deck-card:opacity-100",
              isLast && "dropdown-top",
              isInteractive ? "opacity-100" : "opacity-0",
            )}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            data-deck-stack-pointer-capture=""
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="btn btn-circle btn-xs border-0 bg-neutral/85 text-neutral-content shadow transition hover:bg-neutral"
              tabIndex={isInteractive ? 0 : -1}
              aria-label={`${name} actions`}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {isInteractive ? (
              <ul
                tabIndex={0}
                className="menu dropdown-content z-[120] mt-1 w-52 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl"
                onClick={blurFocusedMenuItem}
              >
                <li>
                  <button type="button" onClick={onPreview}>
                    <Eye className="h-4 w-4" />
                    View card details
                  </button>
                </li>
                <li>
                  <button type="button" onClick={onExpand}>
                    <Maximize2 className="h-4 w-4" />
                    Reveal in stack
                  </button>
                </li>
                <li>
                  <button type="button" disabled={isUpdating} onClick={onEdit}>
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </button>
                </li>
                <li>
                  <button type="button" disabled={isUpdating} onClick={onMove}>
                    <MoveRight className="h-4 w-4" />
                    Move
                  </button>
                </li>
                <li className="menu-title">
                  <span>Tag</span>
                </li>
                {DECK_CARD_TAGS.map((tagOption) => (
                  <li key={tagOption.value}>
                    <button
                      type="button"
                      disabled={isUpdating || deckCard.tag === tagOption.value}
                      onClick={() => onTag(tagOption.value)}
                    >
                      <tagOption.icon className="h-4 w-4" />
                      {tagOption.label}
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" disabled={isUpdating || !tag} onClick={() => onTag(null)}>
                    <Tag className="h-4 w-4" />
                    Clear tag
                  </button>
                </li>
                {canSetCommander ? (
                  <li>
                    <button type="button" disabled={isUpdating} onClick={onSetCommander}>
                      <Crown className="h-4 w-4" />
                      Set as commander
                    </button>
                  </li>
                ) : null}
                <li>
                  <button
                    type="button"
                    className="text-error"
                    disabled={isUpdating}
                    onClick={onDelete}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </li>
              </ul>
            ) : null}
          </div>
        </ShareModeHidden>

        <button
          type="button"
          className="block w-full cursor-pointer text-left"
          aria-label={`View ${name} details`}
          onPointerDown={handlePointerDown}
          onClick={(event) => {
            if (touchRevealWasActivatedRef.current) {
              touchRevealWasActivatedRef.current = false
              event.preventDefault()
              return
            }
            if (isSelecting) onToggleSelected(event.shiftKey)
            else onPreview()
          }}
        >
          <figure
            className={cn(
              "relative aspect-[5/7] overflow-hidden rounded-xl bg-base-300 shadow-xl ring-1 ring-white/10 transition duration-200",
              hasFoilFinish && "card-tile-foil",
              deckCard.finish === "etched" && "card-tile-foil--etched",
              isActive && "shadow-2xl ring-primary/45",
              isSelected && "ring-4 ring-secondary shadow-2xl",
            )}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-5 text-center text-sm text-base-content/50">
                No image
              </div>
            )}
            {hasFoilFinish ? (
              <div
                className={cn(
                  "card-tile-foil-overlay",
                  deckCard.finish === "etched" && "card-tile-foil-overlay--etched",
                )}
              />
            ) : null}

            {isGameChanger ? (
              <GameChangerBadge className="absolute left-1/2 top-1 z-20 -translate-x-1/2 shadow-lg" />
            ) : null}

            {deckCard.quantity > 1 ? (
              <span className="absolute right-0 top-0 z-20 rounded-bl-xl bg-primary px-2.5 py-1.5 text-sm font-black leading-none text-primary-content shadow-lg">
                {deckCard.quantity}
              </span>
            ) : null}

            <figcaption
              className={cn(
                "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 pb-3 pt-12 text-white transition duration-200 group-focus-within/deck-card:opacity-100",
                isInteractive ? "opacity-100" : "opacity-0",
              )}
            >
              <div className="line-clamp-2 text-sm font-black leading-tight">{name}</div>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-white/75">
                <span className="truncate">
                  {printing?.setName || printing?.setCode?.toUpperCase() || titleize(deckCard.zone)}
                </span>
                <span>#{printing?.collectorNumber || "?"}</span>
              </div>
            </figcaption>
          </figure>
        </button>
      </div>
    </article>
  )
}
