import { Check } from "lucide-react"
import { cn } from "../lib/utils"

export type TokenPrintingOption = {
  id: string
  scryfallId: string
  setCode?: string | null
  collectorNumber?: string | null
  imageUrl?: string | null
  card?: { name?: string | null; typeLine?: string | null } | null
}

/**
 * Token printings as a grid of pressable card images. Tokens are told apart by art
 * more than by name (every set has a Soldier), so the image is the control.
 */
export function TokenPrintingGrid({
  className,
  columnsClassName = "grid-cols-3 sm:grid-cols-4",
  onPick,
  options,
  selectedScryfallId,
}: {
  className?: string
  columnsClassName?: string
  onPick: (option: TokenPrintingOption) => void
  options: readonly TokenPrintingOption[]
  selectedScryfallId?: string | null
}) {
  return (
    <ul className={cn("grid gap-3", columnsClassName, className)}>
      {options.map((option) => {
        const name = option.card?.name ?? "Token"
        const selected = selectedScryfallId === option.scryfallId
        return (
          <li key={option.scryfallId}>
            <button
              type="button"
              onClick={() => onPick(option)}
              aria-pressed={selected}
              className={cn(
                "flex w-full flex-col items-stretch gap-1.5 rounded-box border-[1.5px] p-1.5 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                selected ? "border-primary bg-primary/10" : "border-base-300 bg-base-100",
              )}
            >
              <span className="relative block aspect-[5/7] overflow-hidden rounded-[4px] bg-base-300">
                {option.imageUrl ? (
                  <img
                    src={option.imageUrl}
                    crossOrigin="anonymous"
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : null}
                {selected ? (
                  <Check
                    className="absolute right-1 top-1 h-5 w-5 rounded-full bg-primary p-0.5 text-primary-content"
                    aria-label="Selected"
                  />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{name}</span>
                <span className="block truncate font-mono text-xs text-base-content/70">
                  {option.setCode?.toUpperCase()} #{option.collectorNumber}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
