import { Plus, ScanLine } from "lucide-react"
import { SetIcon } from "../../components/card-tile"
import type { Finish } from "./printing-choice"
import { ScanEntryChips } from "./scan-entry-chips"
import { entryPriceCents, formatCents, type ScanEntry } from "./scan-list"

/**
 * The latest scan. Tapping the card row counts another copy (the explicit way to log the
 * same card twice in a row); the chips below adjust finish, printing and language.
 */
export function ScanResultBar({
  entry,
  onAddCopy,
  onFinish,
  onPrinting,
  onLanguage,
  onBackFace,
}: {
  entry: ScanEntry | null
  onAddCopy: (id: string) => void
  onFinish: (id: string, finish: Finish) => void
  onPrinting: (id: string) => void
  onLanguage: (id: string, language: string) => void
  onBackFace?: (id: string) => void
}) {
  if (!entry) {
    return (
      <div className="flex items-center gap-3 rounded-box border-[1.5px] border-base-300 bg-base-100/95 px-4 py-4 text-sm text-base-content/75 shadow-lg">
        <ScanLine className="h-5 w-5 shrink-0 text-base-content/60" aria-hidden="true" />
        Scanned cards appear here. Hold one card at a time in view of the camera.
      </div>
    )
  }

  const price = entryPriceCents(entry)

  return (
    <div
      key={entry.id}
      className="scan-result-enter rounded-box border-[1.5px] border-base-300 bg-base-100/95 p-2.5 shadow-lg"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onAddCopy(entry.id)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-field p-1 text-left transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label={`${entry.name}: tap to add another copy`}
        >
          <span className="relative shrink-0">
            {entry.imageUrl ? (
              <img
                src={entry.imageUrl}
                crossOrigin="anonymous"
                alt=""
                className="h-16 w-[2.9rem] rounded-[3px] object-cover shadow"
              />
            ) : (
              <span className="block h-16 w-[2.9rem] rounded-[3px] bg-base-300" />
            )}
            {entry.finish !== "nonfoil" ? (
              <span className="scan-foil-chip absolute inset-x-0 bottom-0 rounded-b-[3px] text-center text-[0.6rem] font-black uppercase leading-4 text-black">
                {entry.finish === "foil" ? "Foil" : "Etched"}
              </span>
            ) : null}
            {entry.quantity > 1 ? (
              <span className="absolute -right-2 -top-2 rounded-full bg-primary px-1.5 py-0.5 font-mono text-xs font-black text-primary-content shadow">
                ×{entry.quantity}
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-base font-black leading-tight">{entry.name}</span>
            <span className="mt-1 flex items-center gap-1.5 text-sm text-base-content/75">
              <SetIcon rarity={entry.rarity} setCode={entry.setCode} />
              <span className="truncate">{entry.setName ?? entry.setCode.toUpperCase()}</span>
            </span>
          </span>
          <span className="shrink-0 font-mono text-lg font-black text-warning">
            {entry.resolved ? formatCents(price) : "…"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onAddCopy(entry.id)}
          className="flex h-12 w-12 shrink-0 items-center justify-center gap-0.5 rounded-full bg-primary font-mono text-base font-black text-primary-content shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
          aria-label={`Add another ${entry.name}`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />1
        </button>
      </div>
      <ScanEntryChips
        className="mt-2"
        entry={entry}
        onFinish={(finish) => onFinish(entry.id, finish)}
        onPrinting={() => onPrinting(entry.id)}
        onLanguage={(language) => onLanguage(entry.id, language)}
        onBackFace={onBackFace ? () => onBackFace(entry.id) : undefined}
      />
    </div>
  )
}
