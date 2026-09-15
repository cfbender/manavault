import { useMutation, useQuery } from "@apollo/client/react"
import { ListFilter, Share2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { EmptyState } from "../../components/card-image"
import { SearchField } from "../../components/search-field"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/toast"
import {
  buildCollectionFilterQuery,
  combineCollectionQueries,
  countActiveCollectionFilters,
  type CollectionFilterState,
} from "../../lib/collection-filters"
import { pluralize, present } from "../../lib/utils"
import { COLLECTION_PAGE_SIZE, DEFAULT_COLLECTION_SORT } from "../collection/constants"
import { CollectionItemGroupsPageDocument } from "../collection/documents"
import { CollectionFilterModal } from "../collection/filter-modal"
import { VirtualizedCollectionGrid } from "../collection/selection-grid"
import { SortDropdown } from "../collection/sort-controls"
import { createEmptyCollectionFilters } from "../collection/storage"
import type { CollectionItemGroup, CollectionSort } from "../collection/types"
import { BinderShareDialog } from "./binder-share-dialog"
import { SetCollectionItemsForTradeQuantityDocument, TradeBinderCountDocument } from "./documents"

export function nextForTradeQuantity(offered: number, owned: number) {
  return offered < owned ? offered + 1 : 0
}

function groupForTradeQuantity(group: CollectionItemGroup) {
  return group.items.reduce((total, item) => total + item.forTradeQuantity, 0)
}

export function BinderTab() {
  const { showToast } = useToast()
  const [q, setQ] = useState("")
  const [appliedQ, setAppliedQ] = useState("")
  const [sort, setSort] = useState<CollectionSort>(DEFAULT_COLLECTION_SORT)
  const [structuredFilters, setStructuredFilters] = useState<CollectionFilterState>(
    createEmptyCollectionFilters,
  )
  const [forTradeOnly, setForTradeOnly] = useState(false)
  const [includeAllocated, setIncludeAllocated] = useState(false)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [pendingPrintingIds, setPendingPrintingIds] = useState<Set<string>>(new Set())
  const [tradeQuantityOverrides, setTradeQuantityOverrides] = useState<Record<string, number>>({})

  useEffect(() => {
    const timeout = window.setTimeout(() => setAppliedQ(q.trim()), 200)
    return () => window.clearTimeout(timeout)
  }, [q])

  const structuredFilterSyntax = buildCollectionFilterQuery(structuredFilters)
  const combinedQuery = combineCollectionQueries(appliedQ, structuredFilterSyntax)
  const activeFilterCount = countActiveCollectionFilters(structuredFilters)
  const filters = useMemo(
    () => ({
      ...(combinedQuery ? { q: combinedQuery } : {}),
      ...(forTradeOnly ? { forTrade: true } : {}),
      ...(!includeAllocated ? { unallocatedOnly: true } : {}),
    }),
    [combinedQuery, forTradeOnly, includeAllocated],
  )

  const binderQuery = useQuery(CollectionItemGroupsPageDocument, {
    variables: { filters, sort, first: COLLECTION_PAGE_SIZE, after: null },
    fetchPolicy: "cache-and-network",
  })
  const countQuery = useQuery(TradeBinderCountDocument, { fetchPolicy: "cache-and-network" })

  const pageInfo = binderQuery.data?.collectionItemGroups.pageInfo
  const hasNextPage = Boolean(pageInfo?.hasNextPage)
  const groups = useMemo(
    () =>
      (binderQuery.data?.collectionItemGroups.edges || [])
        .map((edge) => edge?.node)
        .filter(present),
    [binderQuery.data],
  )
  const offeredQuantity = useCallback(
    (group: CollectionItemGroup) =>
      tradeQuantityOverrides[group.printingId] ?? groupForTradeQuantity(group),
    [tradeQuantityOverrides],
  )
  const visibleGroups = forTradeOnly ? groups.filter((group) => offeredQuantity(group) > 0) : groups

  const loadMore = useCallback(() => {
    if (isFetchingMore || !hasNextPage) return

    setIsFetchingMore(true)
    void binderQuery
      .fetchMore({
        variables: {
          filters,
          sort,
          first: COLLECTION_PAGE_SIZE,
          after: pageInfo?.endCursor ?? null,
        },
      })
      .finally(() => setIsFetchingMore(false))
  }, [binderQuery, filters, hasNextPage, isFetchingMore, pageInfo?.endCursor, sort])

  const [setForTradeQuantity] = useMutation(SetCollectionItemsForTradeQuantityDocument)

  async function incrementForTrade(group: CollectionItemGroup) {
    if (pendingPrintingIds.has(group.printingId)) return

    const quantity = nextForTradeQuantity(offeredQuantity(group), group.quantity)
    setTradeQuantityOverrides((current) => ({ ...current, [group.printingId]: quantity }))
    setPendingPrintingIds((current) => new Set(current).add(group.printingId))

    try {
      await setForTradeQuantity({
        variables: {
          selector: { ids: group.items.map((item) => item.id) },
          quantity,
        },
      })

      void countQuery.refetch().catch(() => {
        showToast("Trade quantity was saved, but the binder count could not be refreshed.", {
          tone: "info",
        })
      })
    } catch (error) {
      setTradeQuantityOverrides((current) => {
        const { [group.printingId]: _removed, ...rest } = current
        return rest
      })
      showToast(error instanceof Error ? error.message : "Could not update trade quantity", {
        tone: "info",
      })
    } finally {
      setPendingPrintingIds((current) => {
        const next = new Set(current)
        next.delete(group.printingId)
        return next
      })
    }
  }

  const isInitialLoading = binderQuery.loading && !binderQuery.data
  const forTradeCount = countQuery.data?.collectionItemCount

  function applyStructuredFilters(nextFilters: CollectionFilterState) {
    setStructuredFilters(nextFilters)
    setIsFilterModalOpen(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            aria-label="Search binder"
            placeholder="Search your binder"
            value={q}
            onValueChange={setQ}
            className="w-64 max-w-full"
          />
          <SortDropdown sort={sort} onSortChange={setSort} />
          <Button
            type="button"
            variant="outline"
            className="relative"
            onClick={() => setIsFilterModalOpen(true)}
          >
            <ListFilter className="h-4 w-4" />
            Filter
            {activeFilterCount ? (
              <span className="badge badge-primary badge-sm absolute -right-2 -top-2 min-w-5">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
          <label className="label cursor-pointer justify-start gap-2 rounded-btn border border-base-300 px-3 py-2">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-primary"
              checked={forTradeOnly}
              onChange={(event) => setForTradeOnly(event.target.checked)}
            />
            <span className="label-text text-sm">Only for trade</span>
          </label>
          <label className="label cursor-pointer justify-start gap-2 rounded-btn border border-base-300 px-3 py-2">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-primary"
              checked={includeAllocated}
              onChange={(event) => setIncludeAllocated(event.target.checked)}
            />
            <span className="label-text text-sm">Include deck cards</span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {typeof forTradeCount === "number" ? (
            <p className="text-sm text-base-content/60">
              {pluralize(forTradeCount, "card")} up for trade
            </p>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => setIsShareOpen(true)}>
            <Share2 className="h-4 w-4" />
            Share binder
          </Button>
        </div>
      </div>

      {binderQuery.error ? (
        <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          {binderQuery.error.message || "Could not load your binder"}
        </p>
      ) : isInitialLoading ? (
        <EmptyState title="Loading binder..." />
      ) : (
        <VirtualizedCollectionGrid
          groups={visibleGroups}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingMore}
          onLoadMore={loadMore}
          forTradeQuantityOverrides={tradeQuantityOverrides}
          pendingForTradePrintingIds={pendingPrintingIds}
          onToggleForTrade={incrementForTrade}
        />
      )}

      <CollectionFilterModal
        filters={structuredFilters}
        open={isFilterModalOpen}
        onApply={applyStructuredFilters}
        onClear={() => setStructuredFilters(createEmptyCollectionFilters())}
        onClose={() => setIsFilterModalOpen(false)}
      />
      <BinderShareDialog open={isShareOpen} onOpenChange={setIsShareOpen} />
    </div>
  )
}
