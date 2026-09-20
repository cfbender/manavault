import { useQuery } from "@apollo/client/react"
import { useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  buildCollectionFilterQuery,
  cloneCollectionFilters,
  combineCollectionQueries,
  countActiveCollectionFilters,
  decodeCollectionFilters,
  EMPTY_COLLECTION_FILTERS,
  encodeCollectionFilters,
  type CollectionFilterState,
} from "../../lib/collection-filters"
import { present } from "../../lib/utils"
import { CardsDocument } from "./data"
import { serializeCatalogSort, type CatalogSort } from "./sort"

type NodeConnection<T> =
  | { edges?: ReadonlyArray<{ node?: T | null } | null> | null }
  | null
  | undefined

function connectionNodes<T>(connection: NodeConnection<T>): T[] {
  return connection?.edges?.map((edge) => edge?.node).filter(present) || []
}

type UseCardSearchOptions = {
  query: string
  filterSearch?: string
  sort: CatalogSort
}

export function useCardSearch({ query, filterSearch, sort }: UseCardSearchOptions) {
  const [draftQuery, setDraftQuery] = useState(query)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [structuredFilters, setStructuredFilters] = useState<CollectionFilterState>(() =>
    decodeCollectionFilters(filterSearch),
  )
  const navigate = useNavigate({ from: "/cards/" })
  const isFetchingMoreRef = useRef(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const structuredFilterSyntax = buildCollectionFilterQuery(structuredFilters)
  const combinedQuery = combineCollectionQueries(query, structuredFilterSyntax)
  const activeFilterCount = countActiveCollectionFilters(structuredFilters)
  const shouldSearchCards = Boolean(combinedQuery.trim())
  const { data, loading, fetchMore, networkStatus } = useQuery(CardsDocument, {
    variables: { q: combinedQuery, limit: 36, sort },
    skip: !shouldSearchCards,
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  })
  const cards = shouldSearchCards
    ? connectionNodes(data?.cards).map((card) => ({
        ...card,
        printings: connectionNodes(card.printings),
      }))
    : []
  const hasMoreResults = Boolean(data?.cards.pageInfo.hasNextPage)
  const endCursor = data?.cards.pageInfo.endCursor

  const searchParams = useCallback(
    (nextQuery: string, nextFilters = structuredFilters, nextSort = sort) => {
      const term = nextQuery.trim()
      return {
        q: term || undefined,
        filters: encodeCollectionFilters(nextFilters),
        sort: serializeCatalogSort(nextSort),
      }
    },
    [sort, structuredFilters],
  )

  const loadMore = useCallback(() => {
    if (isFetchingMoreRef.current || !hasMoreResults || !endCursor) return

    isFetchingMoreRef.current = true
    void fetchMore({ variables: { after: endCursor } }).finally(() => {
      isFetchingMoreRef.current = false
    })
  }, [endCursor, fetchMore, hasMoreResults])

  useEffect(() => {
    const sentinel = loadMoreRef.current
    if (!sentinel || !hasMoreResults) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: "200px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMoreResults, loadMore])

  function submitSearch(value = draftQuery) {
    navigate({ to: "/cards", search: searchParams(value) })
  }

  function updateSearchDraft(value: string) {
    setDraftQuery(value)
    if (!value.trim() && query) navigate({ to: "/cards", search: searchParams("") })
  }

  function changeSort(nextSort: CatalogSort) {
    navigate({ to: "/cards", search: searchParams(query, structuredFilters, nextSort) })
  }

  function applyFilters(nextFilters: CollectionFilterState) {
    const filters = cloneCollectionFilters(nextFilters)
    setStructuredFilters(filters)
    setIsFilterModalOpen(false)
    navigate({ to: "/cards", search: searchParams(query, filters) })
  }

  function clearFilters() {
    const filters = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
    setStructuredFilters(filters)
    navigate({ to: "/cards", search: searchParams(query, filters) })
  }

  return {
    activeFilterCount,
    applyFilters,
    cards,
    changeSort,
    clearFilters,
    combinedQuery,
    draftQuery,
    hasMoreResults,
    isFetching: loading,
    isFetchingMore: networkStatus === 3,
    isFilterModalOpen,
    loadMoreRef,
    resultSearchParams: searchParams(query),
    setIsFilterModalOpen,
    structuredFilters,
    submitSearch,
    updateSearchDraft,
  }
}
