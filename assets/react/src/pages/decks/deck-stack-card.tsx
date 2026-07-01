import {
  CheckCircle2,
  CheckSquare,
  Crown,
  Edit3,
  Eye,
  MoreVertical,
  MoveRight,
  Square,
  Tag,
  Trash2,
  XCircle,
} from "lucide-react"
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react"

import { CardTileOverlayButton } from "../../components/card-tile"
import { useMobileHoverReveal } from "../../lib/mobile-hover"
import { cn, titleize } from "../../lib/utils"
import { ShareModeHidden, blurFocusedMenuItem } from "./deck-actions"
import {
  AllocationStatusIcon,
  allocationStatusButtonClass,
  allocationStatusLabel,
  allocationStatusSummary,
  collectionItemLabel,
} from "./deck-card-allocation"
import { cardImageUrl } from "./deck-card-model"
import { GameChangerBadge } from "./deck-card-display"
import { deckCardTag, nextDeckCardTag } from "./deck-card-tags"
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
  onDelete,
  onAllocate,
  onDeallocate,
  onEdit,
  onMove,
  onPreview,
  onSetCommander,
  onTag,
  onToggleProxy,
  onTouchReveal,
  onToggleSelected,
  shareMode = false,
  slideOffset,
  top,
}: {
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
  onDelete: () => void
  onDeallocate: (collectionItemId: string) => void
  onEdit: () => void
  onMove: () => void
  onPreview: () => void
  onSetCommander: () => void
  onTouchReveal: () => void
  onTag: (tag: DeckCardTag | null) => void
  onToggleProxy: () => void
  onToggleSelected: (selectRange?: boolean) => void
  shareMode?: boolean
  slideOffset: number
  top: number
}) {
  const [hasFocusWithin, setHasFocusWithin] = useState(false)
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
  const isInteractive = !isSelecting && (isActive || hasFocusWithin)
  const actionMenuDirection = deckStackActionMenuDirection({ isLast })
  const actionMenuStyle = deckStackActionMenuStyle({ canSetCommander, hasClearTag })
  const allocatedCandidate = deckCard.allocationStatus.candidates.find(
    (candidate) => candidate.allocated > 0,
  )
  const hasProxyAllocation = deckCard.allocationStatus.proxyAllocated > 0

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
        "group group/deck-card absolute left-0 w-56 origin-top rounded-xl transition-transform duration-200 ease-out",
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
        className="pointer-events-none absolute left-0 top-0 aspect-[5/7] w-56 rounded-xl bg-black"
      />
      <div
        className={cn(
          "relative transition-[filter,opacity] duration-200 ease-out",
          isDimmed && "opacity-30 saturate-50",
        )}
      >
        <ShareModeHidden shareMode={shareMode}>
          {isSelecting ? (
            <button
              type="button"
              className={cn(
                "btn btn-circle btn-sm deck-card-touch-control absolute right-2 top-2 z-[125] border-2 shadow transition",
                isSelected
                  ? "border-secondary bg-secondary text-secondary-content"
                  : "border-base-100/80 bg-base-100/95 text-base-content",
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
          ) : null}
          <div
            ref={actionMenuRef}
            className={cn(
              "dropdown dropdown-start absolute left-2 top-2 z-[120] transition-opacity group-focus-within:opacity-100",
              actionMenuDirection === "up" && "dropdown-top",
              isInteractive
                ? "visible opacity-100"
                : "invisible opacity-0 group-hover:visible group-hover:opacity-100",
            )}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            data-deck-stack-pointer-capture=""
            onPointerDown={handleActionMenuPointerDown}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <CardTileOverlayButton tabIndex={isInteractive ? 0 : -1} aria-label={`${name} actions`}>
              <MoreVertical className="h-4 w-4" />
            </CardTileOverlayButton>
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
                {allocatedCandidate ? (
                  <li>
                    <button
                      type="button"
                      disabled={isUpdating}
                      title={collectionItemLabel(allocatedCandidate)}
                      onClick={() => onDeallocate(allocatedCandidate.item.id)}
                    >
                      <XCircle className="h-4 w-4" />
                      Deallocate
                    </button>
                  </li>
                ) : null}
                {hasProxyAllocation ? (
                  <li>
                    <button type="button" disabled={isUpdating} onClick={onToggleProxy}>
                      <XCircle className="h-4 w-4" />
                      Remove proxy
                    </button>
                  </li>
                ) : null}
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

        {!isSelecting ? (
          <ShareModeHidden shareMode={shareMode}>
            <div
              className="absolute right-2 top-2 z-[115] flex items-center gap-1"
              data-deck-stack-pointer-capture=""
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            >
              <DeckCardAllocationQuickMenu
                deckCard={deckCard}
                isVisible={isInteractive}
                isUpdating={isUpdating}
                onAllocate={onAllocate}
                onDeallocate={onDeallocate}
                onReveal={onTouchReveal}
                onToggleProxy={onToggleProxy}
              />
              <DeckCardTagQuickButton
                disabled={isUpdating}
                isVisible={isInteractive}
                tag={tag}
                value={deckCard.tag}
                onChange={onTag}
              />
            </div>
          </ShareModeHidden>
        ) : null}

        {!isSelecting && tag ? (
          <ShareModeHidden shareMode={shareMode}>
            <span
              className={cn(
                "pointer-events-none absolute right-2 top-2 z-[110] inline-flex h-6 w-6 items-center justify-center rounded-full border border-base-100/70 shadow backdrop-blur transition-opacity group-hover:opacity-0 group-focus-within:opacity-0",
                tag.className,
                isInteractive && "opacity-0",
              )}
              aria-hidden="true"
            >
              <tag.icon className="h-3.5 w-3.5" />
            </span>
          </ShareModeHidden>
        ) : null}

        <button
          type="button"
          className="block w-56 cursor-pointer text-left"
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
              <span className="absolute right-2 top-14 z-20 rounded-md bg-primary px-2.5 py-1.5 text-sm font-black leading-none text-primary-content shadow-lg">
                {deckCard.quantity}
              </span>
            ) : null}

            <figcaption
              className={cn(
                "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 pb-3 pt-12 text-white transition duration-200 group-focus-within:opacity-100",
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

function DeckCardAllocationQuickMenu({
  deckCard,
  isVisible,
  isUpdating,
  onAllocate,
  onDeallocate,
  onReveal,
  onToggleProxy,
}: {
  deckCard: DeckCardEntry
  isVisible: boolean
  isUpdating: boolean
  onAllocate: (collectionItemId: string) => void
  onDeallocate: (collectionItemId: string) => void
  onReveal: () => void
  onToggleProxy: () => void
}) {
  const status = deckCard.allocationStatus
  const label = allocationStatusLabel(status)
  const summary = allocationStatusSummary(status)
  const allocatedCandidate = status.candidates.find((candidate) => candidate.allocated > 0)
  const availableCandidate = status.candidates.find(
    (candidate) => candidate.available > 0 && status.allocated < status.required,
  )
  const hasProxyAllocation = status.proxyAllocated > 0
  const canMarkProxy =
    status.state !== "basic_land" &&
    status.proxyAllocated <= 0 &&
    status.required > status.allocated

  return (
    <div className="dropdown dropdown-end" onClick={(event) => event.stopPropagation()}>
      <CardTileOverlayButton
        className={cn(
          "relative transition-opacity",
          allocationStatusButtonClass(status.state),
          isVisible
            ? "visible opacity-100"
            : "invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
        )}
        tabIndex={isVisible ? 0 : -1}
        aria-label={`${label}: ${summary}`}
        title={`${label}: ${summary}`}
        onClick={() => {
          if (!isVisible) onReveal()
        }}
      >
        <AllocationStatusIcon state={status.state} className="h-4 w-4" />
      </CardTileOverlayButton>
      <ul
        tabIndex={0}
        className="menu dropdown-content z-[140] mt-1 w-40 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl"
        onClick={blurFocusedMenuItem}
      >
        <li className="menu-title whitespace-normal">
          <span>
            {label}
            <br />
            <span className="font-normal text-base-content/65">{summary}</span>
          </span>
        </li>
        {availableCandidate ? (
          <li>
            <button
              type="button"
              disabled={isUpdating}
              title={collectionItemLabel(availableCandidate)}
              onClick={() => onAllocate(availableCandidate.item.id)}
            >
              <CheckCircle2 className="h-4 w-4" />
              Allocate copy
            </button>
          </li>
        ) : null}
        {allocatedCandidate ? (
          <li>
            <button
              type="button"
              disabled={isUpdating}
              title={collectionItemLabel(allocatedCandidate)}
              onClick={() => onDeallocate(allocatedCandidate.item.id)}
            >
              <XCircle className="h-4 w-4" />
              Deallocate
            </button>
          </li>
        ) : null}
        {hasProxyAllocation || canMarkProxy ? (
          <li>
            <button type="button" disabled={isUpdating} onClick={onToggleProxy}>
              <XCircle className="h-4 w-4" />
              {hasProxyAllocation ? "Remove proxy" : "Mark proxy"}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

type DeckCardTagDescriptor = NonNullable<ReturnType<typeof deckCardTag>>

function DeckCardTagQuickButton({
  disabled,
  isVisible,
  onChange,
  tag,
  value,
}: {
  disabled: boolean
  isVisible: boolean
  onChange: (tag: DeckCardTag | null) => void
  tag: DeckCardTagDescriptor | null
  value?: string | null
}) {
  const Icon = tag?.icon || Tag
  const label = tag?.label || "Add tag"

  return (
    <CardTileOverlayButton
      tone={tag ? "custom" : "neutral"}
      className={cn(
        "transition-opacity",
        tag?.className,
        isVisible
          ? "visible opacity-100"
          : "invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
      )}
      disabled={disabled}
      tabIndex={isVisible ? 0 : -1}
      aria-label={`${label}; click to change tag`}
      title={label}
      onClick={() => onChange(nextDeckCardTag(value))}
    >
      <Icon className="h-4 w-4 shrink-0" />
    </CardTileOverlayButton>
  )
}
