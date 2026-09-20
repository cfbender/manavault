import { CheckSquare, Square } from "lucide-react"

import { cn } from "../../lib/utils"
import { ShareModeHidden } from "./deck-actions"
import { deckCardTag } from "./deck-card-tags"
import { DeckStackCardImage } from "./deck-stack-card-image"
import {
  DeckCardAllocationQuickMenu,
  DeckCardTagQuickButton,
  DeckStackActionMenu,
} from "./deck-stack-card-menus"
import type { DeckStackCardProps } from "./deck-stack-card-types"
import { shouldRaiseDeckStackCardForActionMenu } from "./deck-stack-interactions"
import { DeckStackTagControl } from "./deck-stack-tag-control"
import { useDeckStackCard } from "./use-deck-stack-card"

export { DeckUnstackedSelectCard } from "./deck-stack-card-image"

export function DeckStackCard({
  actions,
  capabilities,
  card: deckCard,
  context,
  position,
  state,
}: DeckStackCardProps) {
  const { deckId, deckTags, shareMode } = context
  const { index, size, slideOffset, top } = position
  const { isActive, isDimmed, isSelecting, isSelected, isUpdating } = state
  const interaction = useDeckStackCard({
    isActive,
    isSelecting,
    onReveal: actions.reveal,
  })
  const name = deckCard.card?.name || "Unknown card"
  const assignedTagIds = deckCard.tagIds ?? []
  const tag = deckCardTag(deckCard.tag)

  return (
    <article
      className={cn(
        "group group/deck-card absolute left-0 origin-top rounded-xl transition-transform duration-200 ease-out",
        interaction.isInteractive && "z-[90]",
      )}
      onBlur={interaction.handleBlur}
      onClickCapture={(event) => interaction.mobileHover.suppressClickIfRevealed(event)}
      data-deck-id={deckId}
      onFocus={() => interaction.setHasFocusWithin(true)}
      onPointerLeave={interaction.handlePointerLeave}
      style={{
        top,
        width: `min(${size.widthPx}px, 100%)`,
        transform: slideOffset ? `translateY(${slideOffset}px)` : undefined,
        zIndex: interaction.isInteractive ? 90 : index + 1,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 aspect-[5/7] w-full rounded-xl bg-black"
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
                actions.toggleSelected(event.shiftKey)
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            </button>
          ) : null}
          <div
            ref={interaction.actionMenuRef}
            className={cn(
              "absolute left-2 top-2 z-[120] transition-opacity group-focus-within:opacity-100",
              interaction.isInteractive
                ? "visible opacity-100"
                : interaction.hasMobileHover
                  ? "invisible opacity-0"
                  : "invisible opacity-0 group-hover:visible group-hover:opacity-100",
            )}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            data-deck-stack-pointer-capture=""
            onPointerDown={(event) => {
              event.stopPropagation()
              if (shouldRaiseDeckStackCardForActionMenu({ isActive })) actions.reveal()
            }}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <DeckStackActionMenu
              actions={actions}
              canAddPartner={capabilities.canAddPartner}
              canSetCommander={capabilities.canSetCommander}
              deckCard={deckCard}
              isInteractive={interaction.isInteractive}
              isUpdating={isUpdating}
              name={name}
              onOpenChange={interaction.setIsActionMenuOpen}
            />
          </div>
        </ShareModeHidden>

        {!isSelecting ? (
          <ShareModeHidden shareMode={shareMode}>
            <div
              className={cn(
                "absolute right-2 top-2 z-[115] flex items-center gap-1",
                interaction.isInteractive
                  ? "pointer-events-auto"
                  : interaction.hasMobileHover
                    ? "pointer-events-none"
                    : "pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto",
              )}
              data-deck-stack-pointer-capture=""
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            >
              <DeckCardAllocationQuickMenu
                deckCard={deckCard}
                isVisible={interaction.isInteractive}
                isUpdating={isUpdating}
                onAllocate={actions.allocate}
                onDeallocate={actions.deallocate}
                onOpenChange={interaction.setIsQuickMenuOpen}
                onReveal={actions.reveal}
                onToggleProxy={actions.toggleProxy}
              />
              <DeckCardTagQuickButton
                disabled={isUpdating}
                isVisible={interaction.isInteractive}
                tag={tag?.value ?? null}
                onChange={actions.tag}
              />
            </div>
          </ShareModeHidden>
        ) : null}

        {!isSelecting ? (
          <ShareModeHidden shareMode={shareMode}>
            <div
              className={cn(
                "absolute left-1/2 top-1/2 z-[118] -translate-x-1/2 -translate-y-1/2 transition-opacity",
                interaction.isInteractive
                  ? "visible opacity-100"
                  : interaction.hasMobileHover
                    ? "invisible opacity-0"
                    : "invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
              )}
              data-deck-stack-pointer-capture=""
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            >
              <DeckStackTagControl
                actions={actions}
                assignedTagIds={assignedTagIds}
                deckTags={deckTags}
                isActive={interaction.isInteractive}
                name={name}
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
                interaction.isInteractive && "opacity-0",
              )}
              aria-hidden="true"
            >
              <tag.icon className="h-3.5 w-3.5" />
            </span>
          </ShareModeHidden>
        ) : null}

        <button
          type="button"
          className="block w-full cursor-pointer text-left"
          aria-label={`View ${name} details`}
          onPointerDown={interaction.mobileHover.onPointerDown}
          onClick={(event) => {
            if (interaction.mobileHover.suppressClickIfRevealed(event)) return
            if (isSelecting) actions.toggleSelected(event.shiftKey)
            else actions.preview()
          }}
        >
          <DeckStackCardImage
            deckCard={deckCard}
            isActive={isActive}
            isInteractive={interaction.isInteractive}
            isSelected={isSelected}
            name={name}
          />
        </button>
      </div>
    </article>
  )
}
