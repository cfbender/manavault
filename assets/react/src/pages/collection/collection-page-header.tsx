import { Boxes, Download, MoreVertical, Plus, Tags, Upload, WandSparkles } from "lucide-react"
import { PageHeader } from "../../components/app-shell"
import { Button } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import { CollectionTabButton } from "./sort-controls"
import type { CollectionTab, CollectionValueSummary } from "./types"
import { collectionValueGainClass } from "./value-summary"

type CollectionPageHeaderProps = {
  activeTab: CollectionTab
  collectionItemCount: number
  locationCount: number
  valueSummary?: CollectionValueSummary | null
  onAddItem: () => void
  autoSortDisabled?: boolean
  autoSortPending?: boolean
  onAddLocation: () => void
  onImport: () => void
  onExportCsv: () => void
  onSellCards: () => void
  onAutoSort: () => void
  onSelectTab: (tab: CollectionTab) => void
}

export function CollectionPageHeader({
  activeTab,
  autoSortDisabled = false,
  autoSortPending = false,
  collectionItemCount,
  locationCount,
  valueSummary,
  onAddItem,
  onAddLocation,
  onAutoSort,
  onImport,
  onExportCsv,
  onSellCards,
  onSelectTab,
}: CollectionPageHeaderProps) {
  return (
    <>
      <PageHeader
        title="Collection"
        eyebrow="ManaVault Inventory"
        description="Your boxes, binders, lists, and owned printings."
        bottomActions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={autoSortDisabled || autoSortPending}
              onClick={onAutoSort}
            >
              <WandSparkles className="h-4 w-4" />
              {autoSortPending ? "Previewing..." : "Preview auto-sort"}
            </Button>
            <Button type="button" onClick={onAddItem}>
              <Plus className="h-4 w-4" />
              Add card
            </Button>
          </div>
        }
        actions={
          <div className="dropdown dropdown-end absolute right-3 top-3 z-[80]">
            <button
              type="button"
              className="btn btn-circle btn-xs border-0 bg-neutral/85 text-neutral-content shadow backdrop-blur transition hover:bg-neutral"
              tabIndex={0}
              aria-label="Collection actions"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            <ul
              tabIndex={0}
              className="menu dropdown-content z-50 mt-2 w-52 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl"
            >
              <li>
                <button type="button" onClick={onAddLocation}>
                  <Boxes className="h-4 w-4" />
                  Add location
                </button>
              </li>
              <li>
                <button type="button" onClick={onImport}>
                  <Upload className="h-4 w-4" />
                  Import CSV/TXT
                </button>
              </li>
              <li>
                <button type="button" onClick={onSellCards}>
                  <Tags className="h-4 w-4" />
                  Sell cards
                </button>
              </li>
              <li>
                <button type="button" onClick={onExportCsv}>
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </li>
            </ul>
          </div>
        }
      />

      {valueSummary ? <CollectionValueSummaryCard valueSummary={valueSummary} /> : null}

      <div
        className="mb-7 flex flex-wrap gap-2 border-b border-base-300"
        role="tablist"
        aria-label="Collection view"
      >
        <CollectionTabButton
          active={activeTab === "locations"}
          count={locationCount}
          label="Locations"
          onClick={() => onSelectTab("locations")}
        />
        <CollectionTabButton
          active={activeTab === "all"}
          count={collectionItemCount}
          label="All"
          onClick={() => onSelectTab("all")}
        />
      </div>
    </>
  )
}

function CollectionValueSummaryCard({ valueSummary }: { valueSummary: CollectionValueSummary }) {
  return (
    <div className="mb-7 grid gap-3 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-base-content/50">
          Market value
        </p>
        <p className="mt-1 font-mono text-2xl font-black">{valueSummary.totalPriceText || "$0"}</p>
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-base-content/50">
          Purchase basis
        </p>
        <p className="mt-1 font-mono text-2xl font-black">
          {valueSummary.purchasePriceText || "$0"}
        </p>
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-base-content/50">
          Value gain
        </p>
        <p
          className={cn(
            "mt-1 font-mono text-2xl font-black",
            collectionValueGainClass(valueSummary.valueGainText),
          )}
        >
          {valueSummary.valueGainText || "$0"}
          {valueSummary.valueGainPercentText ? ` (${valueSummary.valueGainPercentText})` : ""}
        </p>
      </div>
    </div>
  )
}
