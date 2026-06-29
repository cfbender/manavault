import {
  CheckSquare,
  Crown,
  Edit3,
  Eye,
  MoreVertical,
  MoveRight,
  Square,
  Tag,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react"

import { cn, titleize } from "../../lib/utils"
import { useMobileHoverReveal } from "../../lib/mobile-hover"
import { ShareModeHidden, blurFocusedMenuItem } from "./deck-actions"
import { DeckCardAllocationMenu, DeckCardTagButton } from "./deck-card-allocation"
import { cardImageUrl } from "./deck-card-model"
import { GameChangerBadge } from "./deck-card-display"
import { deckCardTag } from "./deck-card-tags"
import {
  DECK_STACK_ACTION_MENU_CLASS_NAME,
  deckStackActionMenuDirection,
  deckStackActionMenuStyle,
  shouldCloseDeckStackActionMenu,
  shouldRaiseDeckStackCardForActionMenu,
} from "./deck-stack-interactions"
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
  const actionMenuRef = useRef<HTMLDivElement>(null)
  const mobileHover = useMobileHoverReveal<HTMLButtonElement>({
    clearOnOutsidePointerDown: false,
    isRevealed: isActive,
    onRevealChange: (isRevealed) => {
      if (isRevealed) onTouchReveal()
    },
  })
  const imageUrl = cardImageUrl(deckCard, "imageUrl")
  const name = deckCard.card?.name || "Unknown card"
  const printing = deckCard.preferredPrinting || deckCard.fallbackPrinting
  const tag = deckCardTag(deckCard.tag)
  const hasClearTag = Boolean(tag)
  const hasFoilFinish = deckCard.finish === "foil" || deckCard.finish === "etched"
  const isGameChanger = deckCard.card?.gameChanger === true
  const isInteractive = isActive || isAllocationMenuOpen || (!isSelecting && hasFocusWithin)
  const actionMenuDirection = deckStackActionMenuDirection({ isLast })
  const actionMenuStyle = deckStackActionMenuStyle({ canSetCommander, hasClearTag })

  useEffect(() => {
    closeFocusedActionMenu(isActive)
  }, [isActive])

  function closeFocusedActionMenu(isCardRaised: boolean) {
    const activeElement = actionMenuRef.current?.ownerDocument.activeElement
    if (!(activeElement instanceof HTMLElement)) return

    const actionMenuHasFocus = actionMenuRef.current?.contains(activeElement) === true
    if (
      !shouldCloseDeckStackActionMenu({
        actionMenuHasFocus,
        isActive: isCardRaised,
      })
    ) {
      return
    }

    activeElement.blur()
    setHasFocusWithin(false)
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setHasFocusWithin(false)
    }
  }

  function handlePointerLeave(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return
    closeFocusedActionMenu(false)
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    mobileHover.onPointerDown(event)
  }

  function handleActionMenuPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation()

    if (shouldRaiseDeckStackCardForActionMenu({ isActive })) {
      onTouchReveal()
    }
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
      onPointerLeave={handlePointerLeave}
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
          <div className="absolute left-2 top-2 z-[130] flex items-start gap-1.5">
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
              "deck-card-touch-control btn btn-circle btn-sm absolute right-2 top-12 z-[125] border-2 shadow transition",
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

          <div
            ref={actionMenuRef}
            className={cn(
              "dropdown dropdown-end absolute right-2 top-2 z-[120] transition-opacity group-focus-within/deck-card:opacity-100",
              actionMenuDirection === "up" && "dropdown-top",
              isInteractive ? "opacity-100" : "opacity-0",
            )}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            data-deck-stack-pointer-capture=""
            onPointerDown={handleActionMenuPointerDown}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="deck-card-touch-control btn btn-circle btn-sm border-0 bg-neutral/85 text-neutral-content shadow transition hover:bg-neutral"
              tabIndex={isInteractive ? 0 : -1}
              aria-label={`${name} actions`}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {isInteractive ? (
              <ul
                tabIndex={0}
                className={DECK_STACK_ACTION_MENU_CLASS_NAME}
                onClick={blurFocusedMenuItem}
                style={actionMenuStyle}
              >
                <li>
                  <button type="button" onClick={onPreview}>
                    <Eye className="h-4 w-4" />
                    View card details
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
                {hasClearTag ? (
                  <li>
                    <button type="button" onClick={() => onTag(null)}>
                      <Tag className="h-4 w-4" />
                      Clear tag
                    </button>
                  </li>
                ) : null}
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
            if (mobileHover.suppressClickIfRevealed(event)) {
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
