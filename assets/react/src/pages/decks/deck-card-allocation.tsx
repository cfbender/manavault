import { AlertTriangle, CheckCircle2, Circle, Tag, XCircle } from "lucide-react"
import { cn, titleize } from "../../lib/utils"
import { deckCardTag, nextDeckCardTag } from "./deck-card-tags"
import type { DeckCardEntry, DeckCardTag } from "./deck-types"

export function DeckCardTagButton({
  className,
  disabled,
  onChange,
  shareMode = false,
  value,
}: {
  className?: string
  disabled?: boolean
  onChange: (tag: DeckCardTag | null) => void
  shareMode?: boolean
  value?: string | null
}) {
  const tag = deckCardTag(value)
  const Icon = tag?.icon || Tag
  const label = tag?.label || "Add tag"

  return (
    <button
      type="button"
      className={cn(
        "group/tag box-border inline-flex h-6 max-h-6 min-h-6 w-6 min-w-6 max-w-36 items-center justify-center gap-1 overflow-hidden rounded-full border px-0.5 py-0 text-[0.62rem] font-black leading-none shadow transition-all duration-150 hover:w-auto hover:px-1.5 focus-visible:w-auto focus-visible:px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-safe:hover:-translate-y-0.5",
        tag?.className || "border-base-300 bg-base-100/95 text-base-content",
        !tag && !shareMode && "opacity-80 group-hover/deck-card:opacity-100",
        shareMode && !tag && "hidden",
        className,
      )}
      disabled={disabled || shareMode}
      aria-label={shareMode ? label : `${label}; click to change tag`}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        if (disabled || shareMode) return
        onChange(nextDeckCardTag(value))
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="hidden whitespace-nowrap group-hover/tag:inline group-focus-visible/tag:inline">
        {tag?.shortLabel || "Tag"}
      </span>
    </button>
  )
}

export function DeckCardAllocationPanel({
  deckCard,
  error,
  isUpdating,
  onAllocate,
  onDeallocate,
  onToggleProxy,
}: {
  deckCard: DeckCardEntry
  error: string | null
  isUpdating: boolean
  onAllocate: (collectionItemId: string) => void
  onDeallocate: (collectionItemId: string) => void
  onToggleProxy: () => void
}) {
  const status = deckCard.allocationStatus
  const label = allocationStatusLabel(status)
  const proxyChecked = status.proxyAllocated > 0
  const proxyQuantityToAdd = Math.max(status.required - status.allocated, 0)
  const isBasicLand = status.state === "basic_land"
  const proxyDisabled = isUpdating || (!proxyChecked && proxyQuantityToAdd <= 0)

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-start gap-3 rounded-box border border-base-300 bg-base-200/35 p-3">
        <span
          className={cn(
            "mt-0.5 inline-flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border",
            allocationStatusButtonClass(status.state),
          )}
          aria-hidden="true"
        >
          <AllocationStatusIcon state={status.state} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-black">{label}</p>
          <p className="text-xs leading-5 text-base-content/70">
            {allocationStatusSummary(status)}
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          {error}
        </p>
      ) : null}

      {!isBasicLand ? (
        <>
          <div className="rounded-box border border-base-300 bg-base-200/35 p-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Proxy</p>
                <p className="truncate text-xs text-base-content/60">
                  {status.proxyAllocated} marked as proxy
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={proxyDisabled}
                onClick={onToggleProxy}
              >
                {proxyChecked ? "Remove proxy" : "Mark as proxy"}
              </button>
            </div>
          </div>

          {status.candidates.length === 0 ? (
            <div className="text-sm text-base-content/60">No matching owned printings.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {status.candidates.map((candidate) => (
                <li
                  key={candidate.item.id}
                  className="min-w-0 rounded-box border border-base-300 bg-base-200/35 p-3"
                >
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p
                        className="block max-w-full truncate font-semibold"
                        title={collectionItemLabel(candidate)}
                      >
                        {collectionItemLabel(candidate)}
                      </p>
                      <p className="truncate text-xs text-base-content/60">
                        {allocationCandidateSummary(candidate)}
                      </p>
                    </div>
                    <div className="grid min-w-0 grid-cols-2 gap-2 sm:w-56">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm min-w-0"
                        disabled={
                          isUpdating ||
                          candidate.available <= 0 ||
                          status.allocated >= status.required
                        }
                        onClick={() => onAllocate(candidate.item.id)}
                      >
                        <span className="truncate">Allocate</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm min-w-0"
                        disabled={isUpdating || candidate.allocated <= 0}
                        onClick={() => onDeallocate(candidate.item.id)}
                      >
                        <span className="truncate">Deallocate</span>
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  )
}

export function allocationStatusLabel(status: DeckCardEntry["allocationStatus"]) {
  if (status.state === "allocated") return "Fully allocated"
  if (status.state === "available") return "Available to allocate"
  if (status.state === "partial") return "Partially available"
  if (status.state === "basic_land") return "Basic land"
  return "Missing from collection"
}

export function allocationStatusSummary(status: DeckCardEntry["allocationStatus"]) {
  const proxyText = status.proxyAllocated ? ` · ${status.proxyAllocated} proxy` : ""

  if (status.state === "allocated") return `${status.allocated} allocated${proxyText}`
  if (status.state === "basic_land") return "Basic lands do not need collection copies"

  const needed = Math.max(status.required - status.allocated, 0)

  if (status.available > 0) return `${status.available} free of ${needed} needed${proxyText}`
  if (status.missing > 0 && status.allocated > 0)
    return `${status.allocated} allocated${proxyText} · ${status.missing} missing`
  if (status.missing > 0) return `${status.owned} owned · ${status.missing} missing`

  return `${status.required} needed${proxyText}`
}

export function allocationCandidateSummary(
  candidate: DeckCardEntry["allocationStatus"]["candidates"][number],
) {
  return [
    `${candidate.available} free`,
    candidate.allocated ? `${candidate.allocated} here` : null,
    candidate.allocatedElsewhere ? `${candidate.allocatedElsewhere} elsewhere` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function allocationStatusButtonClass(state: string) {
  if (state === "allocated")
    return "border-success/40 bg-success/90 text-success-content hover:bg-success"
  if (state === "available")
    return "border-primary/40 bg-primary/90 text-primary-content hover:bg-primary"
  if (state === "partial")
    return "border-warning/40 bg-warning/90 text-warning-content hover:bg-warning"
  if (state === "basic_land") return "border-info/40 bg-info/90 text-info-content hover:bg-info"
  return "border-error/40 bg-error/90 text-error-content hover:bg-error"
}

export function AllocationStatusIcon({ className, state }: { className?: string; state: string }) {
  if (state === "allocated") return <CheckCircle2 className={className} />
  if (state === "available" || state === "basic_land") return <Circle className={className} />
  if (state === "partial") return <AlertTriangle className={className} />
  return <XCircle className={className} />
}

export function collectionItemLabel(
  candidate: DeckCardEntry["allocationStatus"]["candidates"][number],
) {
  const item = candidate.item
  const printing = item.printing
  const setLabel = [
    printing?.setCode?.toUpperCase(),
    printing?.collectorNumber ? `#${printing.collectorNumber}` : null,
  ]
    .filter(Boolean)
    .join(" ")
  const location = allocationSourceLabel(candidate)
  return [setLabel || printing?.setName, titleize(item.finish), location]
    .filter(Boolean)
    .join(" · ")
}

function allocationSourceLabel(candidate: DeckCardEntry["allocationStatus"]["candidates"][number]) {
  if (candidate.allocated > 0) return "In this deck"
  if (candidate.allocatedElsewhere > 0 && candidate.available <= 0) return "In another deck"
  return candidate.item.location?.name || "Unfiled"
}
