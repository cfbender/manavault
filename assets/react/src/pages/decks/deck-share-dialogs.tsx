import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Clipboard, Upload } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { request } from "../../lib/graphql"
import type { DeckDetail, DeckSummary } from "./deck-types"
import {
  DeckExportTextDocument,
  EnsureDeckShareTokenDocument,
  ImportDecklistDocument,
} from "./queries"

export function ShareDeckDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckSummary | DeckDetail | null
  onOpenChange: (open: boolean) => void
  open?: boolean
}) {
  const queryClient = useQueryClient()
  const isOpen = open ?? Boolean(deck)
  const requestedDeckId = useRef<string | null>(null)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const ensureShare = useMutation({
    mutationFn: () => {
      if (!deck) throw new Error("Deck is required")
      return request(EnsureDeckShareTokenDocument, { id: deck.id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      if (deck) queryClient.invalidateQueries({ queryKey: ["deck", deck.id] })
    },
  })
  const generatedDeck = ensureShare.data?.ensureDeckShareToken || null
  const shareToken =
    generatedDeck && generatedDeck.id === deck?.id
      ? generatedDeck.shareToken || ""
      : deck?.shareToken || ""
  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/share/decks/${encodeURIComponent(shareToken)}`
      : ""
  const error = ensureShare.error instanceof Error ? ensureShare.error.message : null

  useEffect(() => {
    if (!isOpen) {
      requestedDeckId.current = null
      setCopyState("idle")
      return
    }

    if (!deck?.id || shareToken || requestedDeckId.current === deck.id) return

    requestedDeckId.current = deck.id
    ensureShare.mutate()
  }, [deck?.id, ensureShare, isOpen, shareToken])

  async function copyShareUrl() {
    if (!shareUrl) return

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopyState("copied")
    } catch {
      setCopyState("failed")
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true)
        else onOpenChange(false)
      }}
    >
      <DialogContent className="max-w-xl" labelledBy="share-deck-title">
        <DialogHeader>
          <div>
            <DialogTitle id="share-deck-title">Share deck</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deck?.name}</p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="space-y-4 p-5">
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Public link
            </span>
            <Input readOnly value={shareUrl || "Generating link..."} />
          </label>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          {copyState === "failed" ? (
            <p className="text-sm text-error">Could not copy from this browser context.</p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="button" disabled={!shareUrl} onClick={copyShareUrl}>
              <Clipboard className="h-4 w-4" />
              {copyState === "copied" ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ImportDecklistDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckDetail | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const queryClient = useQueryClient()
  const [text, setText] = useState("")
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    unresolved: string[]
    skippedPrintings: string[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importDecklist = useMutation({
    mutationFn: () => {
      if (!deck) throw new Error("Deck is required")
      return request(ImportDecklistDocument, { id: deck.id, text, replaceExisting })
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["deck", deck?.id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      setResult(data.importDecklist || null)
      setError(null)
      onOpenChange(false)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not import decklist"),
  })

  useEffect(() => {
    if (!open) {
      setText("")
      setResult(null)
      setReplaceExisting(false)
      setError(null)
    }
  }, [open])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setResult(null)

    if (!text.trim()) {
      setError("Paste a decklist to import")
      return
    }

    importDecklist.mutate()
  }

  function close() {
    if (importDecklist.isPending) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-3xl" labelledBy="import-decklist-title">
        <DialogHeader>
          <div>
            <DialogTitle id="import-decklist-title">Import decklist</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deck?.name}</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-4 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Decklist text
            </span>
            <textarea
              className="textarea textarea-bordered min-h-80 w-full bg-base-100 font-mono text-sm"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"Commander\n1 Sol Ring\n1 Arcane Signet\n\nSideboard\n2 Negate"}
              autoFocus
            />
          </label>

          <label className="flex items-start gap-3 rounded-box border border-warning/30 bg-warning/10 p-3 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-warning checkbox-sm mt-0.5"
              checked={replaceExisting}
              onChange={(event) => setReplaceExisting(event.target.checked)}
            />
            <span>
              <span className="block font-bold">Replace existing deck cards</span>
              <span className="text-base-content/65">
                Delete this deck's current cards before importing. Allocated cards are returned to
                their original locations.
              </span>
            </span>
          </label>

          {result ? (
            <div className="rounded-box border border-base-300 bg-base-100 p-4 text-sm">
              <div className="font-black">{result.imported} cards imported</div>
              {result.unresolved.length ? (
                <div className="mt-2 text-warning">Unresolved: {result.unresolved.join(", ")}</div>
              ) : null}
              {result.skippedPrintings.length ? (
                <div className="mt-2 text-base-content/65">
                  Skipped preferred printings: {result.skippedPrintings.join(", ")}
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={importDecklist.isPending}
            >
              Close
            </Button>
            <Button type="submit" disabled={importDecklist.isPending}>
              <Upload className="h-4 w-4" />
              {importDecklist.isPending ? "Importing..." : "Import decklist"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ExportDecklistDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckDetail | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const exportQuery = useQuery({
    queryKey: ["deck-export-text", deck?.id],
    queryFn: () => request(DeckExportTextDocument, { id: deck?.id || "" }),
    enabled: open && Boolean(deck?.id),
  })
  const exportText = exportQuery.data?.deckExportText || ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" labelledBy="export-decklist-title">
        <DialogHeader>
          <div>
            <DialogTitle id="export-decklist-title">Export decklist</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deck?.name}</p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="space-y-4 p-5">
          <textarea
            className="textarea textarea-bordered min-h-80 w-full bg-base-100 font-mono text-sm"
            readOnly
            value={exportQuery.isLoading ? "Exporting..." : exportText}
          />
          {exportQuery.error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {exportQuery.error instanceof Error
                ? exportQuery.error.message
                : "Could not export decklist"}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
