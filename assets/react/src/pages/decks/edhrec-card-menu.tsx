import { Link } from "@tanstack/react-router"
import { Eye, MoreVertical, Plus } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "../../components/ui/badge"
import { cn } from "../../lib/utils"
import { blurFocusedMenuItem } from "./deck-actions"
import { AllocationStatusIcon } from "./deck-card-allocation"
import type {
  EDHRecAddZone,
  EDHRecCard,
  EDHRecCardReturnSearch,
  EDHRecCollectionStatus,
  EDHRecSectionCard,
} from "./deck-types"
import { EDHREC_ADD_CARD_ZONES } from "./deck-types"
import { collectionStatusShortLabel, collectionStatusTone, edhrecCardUrl } from "./edhrec-helpers"

export function EDHRecCardMenu({
  card,
  cardReturnSearch,
  isAddingCard,
  onAddCard,
}: {
  card: EDHRecCard | EDHRecSectionCard
  cardReturnSearch: EDHRecCardReturnSearch
  isAddingCard: boolean
  onAddCard: (zone: EDHRecAddZone) => void
}) {
  const localCardId = card.card?.id
  const externalUrl = edhrecCardUrl(card)

  return (
    <div
      className="dropdown dropdown-end shrink-0"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="btn btn-circle btn-xs border-0 bg-base-200 text-base-content/70 shadow-sm transition hover:bg-base-300"
        tabIndex={0}
        aria-label={`${card.name} actions`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      <ul
        tabIndex={0}
        className="menu dropdown-content z-50 mt-1 w-52 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl"
        onClick={blurFocusedMenuItem}
      >
        {EDHREC_ADD_CARD_ZONES.map(({ label, zone }) => (
          <li key={zone}>
            <button type="button" disabled={isAddingCard} onClick={() => onAddCard(zone)}>
              <Plus className="h-4 w-4" />
              {isAddingCard ? `Adding to ${label}...` : `Add to ${label}`}
            </button>
          </li>
        ))}
        <li>
          {localCardId ? (
            <Link to="/cards/$id" params={{ id: localCardId }} search={cardReturnSearch}>
              <Eye className="h-4 w-4" />
              View card
            </Link>
          ) : externalUrl ? (
            <a href={externalUrl} target="_blank" rel="noreferrer">
              <Eye className="h-4 w-4" />
              View on EDHREC
            </a>
          ) : (
            <button type="button" disabled>
              <Eye className="h-4 w-4" />
              View card
            </button>
          )}
        </li>
      </ul>
    </div>
  )
}

export function EDHRecCardLink({
  card,
  cardReturnSearch,
  children,
  className,
}: {
  card: EDHRecCard | EDHRecSectionCard
  cardReturnSearch: EDHRecCardReturnSearch
  children: ReactNode
  className?: string
}) {
  const localCardId = card.card?.id
  const externalUrl = edhrecCardUrl(card)

  if (localCardId) {
    return (
      <Link
        to="/cards/$id"
        params={{ id: localCardId }}
        search={cardReturnSearch}
        className={className}
      >
        {children}
      </Link>
    )
  }

  return externalUrl ? (
    <a href={externalUrl} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <>{children}</>
  )
}

export function CollectionStatusBadge({
  compact = false,
  status,
}: {
  compact?: boolean
  status: EDHRecCollectionStatus
}) {
  return (
    <Badge
      tone={collectionStatusTone(status.state)}
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
