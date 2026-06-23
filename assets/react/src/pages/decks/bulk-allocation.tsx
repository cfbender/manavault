import { CheckCircle2, ChevronDown, Layers, Sparkles } from "lucide-react"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { titleize } from "../../lib/utils"
import { blurFocusedMenuItem } from "./deck-actions"
import { copyLabel, deckCardLabel } from "./deck-card-tags"
import type { BulkAllocationMode, BulkAllocationPreview } from "./deck-types"
import { collectionItemPrintingLabel, deckCardPrintingLabel } from "./printing-labels"

export function BulkAllocationMenu({
  disabled,
  onPreview,
}: {
  disabled: boolean
  onPreview: (mode: BulkAllocationMode) => void
}) {
  return (
    <div className="dropdown dropdown-end">
      <button
        type="button"
        className="btn btn-primary btn-sm min-w-40 justify-between gap-2 px-4"
        tabIndex={0}
        disabled={disabled}
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Allocation
        </span>
        <ChevronDown className="h-4 w-4" />
      </button>
      <div
        tabIndex={0}
        className="dropdown-content right-0 z-50 mt-2 box-border w-60 max-w-[calc(100dvw-2rem)] rounded-box border border-base-300 bg-base-100 p-2 shadow-2xl"
        onClick={blurFocusedMenuItem}
      >
        <button
          type="button"
          className="btn btn-primary btn-sm w-full justify-start"
          onClick={() => onPreview("exact_printings")}
        >
          <CheckCircle2 className="h-4 w-4" />
          Exact printings
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm mt-2 w-full justify-start"
          onClick={() => onPreview("matching_printings")}
        >
          <Layers className="h-4 w-4" />
          Partial matches
        </button>
      </div>
    </div>
  )
}

export function BulkAllocationPreviewDialog({
  error,
  isPending,
  onClose,
  onConfirm,
  preview,
}: {
  error: string | null
  isPending: boolean
  onClose: () => void
  onConfirm: (mode: BulkAllocationMode) => void
  preview: BulkAllocationPreview | null
}) {
  const mode = bulkAllocationMode(preview?.mode)

  return (
    <Dialog open={Boolean(preview)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-4xl" labelledBy="bulk-allocation-title">
        <DialogHeader>
          <div>
            <DialogTitle id="bulk-allocation-title">{bulkAllocationModeLabel(mode)}</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              {preview
                ? `${preview.allocated} collection ${copyLabel(preview.allocated)} across ${preview.cards} ${deckCardLabel(preview.cards)}.`
                : null}
            </p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="space-y-4 p-5">
          {preview?.entries.length === 0 ? (
            <div className="rounded-box border border-info/20 bg-info/10 p-4 text-sm">
              No available collection copies matched this allocation mode.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-box border border-base-300">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-16">Qty</th>
                    <th>Deck card</th>
                    <th>Collection printing</th>
                    <th className="w-24">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {preview?.entries.map((entry, index) => (
                    <tr key={`${entry.deckCard.id}-${entry.item.id}-${index}`}>
                      <td className="font-black">{entry.quantity}</td>
                      <td>
                        <div className="font-semibold">{entry.deckCard.card?.name}</div>
                        <div className="text-xs text-base-content/60">
                          Wants {deckCardPrintingLabel(entry.deckCard)} ·{" "}
                          {titleize(entry.deckCard.finish || "nonfoil")}
                        </div>
                      </td>
                      <td>
                        <div className="font-semibold">
                          {collectionItemPrintingLabel(entry.item)}
                        </div>
                        <div className="text-xs text-base-content/60">
                          Owned {entry.item.quantity} · {titleize(entry.item.finish)}
                        </div>
                      </td>
                      <td>
                        <Badge tone={entry.exact ? "success" : "warning"}>
                          {entry.exact ? "Exact" : "Partial"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPending || !preview || preview.entries.length === 0}
              onClick={() => onConfirm(mode)}
            >
              {isPending ? "Allocating..." : "Allocate"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function bulkAllocationMode(value?: string | null): BulkAllocationMode {
  return value === "exact_printings" ? "exact_printings" : "matching_printings"
}

export function bulkAllocationModeLabel(mode: BulkAllocationMode) {
  return mode === "exact_printings" ? "Exact printings" : "Partial matches"
}
