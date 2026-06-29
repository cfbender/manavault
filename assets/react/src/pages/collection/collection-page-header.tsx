import { Boxes, Download, Plus, Tags, Upload, WandSparkles } from "lucide-react"
import { PageHeader } from "../../components/app-shell"
import { Button } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import { CollectionTabButton } from "./sort-controls"
import type { CollectionTab, CollectionValueSummary } from "./types"
import { collectionValueGainClass } from "./value-summary"

type CollectionPageHeaderProps = {
  activeTab: CollectionTab
  itemCounts: {
    all: number
    recent: number
    available: number
    unfiled: number
  }
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
  itemCounts,
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
          <div className="flex w-full flex-wrap items-center gap-2 sm:justify-end">
            <Button type="button" onClick={onAddItem}>
              <Plus className="h-4 w-4" />
              Add card
            </Button>
            <Button type="button" variant="outline" onClick={onAddLocation}>
              <Boxes className="h-4 w-4" />
              Add location
            </Button>
            <Button type="button" variant="outline" onClick={onImport}>
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <Button type="button" variant="outline" onClick={onExportCsv}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button type="button" variant="outline" onClick={onSellCards}>
              <Tags className="h-4 w-4" />
              Sell
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={autoSortDisabled || autoSortPending}
              onClick={onAutoSort}
            >
              <WandSparkles className="h-4 w-4" />
              {autoSortPending ? "Previewing..." : "Preview auto-sort"}
            </Button>
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
          count={itemCounts.all}
          label="All cards"
          onClick={() => onSelectTab("all")}
        />
        <CollectionTabButton
          active={activeTab === "recent"}
          count={itemCounts.recent}
          label="Recently added"
          onClick={() => onSelectTab("recent")}
        />
        <CollectionTabButton
          active={activeTab === "available"}
          count={itemCounts.available}
          label="Available to pull"
          onClick={() => onSelectTab("available")}
        />
        <CollectionTabButton
          active={activeTab === "unfiled"}
          count={itemCounts.unfiled}
          label="Unfiled"
          onClick={() => onSelectTab("unfiled")}
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
