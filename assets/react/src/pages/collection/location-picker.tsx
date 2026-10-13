import { useEffect, useRef, type RefObject } from "react"
import { cn } from "../../lib/utils"
import { LocationObject, locationObjectCards } from "./location-object"
import { isUnfiledLocation } from "./location-summary"
import type { LocationSummary } from "./types"

/** The picker value for the unfiled pile ("" means no location). */
export const UNFILED_PICK = ""

/**
 * Locations to put a card in, drawn as small versions of their objects. The
 * chosen one holds its open pose, ready to receive the card. Each tile is
 * marked with `data-location-target` so a drop animation can find it.
 */
export function LocationPicker({
  disabled,
  locations,
  onChange,
  receiving,
  value,
}: {
  disabled?: boolean
  locations: readonly LocationSummary[]
  onChange: (locationId: string) => void
  receiving?: string | null
  value: string
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  useWheelScrollsSideways(rowRef)
  const unfiled = locations.find(isUnfiledLocation)
  const stored = locations.filter((location) => !isUnfiledLocation(location))
  const options = [
    { id: UNFILED_PICK, name: "Unfiled", location: unfiled },
    ...stored.map((location) => ({ id: location.id, name: location.name, location })),
  ]

  return (
    <div
      ref={rowRef}
      role="radiogroup"
      aria-label="Location"
      // Edges fade out so a row wider than the dialog reads as scrollable.
      className="-mx-5 flex snap-x scroll-px-5 gap-1 overflow-x-auto px-5 pb-1 pt-2 [mask-image:linear-gradient(to_right,transparent,black_2.5rem,black_calc(100%_-_2.5rem),transparent)]"
    >
      {options.map((option) => {
        const checked = option.id === value
        return (
          <button
            key={option.id || "unfiled"}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.name}
            disabled={disabled}
            data-location-target={option.id || "unfiled"}
            className={cn(
              "location-card location-card--interactive group/pick w-28 shrink-0 snap-start rounded-box px-1 pb-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:pointer-events-none",
              checked ? "is-open bg-primary/10" : "hover:bg-base-200/60",
              receiving === (option.id || "unfiled") && "lo-receive",
            )}
            onClick={(event) => {
              event.currentTarget.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "nearest",
              })
              onChange(option.id)
            }}
          >
            <LocationObject
              cards={option.location ? locationObjectCards(option.location) : []}
              className="lo-stage--mini h-24"
              coverArtUrl={option.location?.coverPrinting?.artCropUrl}
              kind={option.location?.kind ?? "unfiled"}
              seed={option.id || "unfiled"}
              stickers={option.location?.stickers}
            />
            <span
              className={cn(
                "mt-1 block truncate text-xs",
                checked ? "font-black text-primary" : "font-bold text-base-content/75",
              )}
            >
              {option.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Lets a mouse wheel scroll the row sideways while it can still move that way;
 * at either end the wheel scrolls the dialog as usual. Trackpads and touch
 * already scroll it natively.
 */
function useWheelScrollsSideways(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const row = ref.current
    if (!row) return

    function handleWheel(event: WheelEvent) {
      if (!row || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      const maxScroll = row.scrollWidth - row.clientWidth
      const canMove =
        (event.deltaY < 0 && row.scrollLeft > 1) ||
        (event.deltaY > 0 && row.scrollLeft < maxScroll - 1)
      if (!canMove) return
      event.preventDefault()
      row.scrollLeft += event.deltaY
    }

    row.addEventListener("wheel", handleWheel, { passive: false })
    return () => row.removeEventListener("wheel", handleWheel)
  }, [ref])
}
