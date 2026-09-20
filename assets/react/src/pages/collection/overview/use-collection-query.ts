import { useQuery } from "@apollo/client/react"
import { useCallback, useMemo, useState } from "react"
import { present } from "../../../lib/utils"
import { COLLECTION_PAGE_SIZE } from "../constants"
import { CollectionItemGroupsPageDocument } from "../items/documents"
import type { CollectionSort, CollectionTab } from "../types"
import { CollectionDocument } from "./documents"

const RECENT_COLLECTION_SORT: CollectionSort = { field: "added", direction: "desc" }
const RECENT_ITEMS_LIMIT = 500

export function useCollectionQuery({
  activeTab,
  filters,
  sort,
}: {
  activeTab: CollectionTab
  filters: { q?: string; locationId?: string; unallocatedOnly?: boolean; addedWithinDays?: number }
  sort: CollectionSort
}) {
  const [fetchingMore, setFetchingMore] = useState(false)
  const itemSort = activeTab === "recent" ? RECENT_COLLECTION_SORT : sort
  const summaryQuery = useQuery(CollectionDocument, {
    variables: { filters },
    fetchPolicy: "cache-and-network",
  })
  const itemsQuery = useQuery(CollectionItemGroupsPageDocument, {
    variables: { filters, sort: itemSort, first: COLLECTION_PAGE_SIZE, after: null },
    skip: activeTab === "locations" || activeTab === "value",
    fetchPolicy: "cache-and-network",
  })
  const groups = useMemo(
    () => (itemsQuery.data?.collectionItemGroups.edges || []).map((edge) => edge?.node).filter(present),
    [itemsQuery.data],
  )
  const locations = useMemo(
    () => summaryQuery.data?.locations?.edges?.map((edge) => edge?.node).filter(present) || [],
    [summaryQuery.data?.locations],
  )
  const pageInfo = itemsQuery.data?.collectionItemGroups.pageInfo
  const recentLimitReached = activeTab === "recent" && groups.length >= RECENT_ITEMS_LIMIT
  const hasNextPage = Boolean(pageInfo?.hasNextPage) && !recentLimitReached
  const loadMore = useCallback(() => {
    if (fetchingMore || !hasNextPage) return
    setFetchingMore(true)
    void itemsQuery
      .fetchMore({
        variables: {
          filters,
          sort: itemSort,
          first: COLLECTION_PAGE_SIZE,
          after: pageInfo?.endCursor ?? null,
        },
      })
      .finally(() => setFetchingMore(false))
  }, [fetchingMore, filters, hasNextPage, itemSort, itemsQuery, pageInfo?.endCursor])
  const locationGroups = useMemo(() => {
    const grouped = new Map<string, typeof locations>()
    for (const location of locations) {
      const kind = location.kind || "other"
      grouped.set(kind, [...(grouped.get(kind) || []), location])
    }
    return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right))
  }, [locations])
  const data = summaryQuery.data
  const unfiledCount =
    data?.unfiledCollectionItemCount ??
    locations.find((location) => location.id === "unfiled")?.itemCount ??
    0

  return {
    autoSortRules: data?.collectionAutoSortRules ?? [],
    collectionEntryCount: data?.collectionItemEntryCount ?? 0,
    collectionItemCount: data?.collectionItemCount ?? 0,
    fetchingMore,
    groups,
    hasNextPage,
    itemCounts: {
      all: data?.allCollectionItemCount ?? data?.collectionItemCount ?? 0,
      recent: Math.min(RECENT_ITEMS_LIMIT, data?.recentCollectionItemCount ?? 0),
      available: data?.availableCollectionItemCount ?? 0,
      unfiled: unfiledCount,
    },
    itemsQuery,
    itemSort,
    loadMore,
    locationGroups,
    locations,
    summaryLoading: summaryQuery.loading,
  }
}
