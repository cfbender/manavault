import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { TokenBackFaceOptions, useTokenBackOptions } from "../../components/token-back-face-options"
import type { ScanBackFace, ScanEntry } from "./scan-list"

/**
 * "What is on the back?": a scanned single-faced token may be printed with another token
 * on its reverse (Commander precons do this). Scryfall only knows the front, so the user
 * picks the back from the tokens known to share a card with it (falling back to the rest
 * of the set), or says it is single-sided.
 */
export function TokenBackSheet({
  entry,
  onPick,
  onClose,
}: {
  entry: ScanEntry | null
  onPick: (back: ScanBackFace | null) => void
  onClose: () => void
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      {entry ? (
        <DialogContent className="scan-sheet sm:max-w-2xl" labelledBy="scan-token-back-title">
          <DialogHeader>
            <div className="min-w-0">
              <DialogTitle id="scan-token-back-title">What is on the back?</DialogTitle>
              <p className="mt-1 truncate text-sm text-base-content/70">
                {entry.name} · {entry.setCode.toUpperCase()} #{entry.collectorNumber}
              </p>
            </div>
            <DialogClose onClose={onClose} />
          </DialogHeader>
          <BackFaceGrid entry={entry} onPick={onPick} />
          <div className="flex items-center justify-between gap-3 border-t border-base-300 px-5 py-3 pb-[calc(0.75rem_+_var(--safe-bottom))]">
            <p className="text-sm text-base-content/70">
              Pick the other token on this card, if there is one.
            </p>
            <Button type="button" variant="outline" onClick={() => onPick(null)}>
              Single-sided
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

function BackFaceGrid({
  entry,
  onPick,
}: {
  entry: ScanEntry
  onPick: (back: ScanBackFace) => void
}) {
  const { known, sameSet, loading, error, isEmpty } = useTokenBackOptions(entry.scryfallId)

  if (loading && isEmpty) {
    return <p className="px-5 py-6 text-sm text-base-content/70">Loading tokens…</p>
  }
  if (error) {
    return <p className="px-5 py-6 text-sm text-error">Could not load tokens: {error.message}</p>
  }
  if (isEmpty) {
    return (
      <p className="px-5 py-6 text-sm text-base-content/70">
        No other tokens from {entry.setCode.toUpperCase()} are in the catalog.
      </p>
    )
  }

  return (
    <TokenBackFaceOptions
      className="overflow-y-auto px-5 py-4"
      known={known}
      sameSet={sameSet}
      setCode={entry.setCode}
      selectedScryfallId={entry.back?.scryfallId}
      onPick={(option) =>
        onPick({
          scryfallId: option.scryfallId,
          name: option.card?.name ?? "Token",
          imageUrl: option.imageUrl ?? null,
        })
      }
    />
  )
}
