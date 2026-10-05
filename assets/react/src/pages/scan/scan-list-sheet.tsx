import { Minus, Plus, Search, Trash2 } from "lucide-react"
import { useState } from "react"
import { SetIcon } from "../../components/card-tile"
import { Button } from "../../components/ui/button"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { cn } from "../../lib/utils"
import type { Finish } from "./printing-choice"
import { ScanEntryChips } from "./scan-entry-chips"
import {
  entryPriceCents,
  filterEntries,
  formatCents,
  totalQuantity,
  totalValueCents,
  type ScanEntry,
} from "./scan-list"

export function ScanListSheet({
  open,
  entries,
  totalMinCents,
  onClose,
  onQuantity,
  onFinish,
  onPrinting,
  onLanguage,
  onBackFace,
  onRemove,
  onClear,
  onAddToCollection,
}: {
  open: boolean
  entries: ScanEntry[]
  /** Cards priced below this are left out of the total (see `ScanSettings.totalMinCents`). */
  totalMinCents: number
  onClose: () => void
  onQuantity: (id: string, quantity: number) => void
  onFinish: (id: string, finish: Finish) => void
  onPrinting: (id: string) => void
  onLanguage: (id: string, language: string) => void
  onBackFace: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  onAddToCollection: () => void
}) {
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const visible = filterEntries(entries, query)
  const count = totalQuantity(entries)

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="scan-sheet sm:max-w-2xl" labelledBy="scan-list-title">
          <DialogHeader>
            <div>
              <DialogTitle id="scan-list-title">Scanned cards</DialogTitle>
              <p className="mt-1 text-sm text-base-content/70">
                <span className="font-mono font-bold">{count}</span>{" "}
                {count === 1 ? "card" : "cards"} ·{" "}
                <span className="font-mono font-bold text-warning">
                  {formatCents(totalValueCents(entries, totalMinCents))}
                </span>
              </p>
            </div>
            <DialogClose onClose={onClose} />
          </DialogHeader>

          <div className="border-b border-base-300 px-5 py-3">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/60"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, set or number"
                aria-label="Search scanned cards"
                className="pl-9"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {entries.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-base-content/70">
                Nothing scanned yet. Cards you scan are kept here until you add them to your
                collection.
              </p>
            ) : visible.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-base-content/70">
                No scanned card matches “{query}”.
              </p>
            ) : (
              <ul className="divide-y divide-base-300">
                {visible.map((entry) => (
                  <ScanListRow
                    key={entry.id}
                    entry={entry}
                    editing={editing === entry.id}
                    onToggleEdit={() =>
                      setEditing((current) => (current === entry.id ? null : entry.id))
                    }
                    onQuantity={(quantity) => onQuantity(entry.id, quantity)}
                    onFinish={(finish) => onFinish(entry.id, finish)}
                    onPrinting={() => onPrinting(entry.id)}
                    onLanguage={(language) => onLanguage(entry.id, language)}
                    onBackFace={() => onBackFace(entry.id)}
                    onRemove={() => onRemove(entry.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-base-300 px-5 py-3 pb-[calc(0.75rem_+_var(--safe-bottom))]">
            <Button
              type="button"
              variant="ghost"
              disabled={entries.length === 0}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Clear
            </Button>
            <Button type="button" disabled={entries.length === 0} onClick={onAddToCollection}>
              Add to collection
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear scanned cards?"
        confirmLabel="Clear list"
        destructive
        onConfirm={() => {
          onClear()
          setConfirmClear(false)
        }}
      >
        This removes all {count} scanned {count === 1 ? "card" : "cards"} from this device. Cards
        already imported into your collection are not affected.
      </ConfirmDialog>
    </>
  )
}

function ScanListRow({
  entry,
  editing,
  onToggleEdit,
  onQuantity,
  onFinish,
  onPrinting,
  onLanguage,
  onBackFace,
  onRemove,
}: {
  entry: ScanEntry
  editing: boolean
  onToggleEdit: () => void
  onQuantity: (quantity: number) => void
  onFinish: (finish: Finish) => void
  onPrinting: () => void
  onLanguage: (language: string) => void
  onBackFace: () => void
  onRemove: () => void
}) {
  const price = entryPriceCents(entry)
  const finishLabel =
    entry.finish === "nonfoil" ? null : entry.finish === "foil" ? "Foil" : "Etched"

  return (
    <li className={cn("px-5 py-3", editing && "bg-base-200/60")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleEdit}
          aria-expanded={editing}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-field text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {entry.imageUrl ? (
            <img
              src={entry.imageUrl}
              crossOrigin="anonymous"
              alt=""
              loading="lazy"
              className="h-14 w-10 shrink-0 rounded-[3px] object-cover"
            />
          ) : (
            <span className="h-14 w-10 shrink-0 rounded-[3px] bg-base-300" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{entry.name}</span>
            {/* Badges wrap as a unit onto the next line; the text inside one never wraps. */}
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-base-content/70">
              <SetIcon rarity={entry.rarity} setCode={entry.setCode} />
              <span className="whitespace-nowrap font-mono">
                {entry.setCode.toUpperCase()} #{entry.collectorNumber} ·{" "}
                {entry.language.toUpperCase()}
              </span>
              {finishLabel ? (
                <span className="badge badge-warning badge-outline badge-sm whitespace-nowrap">
                  {finishLabel}
                </span>
              ) : null}
              {entry.back ? (
                <span className="badge badge-outline badge-sm max-w-full">
                  <span className="truncate">Back: {entry.back.name}</span>
                </span>
              ) : null}
            </span>
          </span>
          <span className="shrink-0 text-right font-mono text-sm font-bold text-warning">
            {entry.resolved ? formatCents(price === null ? null : price * entry.quantity) : "…"}
          </span>
        </button>
        <div className="flex shrink-0 items-center rounded-full border-[1.5px] border-base-300">
          <button
            type="button"
            className="flex h-11 w-10 items-center justify-center rounded-l-full hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label={entry.quantity === 1 ? `Remove ${entry.name}` : `One fewer ${entry.name}`}
            onClick={() => onQuantity(entry.quantity - 1)}
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span
            className="w-7 text-center font-mono font-bold"
            aria-label={`Quantity ${entry.quantity}`}
          >
            {entry.quantity}
          </span>
          <button
            type="button"
            className="flex h-11 w-10 items-center justify-center rounded-r-full hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label={`One more ${entry.name}`}
            onClick={() => onQuantity(entry.quantity + 1)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {editing ? (
        <div className="mt-3 flex items-center gap-2">
          <ScanEntryChips
            className="min-w-0 flex-1"
            entry={entry}
            onFinish={onFinish}
            onPrinting={onPrinting}
            onLanguage={onLanguage}
            onBackFace={onBackFace}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete ${entry.name}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </li>
  )
}
