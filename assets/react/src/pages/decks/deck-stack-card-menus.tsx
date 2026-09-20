import {
  CheckCircle2,
  Crown,
  Edit3,
  Eye,
  MoreVertical,
  MoveRight,
  Tag,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react"

import { CardTileOverlayButton } from "../../components/card-tile"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { cn } from "../../lib/utils"
import {
  AllocationStatusIcon,
  allocationStatusIconClass,
  allocationStatusLabel,
  allocationStatusSummary,
  collectionItemLabel,
} from "./deck-card-allocation"
import { nextDeckCardTag } from "./deck-card-tags"
import { DECK_STACK_CARD_MENU_ATTRIBUTE } from "./deck-stack-interactions"
import type { DeckStackCardActions } from "./deck-stack-card-types"
import type { DeckCardEntry, DeckCardTag } from "./deck-types"
import { DECK_CARD_TAGS } from "./deck-types"

export function DeckStackActionMenu({
  actions,
  canAddPartner,
  canSetCommander,
  deckCard,
  isInteractive,
  isUpdating,
  name,
  onOpenChange,
}: {
  actions: DeckStackCardActions
  canAddPartner: boolean
  canSetCommander: boolean
  deckCard: DeckCardEntry
  isInteractive: boolean
  isUpdating: boolean
  name: string
  onOpenChange: (open: boolean) => void
}) {
  const allocatedCandidate = deckCard.allocationStatus.candidates.find(
    (candidate) => candidate.allocated > 0,
  )
  const hasProxyAllocation = deckCard.allocationStatus.proxyAllocated > 0

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <CardTileOverlayButton tabIndex={isInteractive ? 0 : -1} aria-label={`${name} actions`}>
          <MoreVertical />
        </CardTileOverlayButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52 max-h-[min(70vh,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto"
        {...{ [DECK_STACK_CARD_MENU_ATTRIBUTE]: deckCard.id }}
      >
        <DropdownMenuItem onSelect={actions.preview}>
          <Eye className="h-4 w-4" /> View card details
        </DropdownMenuItem>
        {allocatedCandidate ? (
          <DropdownMenuItem
            disabled={isUpdating}
            title={collectionItemLabel(allocatedCandidate)}
            onSelect={() => actions.deallocate(allocatedCandidate.item.id)}
          >
            <XCircle className="h-4 w-4" /> Deallocate
          </DropdownMenuItem>
        ) : null}
        {hasProxyAllocation ? (
          <DropdownMenuItem disabled={isUpdating} onSelect={actions.toggleProxy}>
            <XCircle className="h-4 w-4" /> Remove proxy
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem disabled={isUpdating} onSelect={actions.edit}>
          <Edit3 className="h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isUpdating} onSelect={actions.move}>
          <MoveRight className="h-4 w-4" /> Move
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Tag</DropdownMenuLabel>
        {DECK_CARD_TAGS.map((tagOption) => (
          <DropdownMenuItem
            key={tagOption.value}
            disabled={isUpdating || deckCard.tag === tagOption.value}
            onSelect={() => actions.tag(tagOption.value)}
          >
            <tagOption.icon className="h-4 w-4" /> {tagOption.label}
          </DropdownMenuItem>
        ))}
        {deckCard.tag ? (
          <DropdownMenuItem onSelect={() => actions.tag(null)}>
            <Tag className="h-4 w-4" /> Clear tag
          </DropdownMenuItem>
        ) : null}
        {canSetCommander ? (
          <DropdownMenuItem disabled={isUpdating} onSelect={actions.setCommander}>
            <Crown className="h-4 w-4" /> Set as commander
          </DropdownMenuItem>
        ) : null}
        {canAddPartner ? (
          <DropdownMenuItem disabled={isUpdating} onSelect={actions.addPartner}>
            <UserPlus className="h-4 w-4" /> Add as partner
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive disabled={isUpdating} onSelect={actions.delete}>
          <Trash2 className="h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DeckCardAllocationQuickMenu({
  deckCard,
  isVisible,
  isUpdating,
  onAllocate,
  onDeallocate,
  onOpenChange,
  onReveal,
  onToggleProxy,
}: {
  deckCard: DeckCardEntry
  isVisible: boolean
  isUpdating: boolean
  onAllocate: (collectionItemId: string) => void
  onDeallocate: (collectionItemId: string) => void
  onOpenChange: (open: boolean) => void
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
    <div onClick={(event) => event.stopPropagation()}>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <CardTileOverlayButton
            tone="custom"
            className={cn(
              "relative transition-opacity",
              allocationStatusIconClass(status.state),
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
            <AllocationStatusIcon state={status.state} />
          </CardTileOverlayButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-44"
          {...{ [DECK_STACK_CARD_MENU_ATTRIBUTE]: deckCard.id }}
        >
          <DropdownMenuLabel className="whitespace-normal text-base-content">
            {label}
            <br />
            <span className="font-normal text-base-content/65">{summary}</span>
          </DropdownMenuLabel>
          {availableCandidate ? (
            <DropdownMenuItem
              disabled={isUpdating}
              title={collectionItemLabel(availableCandidate)}
              onSelect={() => onAllocate(availableCandidate.item.id)}
            >
              <CheckCircle2 className="h-4 w-4" /> Allocate copy
            </DropdownMenuItem>
          ) : null}
          {allocatedCandidate ? (
            <DropdownMenuItem
              disabled={isUpdating}
              title={collectionItemLabel(allocatedCandidate)}
              onSelect={() => onDeallocate(allocatedCandidate.item.id)}
            >
              <XCircle className="h-4 w-4" /> Deallocate
            </DropdownMenuItem>
          ) : null}
          {hasProxyAllocation || canMarkProxy ? (
            <DropdownMenuItem disabled={isUpdating} onSelect={onToggleProxy}>
              <XCircle className="h-4 w-4" />
              {hasProxyAllocation ? "Remove proxy" : "Mark proxy"}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function DeckCardTagQuickButton({
  disabled,
  isVisible,
  onChange,
  tag,
}: {
  disabled: boolean
  isVisible: boolean
  onChange: (tag: DeckCardTag | null) => void
  tag: DeckCardTag | null
}) {
  const descriptor = DECK_CARD_TAGS.find(({ value }) => value === tag)
  const Icon = descriptor?.icon || Tag
  const label = descriptor?.label || "Add tag"

  return (
    <CardTileOverlayButton
      tone={descriptor ? "custom" : "neutral"}
      className={cn(
        "transition-opacity",
        descriptor?.iconClassName,
        isVisible
          ? "visible opacity-100"
          : "invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
      )}
      disabled={disabled}
      tabIndex={isVisible ? 0 : -1}
      aria-label={`${label}; click to change tag`}
      title={label}
      onClick={() => onChange(nextDeckCardTag(tag))}
    >
      <Icon className="shrink-0" />
    </CardTileOverlayButton>
  )
}
