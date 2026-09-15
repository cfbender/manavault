import { useQuery } from "@apollo/client/react"
import { Clipboard } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import { Textarea } from "../../components/ui/textarea"
import { useToast } from "../../components/ui/toast"
import { buylistPrintingLabel, buylistReasonTone, buylistSummary } from "./buylist-export"
import { BuylistOptionCheckbox } from "./buylist-option-checkbox"
import { BuylistMarketplaceActions } from "./buylist-marketplace-actions"
import type { BuylistExportFormat, BuylistPrintingMode, DeckDetail } from "./deck-types"
import { deckZoneMissing } from "./deck-readiness"
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
  const { showToast } = useToast()
  const [printingMode, setPrintingMode] = useState<BuylistPrintingMode>("none")
  const [exportFormat, setExportFormat] = useState<BuylistExportFormat>("text")
  const [includeBasicLands, setIncludeBasicLands] = useState(false)
  const [includeConsidering, setIncludeConsidering] = useState(false)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const buylistQuery = useQuery(DeckBuylistDocument, {
    variables: {
      id: deck?.id || "",
      printingMode,
      exportFormat,
      assumeNoOwned: false,
      includeBasicLands,
      includeConsidering,
    },
    skip: !open || !deck?.id,
  })
  const entries = buylistQuery.data?.deckBuylist || []
  const exportText = buylistQuery.data?.deckBuylistExport || ""

  useEffect(() => {
    if (!open) {
      setCopyState("idle")
      return
    }

    // When the mainboard is fully sourced, missing cards live only in the
    // considering pile, so pre-select it when it still needs buying.
    const missing = deckZoneMissing(deck?.deckCards || [])
    const mainboardReady = !missing.mainboard
    setIncludeConsidering(mainboardReady && missing.considering)
  }, [open, deck])

  async function copyExportText() {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopyState("copied")
      showToast("Missing cards copied")
      onOpenChange(false)
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
          <div className="grid gap-3 md:grid-cols-2">
            <label className="form-control">
              <span className="label-text mb-1 text-xs font-semibold uppercase text-base-content/60">
                Printing
              </span>
              <Select
                value={printingMode}
                onValueChange={(value) => setPrintingMode(value as BuylistPrintingMode)}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any printing</SelectItem>
                  <SelectItem value="exact">Exact preferred printing</SelectItem>
                  <SelectItem value="cheapest">Cheapest known printing</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-xs font-semibold uppercase text-base-content/60">
                Export
              </span>
              <Select
                value={exportFormat}
                onValueChange={(value) => setExportFormat(value as BuylistExportFormat)}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Plain text</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <BuylistOptionCheckbox
              checked={includeBasicLands}
              label="Include basic lands"
              onChange={setIncludeBasicLands}
            />
            <BuylistOptionCheckbox
              checked={includeConsidering}
              label="Include considering"
              onChange={setIncludeConsidering}
            />
          </div>

          <BuylistMarketplaceActions entries={entries} />

          <div className="rounded-box border border-base-300 bg-base-200/60 px-4 py-3 text-sm text-base-content/70">
            {buylistQuery.loading ? "Loading buylist..." : buylistSummary(entries)}
          </div>

          {buylistQuery.error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {buylistQuery.error instanceof Error
                ? buylistQuery.error.message
                : "Could not load missing cards"}
            </p>
          ) : null}

          {!buylistQuery.loading && !entries.length ? (
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
                    <th className="text-right">Est. / card</th>
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
                      <td className="whitespace-nowrap text-right font-mono">
                        {entry.unitPriceText ? (
                          <>
                            {entry.unitPriceText}
                            {entry.quantity > 1 ? (
                              <span className="ml-1 text-xs text-base-content/55">
                                ×{entry.quantity} = {entry.totalPriceText}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <Textarea
            className="min-h-48 bg-base-100 font-mono text-xs"
            readOnly
            value={buylistQuery.loading ? "Exporting..." : exportText}
          />
          {copyState === "failed" ? (
            <p className="text-sm text-error">Could not copy from this browser context.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
