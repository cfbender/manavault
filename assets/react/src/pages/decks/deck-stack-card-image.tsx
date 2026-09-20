import { CheckSquare, Square } from "lucide-react"

import { cn } from "../../lib/utils"
import { cardImageUrl } from "./deck-card-model"
import { GameChangerBadge } from "./deck-card-display"
import type { DeckCardEntry } from "./deck-types"
import { deckZoneDisplayLabel } from "./deck-types"

export function DeckStackCardImage({
  deckCard,
  isActive,
  isInteractive,
  isSelected,
  name,
}: {
  deckCard: DeckCardEntry
  isActive: boolean
  isInteractive: boolean
  isSelected: boolean
  name: string
}) {
  const imageUrl = cardImageUrl(deckCard, "imageUrl")
  const printing = deckCard.preferredPrinting || deckCard.fallbackPrinting
  const hasFoilFinish = deckCard.finish === "foil" || deckCard.finish === "etched"

  return (
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
        <img src={imageUrl} alt={name} loading="lazy" className="h-full w-full object-cover" />
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
      {deckCard.card?.gameChanger === true ? (
        <GameChangerBadge
          className="absolute left-1/2 top-1 z-20 -translate-x-1/2 shadow-lg"
          count={deckCard.quantity}
        />
      ) : deckCard.quantity > 1 ? (
        <span className="absolute left-1/2 top-1 z-20 -translate-x-1/2 rounded-md bg-primary px-2.5 py-1.5 text-sm font-black leading-none text-primary-content shadow-lg">
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
            {printing?.setName ||
              printing?.setCode?.toUpperCase() ||
              deckZoneDisplayLabel(deckCard.zone)}
          </span>
          <span>#{printing?.collectorNumber || "?"}</span>
        </div>
      </figcaption>
    </figure>
  )
}

export function DeckUnstackedSelectCard({
  deckCard,
  isDimmed,
  isSelected,
  onToggleSelected,
}: {
  deckCard: DeckCardEntry
  isDimmed: boolean
  isSelected: boolean
  onToggleSelected: (selectRange?: boolean) => void
}) {
  const imageUrl = cardImageUrl(deckCard, "imageUrl")
  const name = deckCard.card?.name || "Unknown card"

  return (
    <button
      type="button"
      className={cn(
        "relative block w-full text-left transition-[filter,opacity] duration-200 ease-out",
        isDimmed && "opacity-30 saturate-50",
      )}
      aria-label={isSelected ? `Deselect ${name}` : `Select ${name}`}
      aria-pressed={isSelected}
      onClick={(event) => onToggleSelected(event.shiftKey)}
    >
      <figure
        className={cn(
          "relative aspect-[5/7] overflow-hidden rounded-lg bg-base-300 shadow ring-1 ring-white/10 transition duration-200",
          isSelected && "shadow-lg ring-2 ring-secondary",
        )}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-xs text-base-content/50">
            {name}
          </div>
        )}
        {deckCard.quantity > 1 ? (
          <span className="absolute bottom-1 right-1 z-10 rounded bg-primary px-1.5 py-1 text-xs font-black leading-none text-primary-content shadow">
            {deckCard.quantity}
          </span>
        ) : null}
        <span
          className={cn(
            "absolute right-1 top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full border shadow",
            isSelected
              ? "border-secondary bg-secondary text-secondary-content"
              : "border-base-100/80 bg-base-100/95 text-base-content",
          )}
          aria-hidden="true"
        >
          {isSelected ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </span>
      </figure>
    </button>
  )
}
