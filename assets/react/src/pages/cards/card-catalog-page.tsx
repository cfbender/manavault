import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { PageHeader } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { Button } from "../../components/ui/button"
import { CollectionFilterModal } from "../collection"
import { AddCatalogCardToDeckDialog, type CardDeckTarget } from "./add-card-to-deck-dialog"
import { CardResultsGrid } from "./card-results-grid"
import { CardSearchForm } from "./search-form"
import { CommanderGallery } from "./commander-gallery"
import { DEFAULT_CATALOG_SORT, type CatalogSort } from "./sort"
import { useCardSearch } from "./use-card-search"

export type CardCatalogPageProps = {
  query: string
  filterSearch?: string
  sort?: CatalogSort
}

export function CardCatalogPage({
  query,
  filterSearch,
  sort = DEFAULT_CATALOG_SORT,
}: CardCatalogPageProps) {
  const [deckTarget, setDeckTarget] = useState<CardDeckTarget | null>(null)
  const navigate = useNavigate({ from: "/cards/" })
  const search = useCardSearch({ query, filterSearch, sort })

  return (
    <>
      <PageHeader
        eyebrow="ManaVault Catalog"
        title="Card search"
        description="Search the local Scryfall catalog and add exact printings to your collection."
      />
      <CardSearchForm
        activeFilterCount={search.activeFilterCount}
        onFilterClick={() => search.setIsFilterModalOpen(true)}
        q={search.draftQuery}
        setQ={search.updateSearchDraft}
        onSearch={search.submitSearch}
        sort={sort}
        onSortChange={search.changeSort}
      />

      {search.combinedQuery ? (
        <CardSearchResultsStatus
          activeFilterCount={search.activeFilterCount}
          hasMoreResults={search.hasMoreResults}
          isFetching={search.isFetching}
          query={query}
          visibleResultCount={search.cards.length}
        />
      ) : null}

      {!search.combinedQuery ? (
        <CommanderGallery />
      ) : search.cards.length ? (
        <>
          <CardResultsGrid
            cards={search.cards}
            onAddToDeck={setDeckTarget}
            onSelectCard={(id) =>
              navigate({
                to: "/cards/$id",
                params: { id },
                search: search.resultSearchParams,
              })
            }
            searchParams={search.resultSearchParams}
          />
          {search.hasMoreResults ? (
            <div ref={search.loadMoreRef} className="py-6 text-center">
              {search.isFetchingMore ? (
                <span className="text-sm text-base-content/60">Loading more...</span>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <NoCardResults
          hasActiveFilters={search.activeFilterCount > 0}
          isFetching={search.isFetching}
          query={query}
          onClearFilters={search.clearFilters}
          onSearchExact={() => search.submitSearch(`!"${query.trim()}"`)}
        />
      )}

      <CollectionFilterModal
        filters={search.structuredFilters}
        open={search.isFilterModalOpen}
        onApply={search.applyFilters}
        onClear={search.clearFilters}
        onClose={() => search.setIsFilterModalOpen(false)}
      />
      <AddCatalogCardToDeckDialog
        target={deckTarget}
        onOpenChange={(open) => !open && setDeckTarget(null)}
      />
    </>
  )
}

function CardSearchResultsStatus({
  activeFilterCount,
  hasMoreResults,
  isFetching,
  query,
  visibleResultCount,
}: {
  activeFilterCount: number
  hasMoreResults: boolean
  isFetching: boolean
  query: string
  visibleResultCount: number
}) {
  const resultLabel = isFetching
    ? visibleResultCount
      ? `Refreshing ${visibleResultCount}${hasMoreResults ? "+" : ""} visible results`
      : "Searching local catalog"
    : visibleResultCount
      ? `Showing ${visibleResultCount}${hasMoreResults ? "+" : ""} result${visibleResultCount === 1 ? "" : "s"}`
      : "No visible results"

  return (
    <section className="mb-6 flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-black">{resultLabel}</p>
        <p className="text-xs text-base-content/65">
          Results rank by catalog relevance. Choose a card to inspect its printings and owned
          copies.
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        {query.trim() ? (
          <span className="rounded-full border border-base-300 bg-base-200 px-2.5 py-1 font-mono font-bold text-base-content/80">
            q: {query.trim()}
          </span>
        ) : null}
        {activeFilterCount ? (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-bold text-primary">
            {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {hasMoreResults ? (
          <span className="rounded-full border border-base-300 px-2.5 py-1 font-bold text-base-content/70">
            More available
          </span>
        ) : null}
      </div>
    </section>
  )
}

function NoCardResults({
  hasActiveFilters,
  isFetching,
  onClearFilters,
  onSearchExact,
  query,
}: {
  hasActiveFilters: boolean
  isFetching: boolean
  onClearFilters: () => void
  onSearchExact: () => void
  query: string
}) {
  if (isFetching) {
    return (
      <EmptyState
        title="Searching local catalog"
        description="Checking synced card names, oracle text, sets, and printings."
      />
    )
  }

  return (
    <EmptyState
      title="No cards found"
      description="Try an exact-name search, remove filters, or use catalog syntax such as set:lea, type:artifact, or oracle:draw."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {query.trim() ? (
            <Button type="button" variant="outline" onClick={onSearchExact}>
              Search exact name
            </Button>
          ) : null}
          {hasActiveFilters ? (
            <Button type="button" variant="outline" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      }
    />
  )
}
