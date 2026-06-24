import { useQuery } from "@tanstack/react-query"
import { XCircle } from "lucide-react"
import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { EmptyState } from "../../components/card-image"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { DeckPlaytester } from "../../components/deck-playtester"
import { request } from "../../lib/graphql"
import { exportDecklistText } from "../../lib/deck-export"
import { createPlaytestState } from "../../lib/deck-playtest"
import {
  buylistPrintingLabel,
  buylistTotalPrice,
  formatUsdCents,
} from "./buylist-export"
import { BuylistMarketplaceActions } from "./buylist-marketplace-actions"
import { deckPlaytestCards } from "./deck-card-model"
import type { DeckCardEntry, DeckDetail } from "./deck-types"
import { DeckBuylistDocument } from "./queries"

const SHARED_BUYLIST_EXPORT_FORMAT = "text"
const SHARED_BUYLIST_PRINTING_MODE = "exact"

export function useSharedDeckBuylist(
  shareToken: string,
  includeBasicLands: boolean,
  enabled = true,
) {
  return useQuery({
    queryKey: ["shared-deck-buylist", shareToken, includeBasicLands],
    queryFn: () =>
      request(
        DeckBuylistDocument,
        {
          exportFormat: SHARED_BUYLIST_EXPORT_FORMAT,
          id: shareToken,
          includeBasicLands,
          printingMode: SHARED_BUYLIST_PRINTING_MODE,
        },
        { endpoint: "/share/graphql" },
      ),
    enabled: enabled && Boolean(shareToken),
  })
}

export function SharePlaytestOverlay({
  deck,
  deckCards,
  onClose,
}: {
  deck: DeckDetail
  deckCards: DeckCardEntry[]
  onClose: () => void
}) {
  const playtestCards = deckPlaytestCards(deckCards)
  const initialPlaytestState = createPlaytestState(playtestCards.library, playtestCards.command)

  return createPortal(
    <div className="fixed inset-0 z-[1200] bg-[#0d0e0c]">
      <DeckPlaytester
        closeSlot={
          <button
            type="button"
            className="btn btn-ghost btn-xs gap-1 text-base-content/60"
            onClick={onClose}
          >
            <XCircle className="h-3.5 w-3.5" />
            Close
          </button>
        }
        deckId={deck.id}
        deckName={deck.name}
        initialState={initialPlaytestState}
      />
    </div>,
    document.body,
  )
}

export function ShareDeckBuylistDialog({
  deck,
  onOpenChange,
  open,
  shareToken,
}: {
  deck: DeckDetail
  onOpenChange: (open: boolean) => void
  open: boolean
  shareToken: string
}) {
  const [includeBasicLands, setIncludeBasicLands] = useState(false)
  const buylistQuery = useSharedDeckBuylist(shareToken, includeBasicLands, open)
  const entries = buylistQuery.data?.deckBuylist || []
  const totalPrice = useMemo(() => buylistTotalPrice(entries), [entries])
  const totalQuantity = entries.reduce((total, entry) => total + entry.quantity, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-3rem)] max-w-4xl flex-col"
        labelledBy="shared-buylist-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="shared-buylist-title">Buy this deck</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deck.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-base-content/50">
                Estimated total
              </p>
              <p className="font-mono text-lg font-black">
                {buylistQuery.isLoading ? "Loading..." : formatUsdCents(totalPrice.totalCents)}
                {!buylistQuery.isLoading && totalPrice.unpricedQuantity > 0 ? (
                  <span className="ml-1 text-xs font-semibold text-base-content/55">
                    + {totalPrice.unpricedQuantity} unpriced
                  </span>
                ) : null}
              </p>
            </div>
            <DialogClose onClose={() => onOpenChange(false)} />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <label className="label cursor-pointer justify-start gap-2 rounded-btn border border-base-300 px-3 py-2">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={includeBasicLands}
              onChange={(event) => setIncludeBasicLands(event.target.checked)}
            />
            <span className="label-text text-sm">Include basic lands</span>
          </label>

          <BuylistMarketplaceActions entries={entries} />

          <div className="rounded-box border border-base-300 bg-base-200/60 px-4 py-3 text-sm text-base-content/70">
            {buylistQuery.isLoading
              ? "Loading buylist..."
              : `${totalQuantity} cards in the buy list. Marketplace links use card names; prices use preferred or cheapest known printings.`}
          </div>

          {buylistQuery.error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {buylistQuery.error instanceof Error
                ? buylistQuery.error.message
                : "Could not load buy list"}
            </p>
          ) : null}

          {!buylistQuery.isLoading && !entries.length ? (
            <EmptyState title="No cards in this buy list" />
          ) : null}

          {entries.length ? (
            <div className="max-h-[min(30rem,55dvh)] overflow-auto rounded-box border border-base-300">
              <table className="table table-sm">
                <thead className="sticky top-0 z-10 bg-base-200">
                  <tr>
                    <th className="w-16">Qty</th>
                    <th>Card</th>
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
                      <td className="whitespace-nowrap">{buylistPrintingLabel(entry)}</td>
                      <td className="text-right font-mono">{entry.totalPriceText || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function useSharedDecklistActions(deckName: string, deckCards: DeckCardEntry[]) {
  const [shareCopyState, setShareCopyState] = useState<"idle" | "copied" | "failed">("idle")

  async function copySharedDecklist() {
    try {
      await navigator.clipboard.writeText(exportDecklistText(deckCards))
      setShareCopyState("copied")
    } catch {
      setShareCopyState("failed")
    }
  }

  return {
    copySharedDecklist,
    downloadSharedDecklist: () => downloadDecklistText(deckName, deckCards),
    shareCopyState,
  }
}

function downloadDecklistText(deckName: string, deckCards: DeckCardEntry[]) {
  const blob = new Blob([exportDecklistText(deckCards)], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = `${deckName || "deck"}.txt`
  link.click()
  URL.revokeObjectURL(url)
}
