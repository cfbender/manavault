import { ChevronDown, FlipHorizontal2, Plus } from "lucide-react"
import { cn } from "../../lib/utils"
import { isSingleFacedToken, type Finish } from "./printing-choice"
import { SCAN_LANGUAGES, type ScanEntry } from "./scan-list"

const FINISH_LABELS: Record<Finish, string> = { nonfoil: "Normal", foil: "Foil", etched: "Etched" }
const ALL_FINISHES: Finish[] = ["nonfoil", "foil", "etched"]

const chip =
  "inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"

/** Quick edits for one scanned entry: finish, printing, language, token back and another copy. */
export function ScanEntryChips({
  entry,
  onFinish,
  onPrinting,
  onLanguage,
  onBackFace,
  onAddCopy,
  className,
}: {
  entry: ScanEntry
  onFinish: (finish: Finish) => void
  onPrinting: () => void
  onLanguage: (language: string) => void
  /** Opens the token back picker; only shown for single-faced tokens. */
  onBackFace?: () => void
  onAddCopy?: () => void
  className?: string
}) {
  // Until the catalog answers, every finish is offered; afterwards only printed ones.
  const finishes = entry.finishes.length > 0 ? entry.finishes : ALL_FINISHES

  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto pb-0.5", className)}>
      <div
        role="radiogroup"
        aria-label="Finish"
        className="flex h-11 shrink-0 items-center rounded-full border-[1.5px] border-base-300 bg-base-100 p-0.5"
      >
        {finishes.map((finish) => {
          const active = entry.finish === finish
          return (
            <button
              key={finish}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onFinish(finish)}
              className={cn(
                "h-full rounded-full px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                active
                  ? finish === "nonfoil"
                    ? "bg-base-content text-base-100"
                    : "scan-foil-chip text-black"
                  : "text-base-content/75 hover:text-base-content",
              )}
            >
              {FINISH_LABELS[finish]}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onPrinting}
        className={cn(
          chip,
          "border-base-300 bg-base-100 text-base-content hover:border-primary/60",
        )}
        aria-label={`Change printing, currently ${entry.setCode.toUpperCase()} number ${entry.collectorNumber}`}
      >
        <span className="font-mono">
          {entry.setCode.toUpperCase()} #{entry.collectorNumber || "?"}
        </span>
        <ChevronDown className="h-4 w-4 opacity-70" aria-hidden="true" />
      </button>

      <label
        className={cn(
          chip,
          "relative border-base-300 bg-base-100 text-base-content focus-within:ring-2 focus-within:ring-primary/50",
        )}
      >
        <span className="font-mono uppercase">{entry.language}</span>
        <ChevronDown className="h-4 w-4 opacity-70" aria-hidden="true" />
        <select
          aria-label="Language"
          value={entry.language}
          onChange={(event) => onLanguage(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {SCAN_LANGUAGES.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
          {SCAN_LANGUAGES.some(([code]) => code === entry.language) ? null : (
            <option value={entry.language}>{entry.language}</option>
          )}
        </select>
      </label>

      {onBackFace && isSingleFacedToken({ layout: entry.layout ?? null }) ? (
        <button
          type="button"
          onClick={onBackFace}
          className={cn(
            chip,
            "border-base-300 bg-base-100 text-base-content hover:border-primary/60",
          )}
          aria-label={
            entry.back
              ? `Change token back, currently ${entry.back.name}`
              : "Choose what is on the token's back"
          }
        >
          <FlipHorizontal2 className="h-4 w-4 opacity-70" aria-hidden="true" />
          <span className="max-w-[8rem] truncate">
            {entry.back ? entry.back.name : entry.back === null ? "Single-sided" : "Back?"}
          </span>
        </button>
      ) : null}

      {onAddCopy ? (
        <button
          type="button"
          onClick={onAddCopy}
          className={cn(chip, "border-primary bg-primary text-primary-content")}
          aria-label={`Add another ${entry.name}`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />1
        </button>
      ) : null}
    </div>
  )
}
