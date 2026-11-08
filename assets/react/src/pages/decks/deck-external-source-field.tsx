import { ExternalLink } from "lucide-react"
import { useEffect, useState } from "react"

import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import { Input } from "../../components/ui/input"
import { Switch } from "../../components/ui/switch"
import { formatDate } from "../settings/data"
import type { DeckDetail, DeckSummary } from "./deck-types"
import { externalSourceLabel, useDeckExternalSource } from "./use-deck-external-source"

type ExternalDeck = Pick<
  DeckSummary | DeckDetail,
  "id" | "status" | "externalSource" | "externalUrl" | "externalSyncedAt" | "externalSyncError"
>

/**
 * Edit-dialog section that links a deck to a Moxfield or Archidekt deck.
 * Pasting a URL does nothing on its own; turning the switch on (after a
 * confirmation) imports the external deck over this decklist and keeps it in
 * sync. Turning it off unlinks the deck and leaves the current cards in place.
 */
export function DeckExternalSourceField({
  deck,
  disabled = false,
  onPendingChange,
}: {
  deck: ExternalDeck
  disabled?: boolean
  onPendingChange?: (pending: boolean) => void
}) {
  const linked = Boolean(deck.externalSource)
  // The server refuses to link archived decks; unlinking still works.
  const archived = deck.status === "archived"
  const [url, setUrl] = useState(deck.externalUrl ?? "")
  const [confirm, setConfirm] = useState<"link" | "unlink" | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const { clearError, error, isLinking, isPending, isUnlinking, link, unlink } =
    useDeckExternalSource(deck.id)
  const sourceLabel = externalSourceLabel(deck.externalSource)
  const checked = isLinking || (linked && !isUnlinking)
  const shownError = localError || error

  useEffect(() => {
    onPendingChange?.(isPending)
  }, [isPending, onPendingChange])

  useEffect(() => {
    if (deck.externalUrl) setUrl(deck.externalUrl)
  }, [deck.externalUrl])

  function toggle(nextChecked: boolean) {
    setLocalError(null)
    clearError()

    if (!nextChecked) {
      setConfirm("unlink")
      return
    }

    if (!url.trim()) {
      setLocalError("Paste a Moxfield or Archidekt deck link first")
      return
    }

    setConfirm("link")
  }

  return (
    <section
      aria-labelledby="deck-external-source-heading"
      className="space-y-3 border-t border-base-300 pt-5"
    >
      <h3
        id="deck-external-source-heading"
        className="text-xs font-black uppercase tracking-[0.18em] text-base-content/80"
      >
        External deck
      </h3>

      <div className="flex min-h-11 items-center justify-between gap-4">
        <span>
          <span className="block text-sm font-bold">Link external deck</span>
          <span id="deck-external-source-help" className="block text-sm text-base-content/75">
            {linked
              ? `Mirrors ${sourceLabel} and syncs hourly. Card edits are disabled here.`
              : archived
                ? "Unarchive this deck before linking an external deck."
                : "Replace this decklist with a Moxfield or Archidekt deck and keep it in sync."}
          </span>
        </span>
        <Switch
          aria-label="Link external deck"
          aria-describedby="deck-external-source-help"
          checked={checked}
          onCheckedChange={toggle}
          disabled={disabled || isPending || (archived && !linked)}
          className="shrink-0"
        />
      </div>

      <label className="block space-y-2">
        <span className="sr-only">Moxfield or Archidekt URL</span>
        <Input
          aria-label="Moxfield or Archidekt URL"
          className="min-h-11"
          inputMode="url"
          placeholder="https://moxfield.com/decks/... or https://archidekt.com/decks/..."
          value={url}
          disabled={linked || archived || disabled || isPending}
          onChange={(event) => {
            setUrl(event.target.value)
            setLocalError(null)
          }}
        />
      </label>

      {linked ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/65">
          <span>
            {deck.externalSyncError
              ? `Last sync failed: ${deck.externalSyncError}`
              : deck.externalSyncedAt
                ? `Last synced ${formatDate(deck.externalSyncedAt)}`
                : "Not synced yet"}
          </span>
          {deck.externalUrl ? (
            <a
              className="link link-primary inline-flex items-center gap-1"
              href={deck.externalUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open in {sourceLabel}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </p>
      ) : null}

      {isLinking ? <p className="text-sm text-base-content/65">Importing deck...</p> : null}

      {shownError ? (
        <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          {shownError}
        </p>
      ) : null}

      <ConfirmDialog
        confirmLabel="Link and replace"
        destructive
        onConfirm={() => link(url.trim())}
        onOpenChange={(open) => !open && setConfirm(null)}
        open={confirm === "link"}
        title="Replace this decklist?"
      >
        The current cards are replaced with the external deck, which then syncs every hour. You can
        still allocate copies from your collection.
      </ConfirmDialog>

      <ConfirmDialog
        confirmLabel="Unlink"
        onConfirm={() => unlink()}
        onOpenChange={(open) => !open && setConfirm(null)}
        open={confirm === "unlink"}
        title={`Unlink from ${sourceLabel}?`}
      >
        The current cards stay in this deck, but it will stop syncing and become editable again.
      </ConfirmDialog>
    </section>
  )
}
