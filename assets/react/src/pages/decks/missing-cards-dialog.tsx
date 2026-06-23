import { useQuery } from "@tanstack/react-query"
import { Clipboard, Database, ShoppingCart, Store } from "lucide-react"
import { useEffect, useState } from "react"
import { EmptyState } from "../../components/card-image"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { request } from "../../lib/graphql"
import {
  buylistPrintingLabel,
  buylistReasonTone,
  buylistSummary,
  manaPoolBuylistUrl,
  tcgplayerBuylistUrl,
  vendorBuylistPipeText,
} from "./buylist-export"
import type { BuylistExportFormat, BuylistPrintingMode, DeckDetail } from "./deck-types"
import { DeckBuylistDocument } from "./queries"

export function MissingCardsDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckDetail | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [printingMode, setPrintingMode] = useState<BuylistPrintingMode>("none")
  const [exportFormat, setExportFormat] = useState<BuylistExportFormat>("text")
  const [includeBasicLands, setIncludeBasicLands] = useState(false)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const buylistQuery = useQuery({
    queryKey: ["deck-buylist", deck?.id, printingMode, exportFormat, includeBasicLands],
    queryFn: () =>
      request(DeckBuylistDocument, {
        id: deck?.id || "",
        printingMode,
        exportFormat,
        includeBasicLands,
      }),
    enabled: open && Boolean(deck?.id),
  })
  const entries = buylistQuery.data?.deckBuylist || []
  const exportText = buylistQuery.data?.deckBuylistExport || ""
  const hasBuylistEntries = entries.length > 0

  useEffect(() => {
    if (!open) setCopyState("idle")
  }, [open])

  async function copyExportText() {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopyState("copied")
    } catch {
      setCopyState("failed")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-3rem)] max-w-5xl flex-col"
        labelledBy="missing-cards-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="missing-cards-title">Missing cards</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deck?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!exportText}
              onClick={copyExportText}
            >
              <Clipboard className="h-4 w-4" />
              {copyState === "copied" ? "Copied" : "Copy"}
            </Button>
            <DialogClose onClose={() => onOpenChange(false)} />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="form-control">
              <span className="label-text mb-1 text-xs font-semibold uppercase text-base-content/60">
                Printing
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={printingMode}
                onChange={(event) => {
                  setPrintingMode(event.target.value as BuylistPrintingMode)
                  event.currentTarget.blur()
                }}
              >
                <option value="none">Any printing</option>
                <option value="exact">Exact preferred printing</option>
                <option value="cheapest">Cheapest known printing</option>
              </select>
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-xs font-semibold uppercase text-base-content/60">
                Export
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={exportFormat}
                onChange={(event) => {
                  setExportFormat(event.target.value as BuylistExportFormat)
                  event.currentTarget.blur()
                }}
              >
                <option value="text">Plain text</option>
                <option value="csv">CSV</option>
              </select>
            </label>

            <label className="label cursor-pointer justify-start gap-2 self-end rounded-btn border border-base-300 px-3 py-2">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={includeBasicLands}
                onChange={(event) => setIncludeBasicLands(event.target.checked)}
              />
              <span className="label-text text-sm">Include basic lands</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form
              action="https://www.cardkingdom.com/builder"
              method="post"
              target="_blank"
              className="inline-flex"
            >
              <input type="hidden" name="c" value={vendorBuylistPipeText(entries)} />
              <input type="hidden" name="partner" value="manavault" />
              <input type="hidden" name="po_origin" value="1" />
              <input type="hidden" name="partner_args" value="manavault,buylist" />
              <Button type="submit" variant="outline" size="sm" disabled={!hasBuylistEntries}>
                <Store className="h-4 w-4" />
                Card Kingdom
              </Button>
            </form>

            {hasBuylistEntries ? (
              <Button asChild variant="outline" size="sm">
                <a href={manaPoolBuylistUrl(entries)} target="_blank" rel="noreferrer">
                  <Database className="h-4 w-4" />
                  Mana Pool
                </a>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled>
                <Database className="h-4 w-4" />
                Mana Pool
              </Button>
            )}

            {hasBuylistEntries ? (
              <Button asChild variant="outline" size="sm">
                <a href={tcgplayerBuylistUrl(entries)} target="_blank" rel="noreferrer">
                  <ShoppingCart className="h-4 w-4" />
                  TCGplayer
                </a>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled>
                <ShoppingCart className="h-4 w-4" />
                TCGplayer
              </Button>
            )}
          </div>

          <div className="rounded-box border border-base-300 bg-base-200/60 px-4 py-3 text-sm text-base-content/70">
            {buylistQuery.isLoading ? "Loading buylist..." : buylistSummary(entries)}
          </div>

          {buylistQuery.error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {buylistQuery.error instanceof Error
                ? buylistQuery.error.message
                : "Could not load missing cards"}
            </p>
          ) : null}

          {!buylistQuery.isLoading && !entries.length ? (
            <EmptyState title="No missing or unavailable cards for this deck" />
          ) : null}

          {entries.length ? (
            <div className="max-h-[min(28rem,45dvh)] overflow-auto rounded-box border border-base-300">
              <table className="table table-sm">
                <thead className="sticky top-0 z-10 bg-base-200">
                  <tr>
                    <th className="w-16">Qty</th>
                    <th>Card</th>
                    <th>Reason</th>
                    <th>Printing</th>
                    <th className="text-right">Est.</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={`${entry.cardName}-${entry.setCode || "any"}-${
                        entry.collectorNumber || ""
                      }`}
                    >
                      <td className="font-black">{entry.quantity}</td>
                      <td>{entry.cardName}</td>
                      <td>
                        <Badge tone={buylistReasonTone(entry)}>{entry.reason}</Badge>
                      </td>
                      <td className="whitespace-nowrap">{buylistPrintingLabel(entry)}</td>
                      <td className="text-right font-mono">{entry.totalPriceText || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <textarea
            className="textarea textarea-bordered min-h-48 w-full bg-base-100 font-mono text-xs"
            readOnly
            value={buylistQuery.isLoading ? "Exporting..." : exportText}
          />
          {copyState === "failed" ? (
            <p className="text-sm text-error">Could not copy from this browser context.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
