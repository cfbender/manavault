import { useRef, useState } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import type { AutoSortCollectionResult } from "./types"

type AutoSortMoveSummary = NonNullable<AutoSortCollectionResult["moves"]>[number]

type MoveDestinationGroup = {
  locationId: string
  locationName: string
  moves: AutoSortMoveSummary[]
}

export function AutoSortSummaryDialog({
  applyPending = false,
  onApply,
  onOpenChange,
  open,
  result,
}: {
  applyPending?: boolean
  onApply?: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  result: AutoSortCollectionResult | null
}) {
  const isDryRun = result?.dryRun === true
  const checkedCount = result?.checkedCount ?? 0
  const movedCount = result?.movedCount ?? 0
  const skippedCount = result?.skippedCount ?? 0
  const destinationGroups = groupMovesByDestination(result?.moves ?? [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" labelledBy="auto-sort-summary-title">
        <DialogHeader>
          <div>
            <DialogTitle id="auto-sort-summary-title">
              {isDryRun ? "Auto-sort preview" : "Auto-sort complete"}
            </DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              {isDryRun
                ? "Preview where matching cards would move before applying the rules."
                : "Review where matching cards were moved."}
            </p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="max-h-[min(68vh,42rem)] space-y-5 overflow-y-auto p-5">
          <dl className="grid gap-3 sm:grid-cols-3">
            <CountCard label="Checked" value={checkedCount} />
            <CountCard label={isDryRun ? "Would move" : "Moved"} value={movedCount} />
            <CountCard label="Skipped" value={skippedCount} />
          </dl>

          {destinationGroups.length ? (
            <div className="space-y-4">
              {destinationGroups.map((group) => (
                <section
                  key={group.locationId}
                  className="rounded-box border border-base-300 bg-base-100/70"
                  aria-labelledby={`auto-sort-destination-${group.locationId}`}
                >
                  <div className="border-b border-base-300 px-4 py-3">
                    <h3
                      id={`auto-sort-destination-${group.locationId}`}
                      className="font-black tracking-normal"
                    >
                      {group.locationName}
                    </h3>
                    <p className="text-xs text-base-content/60">Location ID: {group.locationId}</p>
                  </div>
                  <ul className="divide-y divide-base-300">
                    {group.moves.map((move) => (
                      <li key={move.collectionItemId} className="space-y-1 px-4 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <CardNamePreview move={move} />
                          <p className="text-sm text-base-content/70">Qty {move.quantity}</p>
                        </div>
                        <p className="text-sm text-base-content/70">
                          {isDryRun ? "Would move" : "Moved"} from {sourceLocationLabel(move)} to{" "}
                          {group.locationName}
                        </p>
                        <p className="text-xs text-base-content/50">
                          Item ID: {move.collectionItemId}
                          {move.fromLocationId
                            ? ` · Source ID: ${move.fromLocationId}`
                            : " · Source: Unfiled"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : movedCount === 0 ? (
            <p className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4 text-sm text-base-content/70">
              {isDryRun ? "No cards would move." : "No cards moved."}
            </p>
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
              <Button type="button" disabled={applyPending || movedCount === 0} onClick={onApply}>
                {applyPending ? "Applying..." : "Apply auto-sort"}
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

type PreviewPosition = {
  left: number
  top: number
}

function CardNamePreview({ move }: { move: AutoSortMoveSummary }) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState<PreviewPosition | null>(null)
  const imageUrl = move.imageUrl

  if (!imageUrl) {
    return <p className="font-bold">{move.cardName}</p>
  }

  function showPreview() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return

    const previewWidth = 176
    setPosition({
      left: Math.min(Math.max(rect.left, 12), window.innerWidth - previewWidth - 12),
      top: rect.top - 12,
    })
  }

  return (
    <span className="relative inline-block">
      <span
        ref={triggerRef}
        tabIndex={0}
        className="cursor-pointer font-bold text-accent underline decoration-accent/40 decoration-dotted underline-offset-4 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
        onBlur={() => setPosition(null)}
        onFocus={showPreview}
        onPointerEnter={showPreview}
        onPointerLeave={() => setPosition(null)}
      >
        {move.cardName}
      </span>
      {position ? (
        <span
          className="pointer-events-none fixed z-[9999] w-44 -translate-y-full rounded-xl border border-base-300 bg-base-100 p-2 shadow-2xl"
          style={{ left: position.left, top: position.top }}
        >
          <img
            src={imageUrl}
            alt={move.cardName}
            className="aspect-[5/7] w-full rounded-lg object-cover"
          />
        </span>
      ) : null}
    </span>
  )
}

function groupMovesByDestination(moves: readonly AutoSortMoveSummary[]): MoveDestinationGroup[] {
  const groups = new Map<string, MoveDestinationGroup>()

  for (const move of moves) {
    const group = groups.get(move.toLocationId)
    if (group) {
      group.moves.push(move)
    } else {
      groups.set(move.toLocationId, {
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

function sourceLocationLabel(move: AutoSortMoveSummary) {
  return move.fromLocationName || "Unfiled"
}
