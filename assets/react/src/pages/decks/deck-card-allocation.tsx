import { AlertTriangle, CheckCircle2, Circle, Tag, XCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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
        "group/tag box-border inline-flex h-5 max-h-5 min-h-5 w-5 min-w-5 max-w-36 items-center justify-center gap-1 overflow-hidden rounded-full border px-0.5 py-0 text-[0.6rem] font-black leading-none shadow transition-all duration-150 hover:w-auto hover:px-1.5 focus-visible:w-auto focus-visible:px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        tag?.className || "border-base-300 bg-base-100/90 text-base-content",
        !tag &&
          !shareMode &&
          "opacity-0 group-hover/deck-card:opacity-80 group-focus-within/deck-card:opacity-100",
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

export function DeckCardAllocationMenu({
  deckCard,
  error,
  isInteractive,
  isUpdating,
  onAllocate,
  onDeallocate,
  onOpenChange,
  onToggleProxy,
  open,
}: {
  deckCard: DeckCardEntry
  error: string | null
  isInteractive: boolean
  isUpdating: boolean
  onAllocate: (collectionItemId: string) => void
  onDeallocate: (collectionItemId: string) => void
  onOpenChange: (open: boolean) => void
  onToggleProxy: () => void
  open: boolean
}) {
  const status = deckCard.allocationStatus
  const label = allocationStatusLabel(status)
  const proxyChecked = status.proxyAllocated > 0
  const proxyQuantityToAdd = Math.max(status.required - status.allocated, 0)
  const isBasicLand = status.state === "basic_land"
  const proxyDisabled = isUpdating || (!proxyChecked && proxyQuantityToAdd <= 0)
  const [menuPosition, setMenuPosition] = useState({ left: 16, top: 16, width: 320 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function updateMenuPosition() {
    const button = buttonRef.current
    if (!button) return

    const bounds = button.getBoundingClientRect()
    const margin = 16
    const menuWidth = Math.min(320, Math.max(window.innerWidth - margin * 2, 0))
    const menuMaxHeight = 416
    const spaceBelow = window.innerHeight - bounds.bottom - margin
    const spaceAbove = bounds.top - margin
    const openAbove = spaceBelow < 240 && spaceAbove > spaceBelow

    setMenuPosition({
      left: Math.min(
        Math.max(bounds.left, margin),
        Math.max(window.innerWidth - menuWidth - margin, margin),
      ),
      width: menuWidth,
      top: openAbove
        ? Math.max(margin, bounds.top - Math.min(menuMaxHeight, spaceAbove) - 4)
        : Math.min(bounds.bottom + 4, Math.max(window.innerHeight - margin, margin)),
    })
  }

  useEffect(() => {
    if (!isInteractive) onOpenChange(false)
  }, [isInteractive, onOpenChange])

  useEffect(() => {
    if (!open) return

    updateMenuPosition()

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      onOpenChange(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false)
    }

    window.addEventListener("resize", updateMenuPosition)
    window.addEventListener("scroll", updateMenuPosition, true)
    document.addEventListener("pointerdown", handlePointerDown, true)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("resize", updateMenuPosition)
      window.removeEventListener("scroll", updateMenuPosition, true)
      document.removeEventListener("pointerdown", handlePointerDown, true)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div
      className="relative z-[130] flex h-5 max-h-5 min-h-5 w-5 min-w-5 items-center justify-center overflow-visible leading-none"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "flex h-5 max-h-5 min-h-5 w-5 min-w-5 items-center justify-center rounded-full border p-0 leading-none shadow transition",
          allocationStatusButtonClass(status.state),
        )}
        tabIndex={isInteractive ? 0 : -1}
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => {
          if (!isInteractive) return
          updateMenuPosition()
          onOpenChange(!open)
        }}
      >
        <AllocationStatusIcon state={status.state} className="h-3 w-3" />
      </button>
      {open && isInteractive
        ? createPortal(
            <div
              ref={menuRef}
              tabIndex={0}
              className="fixed z-[1000] max-h-[calc(100dvh-2rem)] max-w-[calc(100dvw-2rem)] overflow-y-auto rounded-box border border-base-300 bg-base-100 p-3 text-sm shadow-2xl"
              style={menuPosition}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="space-y-1">
                <p className="font-black">{label}</p>
                <p className="text-xs leading-5 text-base-content/70">
                  {allocationStatusSummary(status)}
                </p>
              </div>

              {error ? (
                <p className="mt-3 rounded-box border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
                  {error}
                </p>
              ) : null}

              {!isBasicLand ? (
                <>
                  <div className="mt-3 rounded-box border border-base-300 bg-base-200/35 p-2">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">Proxy</p>
                        <p className="truncate text-xs text-base-content/60">
                          {status.proxyAllocated} marked as proxy
                        </p>
                      </div>
                      <label className="label shrink-0 cursor-pointer gap-2 p-0">
                        <span className="label-text text-xs">
                          {proxyChecked ? "Marked" : "Mark as proxy"}
                        </span>
                        <input
                          type="checkbox"
                          className="toggle toggle-primary toggle-sm"
                          checked={proxyChecked}
                          disabled={proxyDisabled}
                          aria-label={proxyChecked ? "Remove proxy" : "Mark as proxy"}
                          onChange={() => onToggleProxy()}
                        />
                      </label>
                    </div>
                  </div>

                  {status.candidates.length === 0 ? (
                    <div className="mt-3 text-sm text-base-content/60">
                      No matching owned printings.
                    </div>
                  ) : (
                    <ul className="mt-3 space-y-2 text-sm">
                      {status.candidates.map((candidate) => (
                        <li
                          key={candidate.item.id}
                          className="min-w-0 rounded-box border border-base-300 bg-base-200/35 p-2"
                        >
                          <div className="grid min-w-0 gap-2">
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
                            <div className="grid min-w-0 grid-cols-2 gap-2">
                              <button
                                type="button"
                                className="btn btn-primary btn-xs min-w-0"
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
                                className="btn btn-outline btn-xs min-w-0"
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
            </div>,
            document.body,
          )
        : null}
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
