import { cn } from "../../lib/utils"
import { deckZoneDisplayLabel, type DeckZone } from "./deck-types"

// Compact segmented control for picking a deck zone, styled like the
// finish (NONFOIL/FOIL/ETCHED) toggle in CollectionFinishField.
export function ZoneToggle({
  disabled = false,
  onChange,
  value,
  zones,
}: {
  disabled?: boolean
  onChange: (zone: DeckZone) => void
  value: DeckZone
  zones: readonly DeckZone[]
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-btn border border-base-300 bg-base-100 p-1">
      {zones.map((zone) => {
        const selected = zone === value

        return (
          <button
            key={zone}
            type="button"
            className={cn(
              "min-h-8 flex-1 rounded-btn px-2 text-xs font-black uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              selected
                ? "bg-base-content text-base-100 shadow-inner"
                : "text-base-content/65 hover:bg-base-200 hover:text-base-content",
            )}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(zone)}
          >
            {deckZoneDisplayLabel(zone)}
          </button>
        )
      })}
    </div>
  )
}
