import type { FormEvent } from "react"
import { CheckSquare, ListFilter, Search } from "lucide-react"
import { PageSection } from "../../../components/app-shell"
import { EmptyState } from "../../../components/card-image"
import { CardNameSearchField } from "../../../components/card-name-search-field"
import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"
import { CollectionFilterModal } from "../filter-modal"
import { collectionSelectionTarget } from "../item-target"
import {
  CollectionBulkActionBar,
  VirtualizedCollectionGrid,
  type CollectionItemSelection,
} from "../selection-grid"
import { SortDropdown } from "../sort-controls"
import type { CollectionOverlay } from "./use-collection-overlays"
import type { useCollectionFilters } from "./use-collection-filters"
import type { useCollectionQuery } from "./use-collection-query"

export function CollectionItemsView({
  filters,
  query,
  selection,
  setOverlay,
}: {
  filters: ReturnType<typeof useCollectionFilters>
  query: ReturnType<typeof useCollectionQuery>
  selection: CollectionItemSelection
  setOverlay: (overlay: CollectionOverlay) => void
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    filters.applySearch(filters.searchDraft)
  }

  function bulkTarget() {
    return collectionSelectionTarget(selection, filters.itemFilters)
  }

  return (
    <div className="space-y-7">
      <form
        onSubmit={submit}
        className="control-toolbar grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <CardNameSearchField
          name="q"
          value={filters.searchDraft}
          onValueChange={filters.updateSearchDraft}
          onClear={filters.clearSearch}
          onSuggestionSelect={filters.applySearch}
          placeholder="Filter collection"
        />
        <SortDropdown sort={query.itemSort} onSortChange={filters.changeSort} />
        <Button
          type="button"
          variant={selection.selectionActive ? "secondary" : "outline"}
          onClick={selection.toggleSelectionMode}
        >
          <CheckSquare className="h-4 w-4" />
          Select
        </Button>
        <Button
          type="button"
          variant="outline"
          className="relative"
          onClick={() => filters.setFilterModalOpen(true)}
        >
          <ListFilter className="h-4 w-4" />
          Filter
          {filters.filterBadgeCount ? (
            <span className="badge badge-primary badge-sm absolute -right-2 -top-2 min-w-5">
              {filters.filterBadgeCount}
            </span>
          ) : null}
        </Button>
        <Button type="submit">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      {filters.activeFilterChips.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-box border border-base-300 bg-base-100 px-4 py-3 text-sm">
          <span className="font-bold text-base-content/70">Active filters</span>
          {filters.activeFilterChips.map((chip) => (
            <Badge key={chip.key} tone="primary">
              {chip.label}
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={filters.clearAll}>
            Clear all
          </Button>
        </div>
      ) : null}

      <CollectionBulkActionBar
        addToDeckDisabledReason={selection.addToDeckDisabledReason}
        allSelected={selection.allSelected}
        selectableCount={query.collectionEntryCount || query.groups.length}
        selectedCount={selection.selectedCount}
        selectionActive={selection.selectionActive}
        onAddToDeck={() => setOverlay({ type: "bulk-deck", target: bulkTarget() })}
        onAddToList={() => setOverlay({ type: "bulk-list", target: bulkTarget() })}
        onClear={selection.clearSelection}
        onDelete={() => setOverlay({ type: "bulk-delete", target: bulkTarget() })}
        onEdit={() => setOverlay({ type: "bulk-edit", target: bulkTarget() })}
        onMove={() => setOverlay({ type: "bulk-move", target: bulkTarget() })}
        onSelectAll={selection.selectAll}
      />

      <PageSection
        count={`${query.collectionItemCount} ${filters.combinedQuery ? "shown" : "total"}`}
      >
        {query.itemsQuery.loading && !query.itemsQuery.data ? (
          <EmptyState title="Loading collection..." />
        ) : (
          <VirtualizedCollectionGrid
            groups={query.groups}
            hasNextPage={query.hasNextPage}
            isFetchingNextPage={query.fetchingMore}
            isSelected={selection.isSelected}
            onLoadMore={query.loadMore}
            onToggleSelected={selection.toggleItem}
            selectionActive={selection.selectionActive}
          />
        )}
      </PageSection>

      <CollectionFilterModal
        filters={filters.structuredFilters}
        open={filters.filterModalOpen}
        onApply={filters.applyStructuredFilters}
        onClear={filters.clearStructuredFilters}
        onClose={() => filters.setFilterModalOpen(false)}
      />
    </div>
  )
}
