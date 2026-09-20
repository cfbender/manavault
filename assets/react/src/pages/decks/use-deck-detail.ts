import { useApolloClient, useQuery } from "@apollo/client/react"
import { useEffect, useMemo, useRef } from "react"

import { graphqlEndpointContext, refetchActiveQueries } from "../../lib/apollo"
import { usePageTitle } from "../../lib/page-title"
import { mergeDeckCardsPage } from "./deck-detail-pagination"
import { flattenDeck } from "./deck-types"
import { DeckDocument } from "./deck-detail-documents"

export function useDeckDetail({ id, shareMode }: { id: string; shareMode: boolean }) {
  const client = useApolloClient()
  const { data, fetchMore, loading, previousData } = useQuery(DeckDocument, {
    variables: { id },
    context: shareMode ? graphqlEndpointContext("/share/graphql") : undefined,
    fetchPolicy: "cache-and-network",
  })
  const pageInfo = data?.deck?.deckCards?.pageInfo
  const isLoadingMore = useRef(false)

  useEffect(() => {
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor || isLoadingMore.current) return

    isLoadingMore.current = true
    void fetchMore({
      variables: { id, deckCardsAfter: pageInfo.endCursor },
      updateQuery: (previous, { fetchMoreResult }) => mergeDeckCardsPage(previous, fetchMoreResult),
    }).finally(() => {
      isLoadingMore.current = false
    })
  }, [fetchMore, id, pageInfo?.endCursor, pageInfo?.hasNextPage])

  const queryData = data?.deck ? data : previousData?.deck?.id === id ? previousData : data
  const deck = useMemo(() => flattenDeck(queryData?.deck), [queryData?.deck])
  const deckCards = useMemo(() => deck?.deckCards ?? [], [deck?.deckCards])
  const isInitialLoading = loading && !deck
  usePageTitle(deck?.name ?? (isInitialLoading ? "Deck" : "Deck not found"))

  return {
    deck,
    deckCards,
    isInitialLoading,
    isRefreshing: loading && Boolean(deck),
    refetch: () => void refetchActiveQueries(client),
  }
}
