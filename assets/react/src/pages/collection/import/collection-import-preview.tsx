import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"
import { pluralize } from "../../../lib/utils"
import { centsToCurrencyInput, parseCurrencyInputCents, printingSetLabel } from "../form-helpers"
import {
  importedCardQuantity,
  importStatusLabel,
  importStatusTone,
  totalSpendPerCardCents,
} from "../import-export-helpers"
import type {
  CollectionImportCandidate,
  CollectionImportPreview as ImportPreview,
  CollectionImportPurchaseMode,
} from "../types"

export function CollectionImportPreview({
  preview,
  purchaseMode,
  purchasePrice,
  selectCandidate,
}: {
  preview: ImportPreview
  purchaseMode: CollectionImportPurchaseMode
  purchasePrice: string
  selectCandidate: (rowNumber: number, candidate: CollectionImportCandidate) => void
}) {
  return (
    <div className="space-y-3">
      {purchaseMode === "total_spend" ? (
        <ImportSpendSummary preview={preview} totalSpend={purchasePrice} />
      ) : null}
      <div className="stats stats-vertical w-full border border-base-300 bg-base-100 shadow-sm sm:stats-horizontal">
        <Stat label="Rows" value={preview.total} />
        <Stat className="text-success" label="Exact" value={preview.exact} />
        <Stat
          className="text-warning"
          label="Needs review"
          value={preview.ambiguous + preview.unresolved}
        />
      </div>

      <div className="max-h-80 overflow-y-auto rounded-box border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Row</th>
              <th>Status</th>
              <th>Card</th>
              <th>Qty</th>
              <th>Finish</th>
              <th>Purchase</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.rowNumber}>
                <td>{row.rowNumber}</td>
                <td>
                  <Badge tone={importStatusTone(row.status)}>{importStatusLabel(row.status)}</Badge>
                </td>
                <td>{row.printing?.card?.name || row.attrs.name || "Unknown card"}</td>
                <td>{row.attrs.quantity}</td>
                <td>{row.attrs.finish}</td>
                <td>{importPurchasePriceText(row.attrs.purchasePriceCents)}</td>
                <td>
                  {row.status === "ambiguous" ? (
                    <div className="flex flex-wrap gap-1">
                      {row.candidates.map((candidate) => (
                        <Button
                          key={candidate.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => selectCandidate(row.rowNumber, candidate)}
                        >
                          {printingSetLabel({
                            collectorNumber: candidate.collectorNumber,
                            rarity: candidate.rarity,
                            id: candidate.id,
                            scryfallId: candidate.scryfallId,
                            setCode: candidate.setCode,
                            setName: candidate.setName,
                          })}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-base-content/45">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ className, label, value }: { className?: string; label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-title">{label}</div>
      <div className={`stat-value text-2xl ${className || ""}`}>{value}</div>
    </div>
  )
}

function ImportSpendSummary({
  preview,
  totalSpend,
}: {
  preview: ImportPreview
  totalSpend: string
}) {
  const totalSpendCents = parseCurrencyInputCents(totalSpend)
  if (totalSpendCents == null) return null
  const cardQuantity = importedCardQuantity(preview.rows)
  const purchasePriceCents = totalSpendPerCardCents(totalSpendCents, cardQuantity)

  if (purchasePriceCents === null) {
    return (
      <p className="rounded-box border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
        No exact cards are ready to import, so the total spend cannot be divided yet.
      </p>
    )
  }

  return (
    <div className="rounded-box border border-base-300 bg-base-100 px-4 py-3">
      <p className="text-sm font-bold">Purchase price calculated</p>
      <p className="mt-1 font-mono text-sm tabular-nums text-base-content/70">
        {importPurchasePriceText(totalSpendCents)} ÷ {pluralize(cardQuantity, "card")} ={" "}
        <strong className="text-base-content">
          {importPurchasePriceText(purchasePriceCents)} per card
        </strong>
      </p>
    </div>
  )
}

function importPurchasePriceText(cents?: number | null) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "-"
  return `$${centsToCurrencyInput(cents)}`
}
