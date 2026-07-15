import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import type { DeckDetailOverlay } from "./deck-detail-overlay"
import { DECK_DETAIL_SHORTCUTS } from "./use-deck-detail-shortcuts"

export function DeckDetailShortcutsOverlay({
  onClose,
  overlay,
}: {
  onClose: () => void
  overlay: DeckDetailOverlay
}) {
  if (overlay.kind !== "shortcuts") return null

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent labelledBy="deck-shortcuts-title" className="max-w-md">
        <DialogHeader>
          <DialogTitle id="deck-shortcuts-title">Keyboard shortcuts</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 p-1 text-sm">
          {DECK_DETAIL_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="contents">
              <dt>
                <kbd className="kbd kbd-sm">{shortcut.keys}</kbd>
              </dt>
              <dd className="self-center text-base-content/80">{shortcut.label}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
