import { useMutation, useQuery } from "@apollo/client/react"
import { Share2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { EmptyState } from "../../components/card-image"
import { SearchField } from "../../components/search-field"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/toast"
import { pluralize, present } from "../../lib/utils"
import { COLLECTION_PAGE_SIZE, DEFAULT_COLLECTION_SORT } from "../collection/constants"
import {
  BulkUpdateCollectionItemsDocument,
  CollectionItemGroupsPageDocument,
} from "../collection/documents"
import { VirtualizedCollectionGrid } from "../collection/selection-grid"
import type { CollectionItemGroup } from "../collection/types"
import { BinderShareDialog } from "./binder-share-dialog"
import { TradeBinderCountDocument } from "./documents"

export function BinderTab() {
  const { showToast } = useToast()
  const [q, setQ] = useState("")
  const [appliedQ, setAppliedQ] = useState("")
  const [forTradeOnly, setForTradeOnly] = useState(false)
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => setAppliedQ(q.trim()), 200)
    return () => window.clearTimeout(timeout)
  }, [q])

  const filters = useMemo(
    () => ({
      ...(appliedQ ? { q: appliedQ } : {}),
      ...(forTradeOnly ? { forTrade: true } : {}),
    }),
    [appliedQ, forTradeOnly],
  )

  const binderQuery = useQuery(CollectionItemGroupsPageDocument, {
    variables: { filters, sort: DEFAULT_COLLECTION_SORT, first: COLLECTION_PAGE_SIZE, after: null },
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
  // Keep the filtered view consistent while the grouped query refetches after
  // a bulk trade-status update.
  const visibleGroups = forTradeOnly
    ? groups.filter((group) => group.items.every((item) => item.forTrade))
    : groups

  const loadMore = useCallback(() => {
    if (isFetchingMore || !hasNextPage) return

    setIsFetchingMore(true)
    void binderQuery
      .fetchMore({
        variables: {
          filters,
          sort: DEFAULT_COLLECTION_SORT,
          first: COLLECTION_PAGE_SIZE,
          after: pageInfo?.endCursor ?? null,
        },
      })
      .finally(() => setIsFetchingMore(false))
  }, [binderQuery, filters, hasNextPage, isFetchingMore, pageInfo?.endCursor])

  const [updateForTrade] = useMutation(BulkUpdateCollectionItemsDocument, {
    refetchQueries: [{ query: TradeBinderCountDocument }],
    onError: (error) =>
      showToast(error.message || "Could not update trade status", { tone: "info" }),
  })

  function toggleForTrade(group: CollectionItemGroup) {
    const nextForTrade = !group.items.every((item) => item.forTrade)
    void updateForTrade({
      variables: {
        selector: { ids: group.items.map((item) => item.id) },
        input: { forTrade: nextForTrade },
      },
      onCompleted: () => void binderQuery.refetch(),
    })
  }

  const isInitialLoading = binderQuery.loading && !binderQuery.data
  const forTradeCount = countQuery.data?.collectionItemCount

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
          <label className="label cursor-pointer justify-start gap-2 rounded-btn border border-base-300 px-3 py-2">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-primary"
              checked={forTradeOnly}
              onChange={(event) => setForTradeOnly(event.target.checked)}
            />
            <span className="label-text text-sm">Only for trade</span>
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
          onToggleForTrade={toggleForTrade}
        />
      )}

      <BinderShareDialog open={isShareOpen} onOpenChange={setIsShareOpen} />
    </div>
  )
}
