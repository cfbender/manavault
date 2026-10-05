import { useApolloClient, useQuery } from "@apollo/client/react"
import { Check, Search } from "lucide-react"
import { useEffect, useState } from "react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { cn } from "../../lib/utils"
import { printingOption, ScannerCardSearchDocument, ScannerPrintingsDocument } from "./documents"
import { choosePrinting, rankPrintings, type PrintingOption } from "./printing-choice"
import { formatCents, type ScanEntry } from "./scan-list"
import type { ScanSettings } from "./scan-settings"

/**
 * Every printing of the scanned card, same artwork first. Identical art cannot tell reprints
 * apart, so this is where the exact set, number and language get corrected.
 */
export function PrintingSheet({
  entry,
  settings,
  onSelect,
  onReplace,
  onClose,
}: {
  entry: ScanEntry | null
  settings: ScanSettings
  onSelect: (printing: PrintingOption) => void
  /** "Wrong card?": the entry becomes this printing of another card. */
  onReplace: (printing: PrintingOption) => void
  onClose: () => void
}) {
  const [searching, setSearching] = useState(false)
  const entryId = entry?.id
  useEffect(() => setSearching(false), [entryId])

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      {entry ? (
        <DialogContent className="scan-sheet sm:max-w-xl" labelledBy="scan-printing-title">
          <DialogHeader>
            <div className="min-w-0">
              <DialogTitle id="scan-printing-title">Choose printing</DialogTitle>
              <p className="mt-1 truncate text-sm text-base-content/70">{entry.name}</p>
            </div>
            <DialogClose onClose={onClose} />
          </DialogHeader>
          {searching ? (
            <CardNameSearch
              settings={settings}
              onCancel={() => setSearching(false)}
              onChoose={(printing) => {
                onReplace(printing)
                setSearching(false)
              }}
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-base-300 px-5 py-2.5 text-sm">
                <span className="text-base-content/70">Not {entry.name}?</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSearching(true)}>
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Wrong card?
                </Button>
              </div>
              <PrintingList entry={entry} settings={settings} onSelect={onSelect} />
            </>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

function PrintingList({
  entry,
  settings,
  onSelect,
}: {
  entry: ScanEntry
  settings: ScanSettings
  onSelect: (printing: PrintingOption) => void
}) {
  const { data, loading, error } = useQuery(ScannerPrintingsDocument, {
    variables: { scryfallId: entry.cardKey, illustrationId: entry.illustrationId },
  })
  const options = rankPrintings(
    (data?.scannerPrintings ?? []).map(printingOption),
    { illustrationId: entry.illustrationId },
    { lockedSets: settings.lockedSets, ignorePromos: false },
  )

  if (loading && options.length === 0) {
    return <p className="px-5 py-6 text-sm text-base-content/70">Loading printings…</p>
  }
  if (error) {
    return <p className="px-5 py-6 text-sm text-error">Could not load printings: {error.message}</p>
  }
  if (options.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-base-content/70">
        This card is not in the catalog yet. It will import as the recognized printing.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-base-300 overflow-y-auto">
      {options.map((option) => {
        const selected = option.scryfallId === entry.scryfallId
        const sameArt =
          Boolean(entry.illustrationId) && option.illustrationId === entry.illustrationId
        const price = option.prices[entry.finish] ?? option.prices.nonfoil ?? option.prices.foil
        return (
          <li key={option.scryfallId}>
            <button
              type="button"
              onClick={() => onSelect(option)}
              aria-pressed={selected}
              className={cn(
                "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-base-200 focus-visible:bg-base-200 focus-visible:outline-none",
                selected && "bg-primary/10",
              )}
            >
              {option.imageUrl ? (
                <img
                  src={option.imageUrl}
                  crossOrigin="anonymous"
                  alt=""
                  loading="lazy"
                  className="h-14 w-10 shrink-0 rounded-[3px] object-cover"
                />
              ) : (
                <span className="h-14 w-10 shrink-0 rounded-[3px] bg-base-300" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{option.setName ?? option.setCode}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-base-content/70">
                  <span className="font-mono">
                    {option.setCode.toUpperCase()} #{option.collectorNumber} ·{" "}
                    {option.lang.toUpperCase()}
                  </span>
                  {option.releasedAt ? <span>{option.releasedAt.slice(0, 4)}</span> : null}
                  {sameArt ? <span className="badge badge-outline badge-sm">Same art</span> : null}
                  {option.promo ? (
                    <span className="badge badge-outline badge-sm">Promo</span>
                  ) : null}
                  {option.ownedCount > 0 ? (
                    <span className="badge badge-success badge-outline badge-sm">
                      Own {option.ownedCount}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="shrink-0 font-mono text-sm font-bold text-warning">
                {formatCents(price ?? null)}
              </span>
              {selected ? (
                <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Selected" />
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Finds a card by name and hands back its default printing (locked sets, owned, newest…). */
export function CardNameSearch({
  settings,
  onChoose,
  onCancel,
}: {
  settings: ScanSettings
  onChoose: (printing: PrintingOption) => void
  onCancel: () => void
}) {
  const apollo = useApolloClient()
  const [text, setText] = useState("")
  const [query, setQuery] = useState("")
  const [choosing, setChoosing] = useState<string | null>(null)
  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(text.trim()), 250)
    return () => window.clearTimeout(timeout)
  }, [text])
  const { data, loading } = useQuery(ScannerCardSearchDocument, {
    variables: { q: query, tokens: settings.tokenMode ? "ONLY" : "INCLUDE" },
    skip: query.length < 2,
  })
  const cards = (data?.cards.edges ?? []).flatMap((edge) => (edge?.node ? [edge.node] : []))

  async function choose(scryfallId: string) {
    setChoosing(scryfallId)
    try {
      const result = await apollo.query({
        query: ScannerPrintingsDocument,
        variables: { scryfallId, illustrationId: null },
      })
      const printing = choosePrinting(
        (result.data?.scannerPrintings ?? []).map(printingOption),
        {},
        settings,
      )
      if (printing) onChoose(printing)
    } finally {
      setChoosing(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-base-300 px-5 py-3">
        <Input
          autoFocus
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={settings.tokenMode ? "Search the token by name" : "Search the card by name"}
          aria-label={settings.tokenMode ? "Search the token by name" : "Search the card by name"}
        />
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <ul className="divide-y divide-base-300 overflow-y-auto">
        {query.length >= 2 && !loading && cards.length === 0 ? (
          <li className="px-5 py-6 text-sm text-base-content/70">No card matches “{query}”.</li>
        ) : null}
        {cards.map((card) => {
          const printing = card.primaryPrinting
          if (!printing) return null
          return (
            <li key={card.id}>
              <button
                type="button"
                disabled={choosing !== null}
                onClick={() => void choose(printing.scryfallId)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-base-200 focus-visible:bg-base-200 focus-visible:outline-none disabled:opacity-60"
              >
                {printing.imageUrl ? (
                  <img
                    src={printing.imageUrl}
                    crossOrigin="anonymous"
                    alt=""
                    loading="lazy"
                    className="h-14 w-10 shrink-0 rounded-[3px] object-cover"
                  />
                ) : (
                  <span className="h-14 w-10 shrink-0 rounded-[3px] bg-base-300" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{card.name}</span>
                  <span className="block truncate text-xs text-base-content/70">
                    {card.typeLine}
                  </span>
                </span>
                {choosing === printing.scryfallId ? (
                  <span className="text-xs text-base-content/60">Loading…</span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
