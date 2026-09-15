import { Eye, MoreVertical, Plus, Scissors, Trash2 } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Badge } from "../../components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { cn } from "../../lib/utils"
import { AllocationStatusIcon } from "./deck-card-allocation"
import type { EDHRecAddZone, EDHRecCollectionStatus, RecommendedCardLike } from "./deck-types"
import { EDHREC_ADD_CARD_ZONES } from "./deck-types"
import {
  collectionStatusHoverLabel,
  collectionStatusShortLabel,
  collectionStatusTone,
  edhrecCardUrl,
} from "./edhrec-helpers"
import type { CardDetailDialogTarget } from "./deck-card-detail-dialog"

export function EDHRecCardMenu({
  card,
  isPending,
  mode = "recs",
  onAddCard,
  onConsiderCutting,
  onCut,
  onPreviewCard,
}: {
  card: RecommendedCardLike
  isPending: boolean
  mode?: "recs" | "cuts"
  onAddCard: (zone: EDHRecAddZone) => void
  onConsiderCutting?: () => void
  onCut?: () => void
  onPreviewCard: (card: CardDetailDialogTarget) => void
}) {
  const localCardId = card.card?.id
  const externalUrl = edhrecCardUrl(card)
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div
      className="inline-flex shrink-0"
      data-mobile-hover-skip=""
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="btn btn-circle btn-xs border-0 bg-base-200 text-base-content/70 shadow-sm transition hover:bg-base-300"
            aria-label={`${card.name} actions`}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          sideOffset={2}
          className="z-[1200] w-52 shadow-2xl"
          data-mobile-hover-skip=""
        >
          {mode === "cuts" ? (
            <>
              <DropdownMenuItem
                disabled={isPending || !onConsiderCutting}
                onSelect={() => {
                  setIsOpen(false)
                  onConsiderCutting?.()
                }}
              >
                <Scissors className="h-4 w-4" />
                Consider cutting
              </DropdownMenuItem>
              <DropdownMenuItem
                destructive
                disabled={isPending || !onCut}
                onSelect={() => {
                  setIsOpen(false)
                  onCut?.()
                }}
              >
                <Trash2 className="h-4 w-4" />
                Cut
              </DropdownMenuItem>
            </>
          ) : (
            EDHREC_ADD_CARD_ZONES.map(({ label, zone }) => (
              <DropdownMenuItem key={zone} disabled={isPending} onSelect={() => onAddCard(zone)}>
                <Plus className="h-4 w-4" />
                {isPending ? `Adding to ${label}...` : `Add to ${label}`}
              </DropdownMenuItem>
            ))
          )}
          {localCardId ? (
            <DropdownMenuItem onSelect={() => onPreviewCard({ id: localCardId, name: card.name })}>
              <Eye className="h-4 w-4" />
              View card
            </DropdownMenuItem>
          ) : externalUrl ? (
            <DropdownMenuItem asChild>
              <a href={externalUrl} target="_blank" rel="noreferrer">
                <Eye className="h-4 w-4" />
                View on EDHREC
              </a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled>
              <Eye className="h-4 w-4" />
              View card
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function EDHRecCardDetailTrigger({
  card,
  children,
  className,
  onPreviewCard,
}: {
  card: RecommendedCardLike
  children: ReactNode
  className?: string
  onPreviewCard: (card: CardDetailDialogTarget) => void
}) {
  const localCardId = card.card?.id
  const externalUrl = edhrecCardUrl(card)

  if (localCardId) {
    return (
      <button
        type="button"
        className={cn("cursor-pointer bg-transparent p-0 text-left", className)}
        onClick={() => onPreviewCard({ id: localCardId, name: card.name })}
      >
        {children}
      </button>
    )
  }

  return externalUrl ? (
    <a href={externalUrl} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  )
}

export function CollectionStatusBadge({
  compact = false,
  status,
}: {
  compact?: boolean
  status: EDHRecCollectionStatus
}) {
  const title = collectionStatusHoverLabel(status)
  return (
    <Badge
      tone={collectionStatusTone(status.state)}
      title={title}
      className={cn(
        "whitespace-nowrap bg-base-100/90 shadow-sm backdrop-blur",
        compact && "px-1.5 text-[0.62rem]",
      )}
    >
      <AllocationStatusIcon
        state={status.state}
        className={cn("mr-1 h-3 w-3", compact && "h-2.5 w-2.5")}
      />
      {collectionStatusShortLabel(status)}
    </Badge>
  )
}
