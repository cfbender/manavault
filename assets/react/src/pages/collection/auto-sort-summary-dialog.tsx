import { useEffect, useRef, useState } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"

export type AutoSortSummaryMove = {
  cardId?: string | null
  cardName: string
  collectionItemId: string
  finish: string
  fromLocationId?: string | null
  fromLocationName?: string | null
  imageUrl?: string | null
  quantity: number
  toLocationId?: string | null
  toLocationName: string
}

export type AutoSortSummaryResult = {
  checkedCount?: number | null
  dryRun?: boolean | null
  movedCount?: number | null
  moves?: readonly AutoSortSummaryMove[] | null
  skippedCount?: number | null
}

type MoveDestinationGroup = {
  key: string
  locationId?: string | null
  locationName: string
  moves: AutoSortSummaryMove[]
}

export function AutoSortSummaryDialog({
  applyLabel = "Apply auto-sort",
  applyPending = false,
  applyPendingLabel = "Applying...",
  completeDescription = "Review where matching cards were moved.",
  completeEmptyDescription,
  completeEmptyTitle = "No cards moved.",
  completeMoveLabel = "Moved",
  completeTitle = "Auto-sort complete",
  disableApplyWhenNoMoves = true,
  dryRunDescription = "Preview where matching cards would move before applying the rules.",
  dryRunEmptyDescription,
  dryRunEmptyTitle = "No cards would move.",
  dryRunMoveLabel = "Would move",
  dryRunTitle = "Auto-sort preview",
  checkedCountLabel = "Checked",
  skippedCountLabel = "Skipped",
  onApply,
  onOpenChange,
  open,
  result,
  showItemMetadata = true,
}: {
  applyLabel?: string
  applyPending?: boolean
  applyPendingLabel?: string
  completeDescription?: string
  completeEmptyDescription?: string
  completeEmptyTitle?: string
  completeMoveLabel?: string
  completeTitle?: string
  disableApplyWhenNoMoves?: boolean
  dryRunDescription?: string
  dryRunEmptyDescription?: string
  dryRunEmptyTitle?: string
  dryRunMoveLabel?: string
  dryRunTitle?: string
  checkedCountLabel?: string
  skippedCountLabel?: string
  onApply?: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  result?: AutoSortSummaryResult | null
  showItemMetadata?: boolean
}) {
  const isDryRun = result?.dryRun === true
  const checkedCount = result?.checkedCount ?? 0
  const movedCount = result?.movedCount ?? 0
  const skippedCount = result?.skippedCount ?? 0
  const destinationGroups = groupMovesByDestination(result?.moves ?? [])
  const title = isDryRun ? dryRunTitle : completeTitle
  const description = isDryRun ? dryRunDescription : completeDescription
  const emptyTitle = isDryRun ? dryRunEmptyTitle : completeEmptyTitle
  const emptyDescription = isDryRun ? dryRunEmptyDescription : completeEmptyDescription
  const moveLabel = isDryRun ? dryRunMoveLabel : completeMoveLabel

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" labelledBy="auto-sort-summary-title">
        <DialogHeader>
          <div>
            <DialogTitle id="auto-sort-summary-title">{title}</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{description}</p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="max-h-[min(68vh,42rem)] space-y-5 overflow-y-auto p-5">
          <dl className="grid gap-3 sm:grid-cols-3">
            <CountCard label={checkedCountLabel} value={checkedCount} />
            <CountCard label={moveLabel} value={movedCount} />
            <CountCard label={skippedCountLabel} value={skippedCount} />
          </dl>

          {destinationGroups.length ? (
            <div className="space-y-4">
              {destinationGroups.map((group, index) => {
                const headingId =
                  group.locationId != null
                    ? `auto-sort-destination-${group.locationId}`
                    : `auto-sort-destination-${index}`

                return (
                  <details
                    key={group.key}
                    open
                    className="rounded-box border border-base-300 bg-base-100/70"
                    aria-labelledby={headingId}
                  >
                    <summary className="cursor-pointer px-4 py-3 marker:text-base-content/60">
                      <div className="inline-flex w-[calc(100%-1.5rem)] flex-wrap items-start justify-between gap-3 align-top">
                        <div>
                          <h3 id={headingId} className="font-black tracking-normal">
                            {group.locationName}
                          </h3>
                          {group.locationId != null ? (
                            <p className="text-xs text-base-content/60">
                              Location ID: {group.locationId}
                            </p>
                          ) : null}
                        </div>
                        <span className="badge badge-outline shrink-0">
                          {group.moves.length} {group.moves.length === 1 ? "card" : "cards"}
                        </span>
                      </div>
                    </summary>
                    <ul className="divide-y divide-base-300 border-t border-base-300">
                      {group.moves.map((move) => (
                        <li key={move.collectionItemId} className="space-y-1 px-4 py-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <CardNamePreview move={move} />
                            <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/70">
                              <span>Qty {move.quantity}</span>
                              <FinishBadge finish={move.finish} />
                            </div>
                          </div>
                          <p className="text-sm text-base-content/70">
                            {moveLabel} from {sourceLocationLabel(move)} to {group.locationName}
                          </p>
                          {showItemMetadata ? (
                            <p className="text-xs text-base-content/50">
                              Item ID: {move.collectionItemId}
                              {move.fromLocationId
                                ? ` · Source ID: ${move.fromLocationId}`
                                : " · Source: Unfiled"}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                )
              })}
            </div>
          ) : movedCount === 0 ? (
            <EmptyMoveSummary title={emptyTitle} description={emptyDescription} />
          ) : (
            <p className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4 text-sm text-base-content/70">
              Move details are not available.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {isDryRun ? "Close preview" : "Done"}
            </Button>
            {isDryRun && onApply ? (
              <Button
                type="button"
                disabled={applyPending || (disableApplyWhenNoMoves && movedCount === 0)}
                onClick={onApply}
              >
                {applyPending ? applyPendingLabel : applyLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-box border border-base-300 bg-base-200/50 p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-base-content/60">{label}</dt>
      <dd className="mt-1 text-2xl font-black tracking-tight">{value}</dd>
    </div>
  )
}

function EmptyMoveSummary({
  description,
  title,
}: {
  description?: string
  title: string
}) {
  if (!description) {
    return (
      <p className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4 text-sm text-base-content/70">
        {title}
      </p>
    )
  }

  return (
    <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4">
      <p className="text-sm font-bold text-base-content/80">{title}</p>
      <p className="mt-1 text-sm text-base-content/70">{description}</p>
    </div>
  )
}

function FinishBadge({ finish }: { finish: string }) {
  const isFoil = finish === "foil" || finish === "etched"
  const label = finishLabel(finish)

  return (
    <span
      title={`${label} finish`}
      className={
        isFoil
          ? "badge badge-sm border-accent/40 bg-accent/15 text-accent"
          : "badge badge-sm badge-outline text-base-content/70"
      }
    >
      {label}
    </span>
  )
}

function finishLabel(finish: string) {
  if (finish === "foil") return "Foil"
  if (finish === "etched") return "Etched foil"
  if (finish === "nonfoil") return "Nonfoil"
  return "Unknown finish"
}

type PreviewPosition = {
  left: number
  top: number
}

function CardNamePreview({ move }: { move: AutoSortSummaryMove }) {
  const triggerRef = useRef<HTMLAnchorElement>(null)
  const hideTimeoutRef = useRef<number | null>(null)
  const [position, setPosition] = useState<PreviewPosition | null>(null)
  const cardHref = move.cardId ? `/cards/${encodeURIComponent(move.cardId)}` : null
  const imageUrl = move.imageUrl

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current === null) return

      window.clearTimeout(hideTimeoutRef.current)
    }
  }, [])

  if (!imageUrl || !cardHref) {
    return cardHref ? (
      <p className="font-bold">
        <a
          href={cardHref}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline decoration-accent/40 decoration-dotted underline-offset-4 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
        >
          {move.cardName}
        </a>
      </p>
    ) : (
      <p className="font-bold">{move.cardName}</p>
    )
  }

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
      <a
        ref={triggerRef}
        href={cardHref}
        target="_blank"
        rel="noreferrer"
        className="cursor-pointer font-bold text-accent underline decoration-accent/40 decoration-dotted underline-offset-4 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
        onBlur={hidePreviewSoon}
        onFocus={showPreview}
        onPointerEnter={showPreview}
        onPointerLeave={hidePreviewSoon}
      >
        {move.cardName}
      </a>
      {position ? (
        <a
          href={cardHref}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${move.cardName} card details in a new tab`}
          className="fixed z-[9999] block w-44 -translate-y-full rounded-xl border border-base-300 bg-base-100 p-2 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          style={{ left: position.left, top: position.top }}
          onBlur={hidePreviewSoon}
          onFocus={showPreview}
          onPointerEnter={showPreview}
          onPointerLeave={hidePreviewSoon}
        >
          <img
            src={imageUrl}
            alt={move.cardName}
            className="aspect-[5/7] w-full rounded-lg object-cover"
          />
        </a>
      ) : null}
    </span>
  )
}

function groupMovesByDestination(moves: readonly AutoSortSummaryMove[]): MoveDestinationGroup[] {
  const groups = new Map<string, MoveDestinationGroup>()

  for (const move of moves) {
    const key = move.toLocationId ?? `unfiled:${move.toLocationName}`
    const group = groups.get(key)
    if (group) {
      group.moves.push(move)
    } else {
      groups.set(key, {
        key,
        locationId: move.toLocationId,
        locationName: move.toLocationName,
        moves: [move],
      })
    }
  }

  return Array.from(groups.values()).sort((left, right) =>
    left.locationName.localeCompare(right.locationName),
  )
}

function sourceLocationLabel(move: AutoSortSummaryMove) {
  return move.fromLocationName || "Unfiled"
}
