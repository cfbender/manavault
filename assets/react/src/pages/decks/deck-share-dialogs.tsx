import { useApolloClient, useMutation } from "@apollo/client/react"
import { Check, Clipboard, Download, Upload } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import { refetchActiveQueries } from "../../lib/apollo"
import {
  EXPORT_ZONES,
  EXPORT_ZONE_LABELS,
  downloadTextFile,
  exportDecklistText,
} from "../../lib/deck-export"
import { cn, pluralize, titleize } from "../../lib/utils"
import { BuylistOptionCheckbox } from "./buylist-option-checkbox"
import type { DeckDetail, DeckSummary, DeckZone } from "./deck-types"
import { ADD_CARD_ZONES } from "./deck-types"
import { EnsureDeckShareTokenDocument, ImportDecklistDocument } from "./queries"

export function ShareDeckDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckSummary | DeckDetail | null
  onOpenChange: (open: boolean) => void
  open?: boolean
}) {
  const client = useApolloClient()
  const { showToast } = useToast()
  const isOpen = open ?? Boolean(deck)
  const shareTokenDeckIdRef = useRef<string | null>(null)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const [ensureShareToken, ensureShare] = useMutation(EnsureDeckShareTokenDocument)
  const generatedDeck = ensureShare.data?.ensureDeckShareToken?.deck || null
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
      shareTokenDeckIdRef.current = null
      setCopyState("idle")
      return
    }

    if (!deck?.id || shareToken || shareTokenDeckIdRef.current === deck.id) return

    shareTokenDeckIdRef.current = deck.id
    void ensureShareToken({
      variables: { id: deck.id },
      onCompleted: () => void refetchActiveQueries(client),
    })
  }, [client, deck?.id, ensureShareToken, isOpen, shareToken])

  async function copyShareUrl() {
    if (!shareUrl) return

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopyState("copied")
      showToast("Deck link copied")
      onOpenChange(false)
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
  const client = useApolloClient()
  const { showToast } = useToast()
  const [text, setText] = useState("")
  const [zone, setZone] = useState<DeckZone | "">("")
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    unresolved: string[]
    skippedPrintings: string[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importDecklistMutation, importDecklistResult] = useMutation(ImportDecklistDocument)
  const importDecklist = {
    ...importDecklistResult,
    isPending: importDecklistResult.loading,
    mutate: () => {
      if (!deck) {
        setError("Deck is required")
        return
      }

      void importDecklistMutation({
        variables: { id: deck.id, text, replaceExisting, zone: zone || null },
        onCompleted: (data) => {
          const importResult = data.importDecklist?.importResult || null

          void refetchActiveQueries(client)
          setResult(importResult)
          showToast(`${pluralize(importResult?.imported ?? 0, "card")} imported`)
          setError(null)
          onOpenChange(false)
        },
        onError: (error) =>
          setError(error instanceof Error ? error.message : "Could not import decklist"),
      })
    },
  }

  useEffect(() => {
    if (!open) {
      setText("")
      setZone("")
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

          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Import into
            </span>
            <select
              className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={zone}
              onChange={(event) => setZone(event.target.value as DeckZone | "")}
            >
              <option value="">Zones from decklist</option>
              {ADD_CARD_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {titleize(zone)}
                </option>
              ))}
            </select>
            <span className="block text-xs text-base-content/60">
              Pick a zone to send every imported card there, ignoring section headings in the text.
            </span>
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
  const { showToast } = useToast()
  const resetTimerRef = useRef<number | null>(null)
  const deckCards = useMemo(() => deck?.deckCards ?? [], [deck])
  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const deckCard of deckCards) {
      if (!deckCard.zone) continue
      counts[deckCard.zone] = (counts[deckCard.zone] || 0) + Math.max(deckCard.quantity || 0, 0)
    }
    return counts
  }, [deckCards])
  const defaultZones =
    deck?.format === "commander" && zoneCounts.commander > 0
      ? ["commander", "mainboard"]
      : ["mainboard"]
  const defaultZonesRef = useRef(defaultZones)
  defaultZonesRef.current = defaultZones
  const [zones, setZones] = useState<string[]>(defaultZones)
  const [zoneHeaders, setZoneHeaders] = useState(false)
  const [includePrinting, setIncludePrinting] = useState(true)
  const [includeFinish, setIncludeFinish] = useState(true)
  const [quantityStyle, setQuantityStyle] = useState<"1x" | "1">("1x")
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")

  const exportText = useMemo(
    () =>
      exportDecklistText(deckCards, {
        zones,
        zoneHeaders,
        includePrinting,
        includeFinish,
        quantityStyle,
      }),
    [deckCards, zones, zoneHeaders, includePrinting, includeFinish, quantityStyle],
  )

  useEffect(() => {
    if (!open) return
    setZones(defaultZonesRef.current)
    setZoneHeaders(false)
    setIncludePrinting(true)
    setIncludeFinish(true)
    setQuantityStyle("1x")
    setCopyState("idle")
  }, [open])

  useEffect(
    () => () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    },
    [],
  )

  function toggleZone(zone: string) {
    setZones((current) =>
      current.includes(zone) ? current.filter((entry) => entry !== zone) : [...current, zone],
    )
  }

  async function copyDecklist() {
    if (!exportText) return

    try {
      await navigator.clipboard.writeText(exportText)
      setCopyState("copied")
      showToast("Decklist copied")
    } catch {
      setCopyState("failed")
    }

    // Revert the transient status so the button label doesn't stay "Copied".
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => setCopyState("idle"), 2000)
  }

  function downloadDecklist() {
    if (!exportText) return
    downloadTextFile(`${deck?.name || "deck"}.txt`, exportText)
  }

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
          <div className="space-y-2">
            <span className="block text-xs font-black uppercase tracking-[0.18em] text-accent">
              Zones
            </span>
            <div className="flex flex-wrap gap-2">
              {EXPORT_ZONES.map((zone) => {
                const count = zoneCounts[zone] || 0
                const selected = zones.includes(zone)

                return (
                  <button
                    key={zone}
                    type="button"
                    disabled={!count}
                    aria-pressed={selected}
                    onClick={() => toggleZone(zone)}
                    className={cn(
                      "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-bold transition-colors",
                      selected
                        ? "border-primary bg-primary text-primary-content"
                        : "border-base-300 bg-base-100/60 hover:border-primary/50",
                      !count && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {EXPORT_ZONE_LABELS[zone]}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-black",
                        selected ? "bg-primary-content/20" : "bg-base-300/70 text-base-content/70",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-black uppercase tracking-[0.18em] text-accent">
              Options
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <BuylistOptionCheckbox
                checked={zoneHeaders}
                label="Zone headers"
                onChange={setZoneHeaders}
              />
              <BuylistOptionCheckbox
                checked={includePrinting}
                label="Printing (SET) #"
                onChange={setIncludePrinting}
              />
              <BuylistOptionCheckbox
                checked={includeFinish}
                label="Finish markers"
                onChange={setIncludeFinish}
              />
              <div className="inline-flex h-8 items-center gap-0.5 rounded-full border border-base-300 bg-base-100/60 p-0.5">
                {(["1x", "1"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    aria-pressed={quantityStyle === style}
                    onClick={() => setQuantityStyle(style)}
                    className={cn(
                      "h-7 rounded-full px-2.5 text-xs font-bold transition-colors",
                      quantityStyle === style
                        ? "bg-primary text-primary-content"
                        : "text-base-content/70 hover:text-base-content",
                    )}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-black uppercase tracking-[0.18em] text-accent">
              Preview
            </span>
            <pre className="max-h-80 min-h-60 overflow-auto whitespace-pre-wrap rounded-box border border-base-300 bg-base-100 p-3 font-mono text-sm">
              {exportText || "No cards in the selected zones."}
            </pre>
          </div>

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!exportText}
              onClick={downloadDecklist}
            >
              <Download className="h-4 w-4" />
              Download .txt
            </Button>
            <Button type="button" disabled={!exportText} onClick={copyDecklist}>
              {copyState === "copied" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Clipboard className="h-4 w-4" />
              )}
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Copy failed"
                  : "Copy decklist"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
