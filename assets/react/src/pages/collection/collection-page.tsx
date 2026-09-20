import { CollectionLocationsSection } from "./collection-locations-section"
import { CollectionPageHeader } from "./collection-page-header"
import { CollectionQuickCheck } from "./collection-quick-check"
import { CollectionDialogs } from "./overview/collection-dialogs"
import { CollectionItemsView } from "./overview/collection-items-view"
import { useCollectionFilters } from "./overview/use-collection-filters"
import { useCollectionMutations } from "./overview/use-collection-mutations"
import { useCollectionOverlays } from "./overview/use-collection-overlays"
import { useCollectionQuery } from "./overview/use-collection-query"
import { useCollectionItemSelection } from "./selection-grid"
import type { CollectionTab } from "./types"
import { CollectionValueDashboard } from "./value-dashboard"

export function CollectionPage({ importFile = false }: { importFile?: boolean }) {
  const filters = useCollectionFilters()
  const query = useCollectionQuery({
    activeTab: filters.activeTab,
    filters: filters.itemFilters,
    sort: filters.sort,
  })
  const overlays = useCollectionOverlays(importFile)
  const selection = useCollectionItemSelection({
    groups: query.groups,
    totalCount: query.collectionEntryCount,
    resetKey: JSON.stringify(filters.itemFilters),
  })
  const mutations = useCollectionMutations({
    autoSortRules: query.autoSortRules,
    selection,
    setOverlay: overlays.setOverlay,
  })

  function selectTab(tab: CollectionTab) {
    selection.clearSelection()
    filters.setActiveTab(tab)
  }

  return (
    <>
      <CollectionPageHeader
        activeTab={filters.activeTab}
        autoSortDisabled={query.summaryLoading}
        autoSortPending={mutations.autoSortPending}
        itemCounts={query.itemCounts}
        locationCount={query.locations.length}
        quickCheckOpen={overlays.quickCheckOpen}
        onAddItem={() => overlays.setOverlay({ type: "add-item" })}
        onAddLocation={() => overlays.setOverlay({ type: "add-location" })}
        onAutoSort={mutations.previewAutoSort}
        onImport={() => overlays.setOverlay({ type: "import", initialImport: null })}
        onQuickCheck={() => overlays.setQuickCheckOpen((open) => !open)}
        onExportCsv={() => overlays.setOverlay({ type: "export-collection" })}
        onSellCards={() => overlays.setOverlay({ type: "sell-cards" })}
        onSelectTab={selectTab}
      />

      <CollectionQuickCheck
        open={overlays.quickCheckOpen}
        onOpenChange={overlays.setQuickCheckOpen}
      />

      {mutations.autoSortError ? (
        <p
          role="alert"
          className="mb-5 rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
        >
          {mutations.autoSortError}
        </p>
      ) : null}

      <div
        id="collection-view-panel"
        role="tabpanel"
        aria-labelledby={`collection-tab-${filters.activeTab}`}
      >
        {filters.activeTab === "value" ? (
          <CollectionValueDashboard />
        ) : filters.activeTab === "locations" ? (
          <CollectionLocationsSection
            isLoading={query.summaryLoading}
            locationCount={query.locations.length}
            locationGroups={query.locationGroups}
            onDeleteLocation={(location) =>
              overlays.setOverlay({ type: "delete-location", location })
            }
            onEditLocation={(location) => overlays.setOverlay({ type: "edit-location", location })}
            onExportLocation={(location, format) =>
              overlays.setOverlay({ type: "export-location", format, location })
            }
          />
        ) : (
          <CollectionItemsView
            filters={filters}
            query={query}
            selection={selection}
            setOverlay={overlays.setOverlay}
          />
        )}
      </div>

      <CollectionDialogs
        applyAutoSort={mutations.applyAutoSort}
        close={overlays.closeOverlay}
        deleteLocation={mutations.deleteLocation}
        filters={filters.itemFilters}
        finishBulkAction={mutations.finishBulkAction}
        overlay={overlays.overlay}
        pendingAutoSort={mutations.autoSortPending}
      />
    </>
  )
}
