import type { OperationVariables, TypedDocumentNode } from "@apollo/client"
import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { EmptyState } from "../../components/card-image"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/toast"
import type { DeckCardInput, DeckCardUpdateInput, DeckQuery } from "../../gql/graphql"
import { groupDeckCards, type DeckGroupBy } from "../../lib/deck-grouping"
import { graphqlEndpointContext, refetchActiveQueries } from "../../lib/apollo"
import { usePageTitle } from "../../lib/page-title"
import { pluralize } from "../../lib/utils"
import { deckCardsTotalPrice, deckMissingCardsTotalPrice, formatUsdCents } from "./buylist-export"
import {
  allocatableDeckPullListEntries,
  createDeckPullList,
  type DeckPullListEntry,
  type DeckPullListExclusions,
  type DeckPullListMode,
} from "./deck-allocation-model"
import {
  updateDeckCardCustomTagsInDeckQuery,
  updateDeckCardTagsInDeckQuery,
  type DeckCustomTagPatch,
  type DeckTagPatch,
} from "./deck-query-cache"
import { compareDeckCards, countDeckZones } from "./deck-card-model"
import { deckLegalityIssues } from "./deck-legality"
import { useDeferredDeckAnalysis } from "./deck-stats-panel"
import {
  flattenDeck,
  type DeckCardEntry,
  type DeckCardTag,
  type DeckDisassemblyResult,
  type DeckZone,
  type EDHRecAddZone,
  type EDHRecCard,
  type EDHRecSectionCard,
  type EDHRecTab,
} from "./deck-types"
import { useDeckTags } from "./use-deck-tags"
import { DeckDetailContent } from "./detail-page-content"
import { DeckDetailDialogs } from "./detail-page-dialogs"
import { useDeckDetailSelection } from "./detail-page-selection"
import {
  ShareDeckBuylistDialog,
  SharePlaytestOverlay,
  useSharedDecklistActions,
} from "./detail-page-share"
import { edhrecCardPrintingId } from "./edhrec"
import {
  AddDeckCardDocument,
  AllocateDeckCardItemDocument,
  AllocateDeckPullListDocument,
  AllocateDeckCardProxyDocument,
  AssignDeckCardTagDocument,
  BulkDeallocateDeckCardsDocument,
  BulkDeleteDeckCardsDocument,
  BulkUpdateDeckCardsDocument,
  DeallocateDeckCardItemDocument,
  DeallocateDeckCardProxyDocument,
  DeckDocument,
  DeleteDeckCardDocument,
  DisassembleDeckDocument,
  PreviewDeckDisassemblyDocument,
  OptimizeDeckCardPrintingsDocument,
  SetDeckCommanderDocument,
  UnassignDeckCardTagDocument,
  UpdateDeckCardDocument,
  UpdateDeckCardsTagDocument,
} from "./queries"

type UpdateDeckCardVariables = { deckCardId: string; input: DeckCardUpdateInput }
type UpdateDeckCardMutationContext =
  | { isTagOnly: false; rollbackPatches: [] }
  | { isTagOnly: true; optimisticTag: DeckCardTag | null; rollbackPatches: DeckTagPatch[] }
type UpdateDeckCardsTagVariables = { deckCardIds: string[]; tag: DeckCardTag | null }

function deckCardTagValue(tag: string | null | undefined): DeckCardTag | null | undefined {
  if (tag === null) return null
  if (tag === "getting" || tag === "consider_cutting") return tag
  return undefined
}

function isTagOnlyDeckCardUpdate(input: DeckCardUpdateInput) {
  const keys = Object.keys(input)
  return keys.length === 1 && keys[0] === "tag"
}

function deckCardTagFromDeckQuery(data: DeckQuery | undefined, deckCardId: string) {
  const edges = data?.deck?.deckCards?.edges
  if (!edges) return undefined

  for (const edge of edges) {
    const node = edge?.node
    if (node?.id === deckCardId) return deckCardTagValue(node.tag)
  }

  return undefined
}

function rollbackDeckCardTagPatches(
  data: DeckQuery | undefined,
  deckCardIds: readonly string[],
  optimisticTag: DeckCardTag | null,
) {
  const patches: DeckTagPatch[] = []

  for (const deckCardId of deckCardIds) {
    const previousTag = deckCardTagFromDeckQuery(data, deckCardId)
    if (previousTag !== undefined) {
      patches.push({ currentTag: optimisticTag, id: deckCardId, tag: previousTag })
    }
  }

  return patches
}

// Shared wrapper for the fire-and-forget deck-card mutations: exposes isPending
// and a mutate that swallows errors (the UI surfaces them via allocationError).
function useDeckMutation<TData, TVariables extends OperationVariables>(
  document: TypedDocumentNode<TData, TVariables>,
) {
  const [mutation, result] = useMutation(document)

  return {
    ...result,
    isPending: result.loading,
    mutate: (variables: TVariables) => void mutation({ variables, onError: () => undefined }),
  }
}

function DeckDetailLoadingState() {
  return (
    <div className="space-y-7">
      <div className="h-8 w-32 animate-pulse rounded-btn bg-base-300" />
      <section className="min-h-52 rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
        <div className="flex h-full flex-col justify-between gap-8">
          <div className="flex gap-2">
            <div className="h-6 w-24 animate-pulse rounded-full bg-base-300" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-base-300" />
          </div>
          <div className="space-y-3">
            <div className="h-8 max-w-lg animate-pulse rounded-btn bg-base-300" />
            <div className="h-4 max-w-sm animate-pulse rounded-btn bg-base-300" />
          </div>
        </div>
      </section>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="aspect-[5/7] animate-pulse rounded-xl bg-base-300" />
        ))}
      </div>
    </div>
  )
}

export function DeckDetailPage({
  edhrecExcludeLands = false,
  edhrecTab,
  id,
  shareMode = false,
}: {
  edhrecExcludeLands?: boolean
  edhrecTab?: EDHRecTab
  id: string
  shareMode?: boolean
}) {
  const [groupBy, setGroupBy] = useState<DeckGroupBy>("theme")
  const [editTarget, setEditTarget] = useState<DeckCardEntry | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<DeckCardEntry | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [deleteCardTarget, setDeleteCardTarget] = useState<DeckCardEntry | null>(null)
  const [disassemblyResult, setDisassemblyResult] = useState<DeckDisassemblyResult | null>(null)
  const [isEditDeckOpen, setIsEditDeckOpen] = useState(false)
  const [isImportDeckOpen, setIsImportDeckOpen] = useState(false)
  const [isExportDeckOpen, setIsExportDeckOpen] = useState(false)
  const [isMissingCardsOpen, setIsMissingCardsOpen] = useState(false)
  const [isSelectFromListOpen, setIsSelectFromListOpen] = useState(false)
  const [isShareDeckOpen, setIsShareDeckOpen] = useState(false)
  const [previewDeckCard, setPreviewDeckCard] = useState<DeckCardEntry | null>(null)
  const [isSharePlaytestOpen, setIsSharePlaytestOpen] = useState(false)
  const [isShareBuylistOpen, setIsShareBuylistOpen] = useState(false)
  const [isBulkAllocationOpen, setIsBulkAllocationOpen] = useState(false)
  const [bulkAllocationMode, setBulkAllocationMode] = useState<DeckPullListMode>("any")
  const [selectedBulkAllocationItemIds, setSelectedBulkAllocationItemIds] = useState<
    Record<string, string | null>
  >({})
  const [excludedBulkAllocationEntryIds, setExcludedBulkAllocationEntryIds] =
    useState<DeckPullListExclusions>({})
  const [bulkAllocationError, setBulkAllocationError] = useState<string | null>(null)
  const [isOptimizePrintingsOpen, setIsOptimizePrintingsOpen] = useState(false)
  const [optimizePrintingsError, setOptimizePrintingsError] = useState<string | null>(null)
  const [isBulkUpdateDeckCardsPending, setIsBulkUpdateDeckCardsPending] = useState(false)
  const [isBulkDeleteDeckCardsPending, setIsBulkDeleteDeckCardsPending] = useState(false)
  const [isBulkDeallocateDeckCardsPending, setIsBulkDeallocateDeckCardsPending] = useState(false)
  const [isAllocateDeckPullListPending, setIsAllocateDeckPullListPending] = useState(false)
  const customTagOpSeqRef = useRef<Map<string, number>>(new Map())
  const [activeTagId, setActiveTagId] = useState<string | null>(null)
  const deckTags = useDeckTags(id)
  const navigate = useNavigate()
  const client = useApolloClient()
  const { showToast } = useToast()
  const [previewDeckDisassemblyMutation, previewDeckDisassemblyResult] = useMutation(
    PreviewDeckDisassemblyDocument,
  )
  const previewDeckDisassembly = {
    ...previewDeckDisassemblyResult,
    isPending: previewDeckDisassemblyResult.loading,
    mutate: (deckId: string) =>
      void previewDeckDisassemblyMutation({
        variables: { id: deckId },
        onCompleted: (data) => {
          setDisassemblyResult(data.previewDeckDisassembly?.disassemblyResult ?? null)
        },
        onError: () => undefined,
      }),
  }
  const [disassembleDeckMutation, disassembleDeckResult] = useMutation(DisassembleDeckDocument)
  const disassembleDeck = {
    ...disassembleDeckResult,
    isPending: disassembleDeckResult.loading,
    mutate: (deckId: string) =>
      void disassembleDeckMutation({
        variables: { id: deckId },
        onCompleted: () => {
          refetchDeckQueries()
          showToast("Deck archived")
          setDisassemblyResult(null)
          navigate({ to: "/decks" })
        },
        onError: () => undefined,
      }),
  }
  const {
    data,
    loading: isLoading,
    previousData,
    fetchMore: fetchMoreDeck,
  } = useQuery(DeckDocument, {
    variables: { id },
    context: shareMode ? graphqlEndpointContext("/share/graphql") : undefined,
    fetchPolicy: "cache-and-network",
  })

  // The Deck query caps deckCards at 500 per page. Decks larger than that (e.g.
  // cubes) would otherwise be silently truncated, corrupting stats, prices, and
  // the pull list. Walk fetchMore until every page is loaded. Normal decks
  // report hasNextPage=false on page one, so this never runs for them.
  const deckCardsPageInfo = data?.deck?.deckCards?.pageInfo
  const isLoadingMoreDeckCards = useRef(false)
  useEffect(() => {
    if (!deckCardsPageInfo?.hasNextPage || !deckCardsPageInfo.endCursor) return
    if (isLoadingMoreDeckCards.current) return

    isLoadingMoreDeckCards.current = true
    void fetchMoreDeck({
      variables: { id, deckCardsAfter: deckCardsPageInfo.endCursor },
      updateQuery: (previous, { fetchMoreResult }) => {
        const nextConnection = fetchMoreResult?.deck?.deckCards
        if (!nextConnection || !previous?.deck?.deckCards) return fetchMoreResult ?? previous

        return {
          ...previous,
          deck: {
            ...previous.deck,
            deckCards: {
              ...nextConnection,
              edges: [...(previous.deck.deckCards.edges || []), ...(nextConnection.edges || [])],
            },
          },
        }
      },
    }).finally(() => {
      isLoadingMoreDeckCards.current = false
    })
  }, [deckCardsPageInfo?.hasNextPage, deckCardsPageInfo?.endCursor, fetchMoreDeck, id])

  useEffect(() => {
    if (deckTags.error) showToast(deckTags.error)
  }, [deckTags.error, showToast])

  function readDeckQuery(): DeckQuery | undefined {
    return client.cache.readQuery({ query: DeckDocument, variables: { id } }) ?? undefined
  }

  function writeDeckQuery(data: DeckQuery | undefined) {
    if (!data) return
    client.cache.writeQuery({ query: DeckDocument, variables: { id }, data })
  }

  function updateDeckCacheTags(patches: readonly DeckTagPatch[]) {
    writeDeckQuery(updateDeckCardTagsInDeckQuery(readDeckQuery(), patches))
  }

  function updateDeckCacheCustomTags(
    cardPatches: readonly DeckCustomTagPatch[],
    tagCountPatches: readonly { id: string; cardCount: number }[],
  ) {
    writeDeckQuery(updateDeckCardCustomTagsInDeckQuery(readDeckQuery(), cardPatches, tagCountPatches))
  }

  function refetchDeckQueries() {
    void refetchActiveQueries(client)
  }
  // Apollo keeps previousData across variable changes, so only fall back to it
  // while refetching the *same* deck. Otherwise navigating deck A -> B would
  // render A under /decks/B until B loads.
  const deckQueryData = data?.deck ? data : previousData?.deck?.id === id ? previousData : data
  const deck = useMemo(() => flattenDeck(deckQueryData?.deck), [deckQueryData?.deck])
  const isInitialDeckLoading = isLoading && !deck
  const isRefreshingDeck = isLoading && Boolean(deck)
  usePageTitle(deck?.name ?? (isInitialDeckLoading ? "Deck" : "Deck not found"))
  const [isAddCardOpen, setIsAddCardOpen] = useState(false)
  const deckCards = useMemo(() => deck?.deckCards || [], [deck?.deckCards])
  const bulkAllocationPullList = useMemo(
    () =>
      createDeckPullList(
        shareMode ? [] : deckCards,
        selectedBulkAllocationItemIds,
        bulkAllocationMode,
      ),
    [bulkAllocationMode, deckCards, selectedBulkAllocationItemIds, shareMode],
  )
  const { copySharedDecklist, downloadSharedDecklist, shareCopyState } = useSharedDecklistActions(
    deck?.name || "deck",
    deckCards,
  )
  const deckPrice = useMemo(() => {
    if (!deck) return null

    const totalPrice = deckCardsTotalPrice(deckCards)
    return {
      label: formatUsdCents(totalPrice.totalCents),
      loading: false,
      unpricedQuantity: totalPrice.unpricedQuantity,
    }
  }, [deck, deckCards])

  const buylistPrice = useMemo(() => {
    if (!deck) return null

    const totalPrice = deckMissingCardsTotalPrice(deckCards)
    return {
      label: formatUsdCents(totalPrice.totalCents),
      loading: false,
      unpricedQuantity: totalPrice.unpricedQuantity,
    }
  }, [deck, deckCards])
  const deferredDeckAnalysis = useDeferredDeckAnalysis(deckCards)
  const deckStats = deferredDeckAnalysis?.stats ?? null
  const deckTokens = deferredDeckAnalysis?.tokens ?? null
  const stackDeckCards = useMemo(
    () =>
      deckCards.filter(
        (deckCard) => deckCard.zone !== "sideboard" && deckCard.zone !== "maybeboard",
      ),
    [deckCards],
  )
  const sideboardCards = useMemo(
    () => deckCards.filter((deckCard) => deckCard.zone === "sideboard").sort(compareDeckCards),
    [deckCards],
  )
  const maybeboardCards = useMemo(
    () => deckCards.filter((deckCard) => deckCard.zone === "maybeboard").sort(compareDeckCards),
    [deckCards],
  )
  const groupedCards = useMemo(
    () => groupDeckCards(stackDeckCards, groupBy),
    [stackDeckCards, groupBy],
  )
  const zoneCounts = useMemo(() => countDeckZones(deckCards), [deckCards])
  const selectionDeckCardIds = useMemo(
    () => [
      ...groupedCards.flatMap((group) => group.cards.map((deckCard) => deckCard.id)),
      ...sideboardCards.map((deckCard) => deckCard.id),
      ...maybeboardCards.map((deckCard) => deckCard.id),
    ],
    [groupedCards, sideboardCards, maybeboardCards],
  )
  const {
    allDeckCardsSelected,
    bulkActionError,
    bulkQuantity,
    clearSelectedDeckCards,
    highlightedDeckCardIds,
    isDeleteSelectedOpen,
    isSelectionActive,
    selectedDeckCardCount,
    selectedDeckCardIdList,
    selectedDeckCardIds,
    selectAllDeckCards,
    selectDeckCardIds,
    setBulkActionError,
    setBulkQuantity,
    setHighlightedDeckCardIds,
    setIsDeleteSelectedOpen,
    setIsSelectingCards,
    setTagError,
    tagError,
    toggleDeckCardSelected,
  } = useDeckDetailSelection(deckCards, selectionDeckCardIds)
  const selectedDeallocatableDeckCardIdList = useMemo(() => {
    const selectedIds = new Set(selectedDeckCardIdList)

    return deckCards
      .filter((deckCard) => selectedIds.has(deckCard.id) && deckCard.allocationStatus.allocated > 0)
      .map((deckCard) => deckCard.id)
  }, [deckCards, selectedDeckCardIdList])
  const hasBulkAllocationAvailable = useMemo(() => {
    if (shareMode) return false

    const availablePullList = createDeckPullList(deckCards, undefined, "any")

    return availablePullList.exactEntries.length > 0 || availablePullList.choices.length > 0
  }, [deckCards, shareMode])

  const [updateDeckCardMutation, updateDeckCardResult] = useMutation(UpdateDeckCardDocument)
  const updateDeckCard = {
    ...updateDeckCardResult,
    isPending: updateDeckCardResult.loading,
    mutate: mutateUpdateDeckCard,
  }

  function mutateUpdateDeckCard({ deckCardId, input }: UpdateDeckCardVariables) {
    const wasEditingCard = Boolean(editTarget)
    const wasMovingCard = Boolean(moveTarget)
    let context: UpdateDeckCardMutationContext = { isTagOnly: false, rollbackPatches: [] }

    if (isTagOnlyDeckCardUpdate(input)) {
      const optimisticTag = deckCardTagValue(input.tag)

      if (optimisticTag !== undefined) {
        const previousDeck = readDeckQuery()
        const previousTag = deckCardTagFromDeckQuery(previousDeck, deckCardId)
        const rollbackPatches: DeckTagPatch[] =
          previousTag === undefined
            ? []
            : [{ currentTag: optimisticTag, id: deckCardId, tag: previousTag }]

        updateDeckCacheTags([{ id: deckCardId, tag: optimisticTag }])
        context = { isTagOnly: true, optimisticTag, rollbackPatches }
      }
    }

    void updateDeckCardMutation({
      variables: { id: deckCardId, input },
      onCompleted: (data) => {
        const isTagOnly = context.isTagOnly || isTagOnlyDeckCardUpdate(input)

        if (isTagOnly) {
          const deckCard = data.updateDeckCard?.deckCard
          const tag = deckCardTagValue(deckCard?.tag)
          if (deckCard && tag !== undefined) {
            const patch: DeckTagPatch = { id: deckCard.id, tag }
            if (context.isTagOnly) patch.currentTag = context.optimisticTag

            updateDeckCacheTags([patch])
          }
        } else {
          refetchDeckQueries()
        }

        if (wasEditingCard) showToast("Card edited")
        if (wasMovingCard) showToast("Card moved")
        setEditTarget(null)
        setEditError(null)
        setMoveTarget(null)
        setMoveError(null)
        setTagError(null)
      },
      onError: (error) => {
        if (context.isTagOnly && context.rollbackPatches.length > 0) {
          updateDeckCacheTags(context.rollbackPatches)
        }

        const message = error instanceof Error ? error.message : "Could not update deck card"
        if (wasEditingCard) setEditError(message)
        else if (wasMovingCard) setMoveError(message)
        else setTagError(message)
      },
    })
  }

  const [deleteDeckCardMutation, deleteDeckCardResult] = useMutation(DeleteDeckCardDocument)
  const deleteDeckCard = {
    ...deleteDeckCardResult,
    isPending: deleteDeckCardResult.loading,
    mutate: (deckCardId: string) =>
      void deleteDeckCardMutation({
        variables: { id: deckCardId },
        onCompleted: () => {
          refetchDeckQueries()
          showToast("Card deleted from deck")
        },
        onError: () => undefined,
      }),
  }

  const [setDeckCommanderMutation, setDeckCommanderResult] = useMutation(SetDeckCommanderDocument)
  const setDeckCommander = {
    ...setDeckCommanderResult,
    isPending: setDeckCommanderResult.loading,
    mutate: (deckCardId: string) =>
      void setDeckCommanderMutation({
        variables: { id: deckCardId },
        onCompleted: () => {
          refetchDeckQueries()
          setMoveError(null)
        },
        onError: (error) =>
          setMoveError(error instanceof Error ? error.message : "Could not set commander"),
      }),
  }
  const [addDeckCardMutation, addDeckCardResult] = useMutation(AddDeckCardDocument)
  const addDeckCard = {
    ...addDeckCardResult,
    isPending: addDeckCardResult.loading,
    mutate: (input: DeckCardInput) =>
      void addDeckCardMutation({
        variables: { deckId: id, input },
        onCompleted: () => {
          refetchDeckQueries()
          showToast("Card added to deck")
        },
        onError: () => undefined,
      }),
  }

  const [optimizeDeckCardPrintingsMutation, optimizeDeckCardPrintingsResult] = useMutation(
    OptimizeDeckCardPrintingsDocument,
  )
  const optimizeDeckCardPrintings = {
    ...optimizeDeckCardPrintingsResult,
    isPending: optimizeDeckCardPrintingsResult.loading,
    mutate: (deckCardIds: string[]) =>
      void optimizeDeckCardPrintingsMutation({
        variables: { deckCardIds },
        onCompleted: (data) => {
          const optimizedCount = data.optimizeDeckCardPrintings?.deckCards.length || 0

          refetchDeckQueries()
          setIsOptimizePrintingsOpen(false)
          setOptimizePrintingsError(null)
          showToast(
            optimizedCount > 0
              ? `${pluralize(optimizedCount, "printing")} optimized`
              : "Printings already optimized",
          )
        },
        onError: (error) =>
          setOptimizePrintingsError(
            error instanceof Error ? error.message : "Could not optimize printings",
          ),
      }),
  }

  const [updateDeckCardsTagMutation, updateDeckCardsTagResult] = useMutation(
    UpdateDeckCardsTagDocument,
  )
  const updateDeckCardsTag = {
    ...updateDeckCardsTagResult,
    isPending: updateDeckCardsTagResult.loading,
    mutate: ({ deckCardIds, tag }: UpdateDeckCardsTagVariables) => {
      const previousDeck = readDeckQuery()
      const rollbackPatches = rollbackDeckCardTagPatches(previousDeck, deckCardIds, tag)

      updateDeckCacheTags(deckCardIds.map((deckCardId) => ({ id: deckCardId, tag })))

      void updateDeckCardsTagMutation({
        variables: { deckCardIds, tag },
        onCompleted: (data) => {
          const patches = (data.updateDeckCardsTag?.deckCards ?? [])
            .map((deckCard): DeckTagPatch | null => {
              const nextTag = deckCardTagValue(deckCard.tag)
              if (nextTag === undefined) return null
              return { currentTag: tag, id: deckCard.id, tag: nextTag }
            })
            .filter((patch): patch is DeckTagPatch => patch !== null)

          if (patches.length > 0) updateDeckCacheTags(patches)

          clearSelectedDeckCards()
          setIsSelectingCards(false)
          setBulkActionError(null)
          setTagError(null)
        },
        onError: (error) => {
          if (rollbackPatches.length) updateDeckCacheTags(rollbackPatches)

          setBulkActionError(
            error instanceof Error ? error.message : "Could not tag selected cards",
          )
        },
      })
    },
  }

  const [assignDeckCardTagMutation] = useMutation(AssignDeckCardTagDocument)
  const [unassignDeckCardTagMutation] = useMutation(UnassignDeckCardTagDocument)

  const [bulkUpdateDeckCardsMutation] = useMutation(BulkUpdateDeckCardsDocument)
  const bulkUpdateDeckCards = {
    isPending: isBulkUpdateDeckCardsPending,
    mutate: ({ deckCardIds, input }: { deckCardIds: string[]; input: DeckCardUpdateInput }) => {
      setIsBulkUpdateDeckCardsPending(true)
      // One server-side bulk mutation (a single transaction) instead of N single
      // updates. Refetch afterwards so the deck-level fields (cardCount, legality,
      // allocation status) reconcile.
      void bulkUpdateDeckCardsMutation({ variables: { deckCardIds, input } })
        .then(() => {
          clearSelectedDeckCards()
          setIsSelectingCards(false)
          setBulkActionError(null)
        })
        .catch((error) =>
          setBulkActionError(
            error instanceof Error ? error.message : "Could not update selected cards",
          ),
        )
        .finally(() => {
          refetchDeckQueries()
          setIsBulkUpdateDeckCardsPending(false)
        })
    },
  }

  const [bulkDeleteDeckCardsMutation] = useMutation(BulkDeleteDeckCardsDocument)
  const bulkDeleteDeckCards = {
    isPending: isBulkDeleteDeckCardsPending,
    mutate: (deckCardIds: string[]) => {
      setIsBulkDeleteDeckCardsPending(true)
      void bulkDeleteDeckCardsMutation({ variables: { deckCardIds } })
        .then(() => {
          showToast(`${pluralize(deckCardIds.length, "card")} deleted`)
          clearSelectedDeckCards()
          setIsSelectingCards(false)
          setIsDeleteSelectedOpen(false)
          setBulkActionError(null)
        })
        .catch((error) =>
          setBulkActionError(
            error instanceof Error ? error.message : "Could not delete selected cards",
          ),
        )
        .finally(() => {
          refetchDeckQueries()
          setIsBulkDeleteDeckCardsPending(false)
        })
    },
  }

  const [bulkDeallocateDeckCardsMutation] = useMutation(BulkDeallocateDeckCardsDocument)
  const bulkDeallocateDeckCards = {
    isPending: isBulkDeallocateDeckCardsPending,
    mutate: (deckCardIds: string[]) => {
      setIsBulkDeallocateDeckCardsPending(true)
      void bulkDeallocateDeckCardsMutation({ variables: { deckCardIds } })
        .then(({ data }) => {
          const deallocatedCount =
            data?.bulkDeallocateDeckCards?.deckCards.length ?? deckCardIds.length

          showToast(`${pluralize(deallocatedCount, "card")} deallocated`)
          clearSelectedDeckCards()
          setIsSelectingCards(false)
          setBulkActionError(null)
        })
        .catch((error) =>
          setBulkActionError(
            error instanceof Error ? error.message : "Could not deallocate selected cards",
          ),
        )
        .finally(() => {
          refetchDeckQueries()
          setIsBulkDeallocateDeckCardsPending(false)
        })
    },
  }

  function invalidateAllocationQueries() {
    refetchDeckQueries()
  }

  const allocateDeckCardItem = useDeckMutation(AllocateDeckCardItemDocument)
  const deallocateDeckCardItem = useDeckMutation(DeallocateDeckCardItemDocument)
  const allocateDeckCardProxy = useDeckMutation(AllocateDeckCardProxyDocument)
  const deallocateDeckCardProxy = useDeckMutation(DeallocateDeckCardProxyDocument)
  const allocateDeckPullList = {
    isPending: isAllocateDeckPullListPending,
    mutate: (entries: DeckPullListEntry[]) => {
      if (!deck) return

      setIsAllocateDeckPullListPending(true)
      // One server-side mutation applies the whole pull list in a single
      // transaction; per-entry requests contend for SQLite's database-wide
      // write lock and fail with busy errors.
      void client
        .mutate({
          mutation: AllocateDeckPullListDocument,
          variables: {
            deckId: deck.id,
            entries: entries.map((entry) => ({
              deckCardId: entry.deckCard.id,
              collectionItemId: entry.candidate.item.id,
              quantity: entry.quantity,
            })),
          },
        })
        .then(({ data }) => {
          const result = data?.allocateDeckPullList?.allocationResult

          if (result && result.skipped > 0) {
            setBulkAllocationError(
              `${pluralize(result.skipped, "entry", "entries")} could not be allocated`,
            )
            return
          }

          const allocatedCount =
            result?.allocated ?? entries.reduce((total, entry) => total + entry.quantity, 0)

          showToast(`${pluralize(allocatedCount, "card")} allocated`)
          setIsBulkAllocationOpen(false)
          setSelectedBulkAllocationItemIds({})
          setExcludedBulkAllocationEntryIds({})
          setBulkAllocationError(null)
        })
        .catch((error: unknown) => {
          setBulkAllocationError(error instanceof Error ? error.message : "Could not allocate deck")
        })
        .finally(() => {
          // Skipped entries still leave the applied ones committed, so always
          // reconcile the cache with the server instead of only on full success.
          invalidateAllocationQueries()
          setIsAllocateDeckPullListPending(false)
        })
    },
  }
  const allocationError =
    [
      allocateDeckCardItem,
      deallocateDeckCardItem,
      allocateDeckCardProxy,
      deallocateDeckCardProxy,
      deleteDeckCard,
      previewDeckDisassembly,
      disassembleDeck,
    ]
      .map((mutation) => mutation.error)
      .find((error): error is Error => error instanceof Error)?.message ?? null
  const isUpdatingDeckCard =
    updateDeckCard.isPending ||
    updateDeckCardsTag.isPending ||
    optimizeDeckCardPrintings.isPending ||
    bulkUpdateDeckCards.isPending ||
    bulkDeleteDeckCards.isPending ||
    bulkDeallocateDeckCards.isPending ||
    deleteDeckCard.isPending ||
    setDeckCommander.isPending ||
    allocateDeckCardItem.isPending ||
    deallocateDeckCardItem.isPending ||
    allocateDeckCardProxy.isPending ||
    deallocateDeckCardProxy.isPending

  if (isInitialDeckLoading) return <DeckDetailLoadingState />
  if (!deck) {
    return (
      <EmptyState
        title="Deck not found"
        description="This deck may have been deleted, moved, or unavailable while the local vault is syncing."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/decks">Back to decks</Link>
            </Button>
            <Button type="button" variant="outline" onClick={refetchDeckQueries}>
              Retry
            </Button>
          </div>
        }
      />
    )
  }

  if (shareMode && isSharePlaytestOpen) {
    return (
      <SharePlaytestOverlay
        deck={deck}
        deckCards={deckCards}
        onClose={() => setIsSharePlaytestOpen(false)}
      />
    )
  }

  const legalityIssues = deckLegalityIssues(deck.legality)
  const canEditDecklist = deck.status !== "archived"

  function moveDeckCard(deckCard: DeckCardEntry, zone: DeckZone) {
    updateDeckCard.mutate({ deckCardId: deckCard.id, input: { zone } })
  }

  function editDeckCard(deckCard: DeckCardEntry, input: DeckCardUpdateInput) {
    updateDeckCard.mutate({ deckCardId: deckCard.id, input })
  }

  function tagDeckCard(deckCard: DeckCardEntry, tag: DeckCardTag | null) {
    setTagError(null)
    updateDeckCard.mutate({ deckCardId: deckCard.id, input: { tag } })
  }

  function assignDeckCardTag(deckCard: DeckCardEntry, tagId: string) {
    const previousDeck = readDeckQuery()
    const previousTagIds = deckCard.tagIds ?? []
    const previousCardCount =
      previousDeck?.deck?.tags?.find((deckTag) => deckTag.id === tagId)?.cardCount ?? 0
    if (previousTagIds.includes(tagId)) return

    const opSeq = (customTagOpSeqRef.current.get(deckCard.id) ?? 0) + 1
    customTagOpSeqRef.current.set(deckCard.id, opSeq)
    const optimisticTagIds = [...previousTagIds, tagId]
    const optimisticCardCount = previousCardCount + deckCard.quantity
    updateDeckCacheCustomTags(
      [{ id: deckCard.id, tagIds: optimisticTagIds }],
      [{ id: tagId, cardCount: optimisticCardCount }],
    )

    void assignDeckCardTagMutation({
      variables: { deckCardId: deckCard.id, tagId },
      onCompleted: (data) => {
        // A newer assign/unassign for this card superseded us; its optimistic
        // state is authoritative, so skip reconciling a stale response.
        if (customTagOpSeqRef.current.get(deckCard.id) !== opSeq) return
        const assignedDeckCard = data.assignDeckCardTag?.deckCard
        const deckTags = data.assignDeckCardTag?.deckTags ?? []
        if (assignedDeckCard) {
          updateDeckCacheCustomTags(
            [{ id: assignedDeckCard.id, tagIds: assignedDeckCard.tagIds }],
            deckTags,
          )
        }
      },
      onError: (error) => {
        if (customTagOpSeqRef.current.get(deckCard.id) !== opSeq) return
        updateDeckCacheCustomTags(
          [{ id: deckCard.id, tagIds: previousTagIds }],
          [{ id: tagId, cardCount: previousCardCount }],
        )
        showToast(error instanceof Error ? error.message : "Could not assign tag")
      },
    })
  }

  function unassignDeckCardTag(deckCard: DeckCardEntry, tagId: string) {
    const previousDeck = readDeckQuery()
    const previousTagIds = deckCard.tagIds ?? []
    const previousCardCount =
      previousDeck?.deck?.tags?.find((deckTag) => deckTag.id === tagId)?.cardCount ?? 0
    if (!previousTagIds.includes(tagId)) return

    const opSeq = (customTagOpSeqRef.current.get(deckCard.id) ?? 0) + 1
    customTagOpSeqRef.current.set(deckCard.id, opSeq)
    const optimisticTagIds = previousTagIds.filter((id) => id !== tagId)
    const optimisticCardCount = Math.max(previousCardCount - deckCard.quantity, 0)
    updateDeckCacheCustomTags(
      [{ id: deckCard.id, tagIds: optimisticTagIds }],
      [{ id: tagId, cardCount: optimisticCardCount }],
    )

    void unassignDeckCardTagMutation({
      variables: { deckCardId: deckCard.id, tagId },
      onCompleted: (data) => {
        if (customTagOpSeqRef.current.get(deckCard.id) !== opSeq) return
        const unassignedDeckCard = data.unassignDeckCardTag?.deckCard
        const deckTags = data.unassignDeckCardTag?.deckTags ?? []
        if (unassignedDeckCard) {
          updateDeckCacheCustomTags(
            [{ id: unassignedDeckCard.id, tagIds: unassignedDeckCard.tagIds }],
            deckTags,
          )
        }
      },
      onError: (error) => {
        if (customTagOpSeqRef.current.get(deckCard.id) !== opSeq) return
        updateDeckCacheCustomTags(
          [{ id: deckCard.id, tagIds: previousTagIds }],
          [{ id: tagId, cardCount: previousCardCount }],
        )
        showToast(error instanceof Error ? error.message : "Could not remove tag")
      },
    })
  }

  function jumpToTag(tagId: string) {
    if (activeTagId === tagId) {
      setActiveTagId(null)
      setHighlightedDeckCardIds(null)
      return
    }
    const matchingIds = deckCards
      .filter((deckCard) => (deckCard.tagIds ?? []).includes(tagId))
      .map((deckCard) => deckCard.id)
    setActiveTagId(tagId)
    setHighlightedDeckCardIds(new Set(matchingIds))
  }

  function tagSelectedDeckCards(tag: DeckCardTag | null) {
    if (selectedDeckCardIdList.length === 0) return
    setBulkActionError(null)
    updateDeckCardsTag.mutate({ deckCardIds: selectedDeckCardIdList, tag })
  }

  function updateSelectedDeckCards(input: DeckCardUpdateInput) {
    if (selectedDeckCardIdList.length === 0) return
    setBulkActionError(null)
    bulkUpdateDeckCards.mutate({ deckCardIds: selectedDeckCardIdList, input })
  }

  function deallocateSelectedDeckCards() {
    if (selectedDeallocatableDeckCardIdList.length === 0) return
    setBulkActionError(null)
    bulkDeallocateDeckCards.mutate(selectedDeallocatableDeckCardIdList)
  }

  function deleteSelectedDeckCards() {
    if (selectedDeckCardIdList.length === 0) return
    setBulkActionError(null)
    bulkDeleteDeckCards.mutate(selectedDeckCardIdList)
  }

  function deleteSelectedDeckCard() {
    if (!deleteCardTarget) return
    deleteDeckCard.mutate(deleteCardTarget.id)
  }

  function previewCurrentDeckDisassembly() {
    if (!deck) return
    setDisassemblyResult(null)
    previewDeckDisassembly.mutate(deck.id)
  }

  function disassembleCurrentDeck() {
    if (!deck) return
    disassembleDeck.mutate(deck.id)
  }

  function addEdhrecCard(card: EDHRecCard | EDHRecSectionCard, zone: EDHRecAddZone) {
    addDeckCard.mutate({
      finish: "nonfoil",
      name: card.name,
      preferredPrintingId: edhrecCardPrintingId(card),
      quantity: 1,
      zone,
    })
  }

  function setEdhrecState(tab: EDHRecTab | undefined, excludeLands = edhrecExcludeLands) {
    navigate({
      to: "/decks/$id",
      params: { id },
      search: {
        edhrec: tab,
        edhrecExcludeLands: tab && excludeLands ? true : undefined,
      },
    })
  }

  return (
    <>
      <DeckDetailContent
        allocationError={allocationError}
        allocationActions={{
          onAllocate: (deckCard, collectionItemId) =>
            allocateDeckCardItem.mutate({ deckCardId: deckCard.id, collectionItemId }),
          onDeallocate: (deckCard, collectionItemId) =>
            deallocateDeckCardItem.mutate({ deckCardId: deckCard.id, collectionItemId }),
          onToggleProxy: (deckCard) => {
            const status = deckCard.allocationStatus

            if (status.proxyAllocated > 0) {
              deallocateDeckCardProxy.mutate({
                deckCardId: deckCard.id,
                quantity: status.proxyAllocated,
              })
            } else {
              const quantity = Math.max(status.required - status.allocated, 0)

              if (quantity > 0) {
                allocateDeckCardProxy.mutate({ deckCardId: deckCard.id, quantity })
              }
            }
          },
        }}
        cardActions={{
          onAssignTag: assignDeckCardTag,
          onDeleteCard: setDeleteCardTarget,
          onEditCard: (deckCard) => {
            setEditError(null)
            setEditTarget(deckCard)
          },
          onMoveCard: (deckCard) => {
            setMoveError(null)
            setMoveTarget(deckCard)
          },
          onPreviewCard: setPreviewDeckCard,
          onSetCommander: (deckCard) => setDeckCommander.mutate(deckCard.id),
          onTagCard: tagDeckCard,
          onUnassignTag: unassignDeckCardTag,
        }}
        selection={{
          allDeckCardsSelected,
          bulkActionError: bulkActionError || tagError,
          bulkQuantity,
          highlightedDeckCardIds,
          isSelectionActive,
          selectedDeckCardCount,
          selectedDeckCardIds,
          onClearSelectedDeckCards: () => {
            clearSelectedDeckCards()
            setIsSelectingCards(false)
          },
          onDeallocateSelectedDeckCards: deallocateSelectedDeckCards,
          onHighlightDeckCards: setHighlightedDeckCardIds,
          onOpenDeleteSelected: () => setIsDeleteSelectedOpen(true),
          onOpenSelectFromList: () => setIsSelectFromListOpen(true),
          onSelectAllDeckCards: selectAllDeckCards,
          onSetBulkQuantity: setBulkQuantity,
          onStartSelecting: () => setIsSelectingCards(true),
          onTagSelectedDeckCards: tagSelectedDeckCards,
          onToggleSelected: toggleDeckCardSelected,
          onUpdateSelectedDeckCards: updateSelectedDeckCards,
        }}
        canEditDecklist={canEditDecklist}
        canBulkAllocate={hasBulkAllocationAvailable}
        deck={deck}
        deckCards={deckCards}
        deckStats={deckStats}
        deckTags={deck.tags}
        deckTokens={deckTokens}
        tagManagement={{
          activeTagId,
          onJumpToTag: jumpToTag,
          onCreateTag: deckTags.createTag,
          onUpdateTag: deckTags.updateTag,
          onDeleteTag: deckTags.deleteTag,
          onReorderTags: deckTags.reorderTags,
        }}
        groupBy={groupBy}
        groupedCards={groupedCards}
        isUpdatingDeckCard={isUpdatingDeckCard}
        isRefreshingDeck={isRefreshingDeck}
        legalityIssues={legalityIssues}
        maybeboardCards={maybeboardCards}
        onCopySharedDecklist={copySharedDecklist}
        onDownloadSharedDecklist={downloadSharedDecklist}
        onEditDeck={() => setIsEditDeckOpen(true)}
        onExportDeck={() => setIsExportDeckOpen(true)}
        onGroupByChange={setGroupBy}
        onImportDeck={() => setIsImportDeckOpen(true)}
        onMissingCards={() => setIsMissingCardsOpen(true)}
        onOpenAddCard={() => setIsAddCardOpen(true)}
        onDisassemble={previewCurrentDeckDisassembly}
        onOpenEdhrec={() => setEdhrecState("recs")}
        onOpenShareDeck={() => setIsShareDeckOpen(true)}
        onOpenShareBuylist={() => setIsShareBuylistOpen(true)}
        onOpenSharePlaytest={() => setIsSharePlaytestOpen(true)}
        onOpenBulkAllocation={() => {
          setBulkAllocationError(null)
          setIsBulkAllocationOpen(true)
        }}
        onOpenOptimizePrintings={() => {
          setOptimizePrintingsError(null)
          setIsOptimizePrintingsOpen(true)
        }}
        deckPrice={deckPrice}
        buylistPrice={buylistPrice}
        shareCopyState={shareCopyState}
        shareMode={shareMode}
        sideboardCards={sideboardCards}
        zoneCounts={zoneCounts}
      />
      <DeckDetailDialogs
        addCardError={addDeckCard.error instanceof Error ? addDeckCard.error.message : null}
        bulkAllocationError={bulkAllocationError}
        bulkAllocationMode={bulkAllocationMode}
        bulkAllocationOpen={canEditDecklist && isBulkAllocationOpen}
        bulkAllocationPullList={bulkAllocationPullList}
        deck={deck}
        deleteCardTarget={canEditDecklist ? deleteCardTarget : null}
        editError={editError}
        editTarget={canEditDecklist ? editTarget : null}
        edhrecExcludeLands={edhrecExcludeLands}
        edhrecTab={canEditDecklist ? edhrecTab : undefined}
        isAddCardOpen={canEditDecklist && isAddCardOpen}
        isAddingCard={addDeckCard.isPending}
        isBulkAllocating={allocateDeckPullList.isPending}
        disassemblyResult={canEditDecklist ? disassemblyResult : null}
        isDeleteSelectedOpen={canEditDecklist && isDeleteSelectedOpen}
        isEditDeckOpen={isEditDeckOpen}
        isExportDeckOpen={isExportDeckOpen}
        isImportDeckOpen={canEditDecklist && isImportDeckOpen}
        isMissingCardsOpen={isMissingCardsOpen}
        isSelectFromListOpen={canEditDecklist && isSelectFromListOpen}
        isShareDeckOpen={isShareDeckOpen}
        isDisassemblingDeck={disassembleDeck.isPending}
        isUpdatingDeckCard={isUpdatingDeckCard}
        optimizePrintingsError={optimizePrintingsError}
        optimizePrintingsOpen={canEditDecklist && isOptimizePrintingsOpen}
        mayCloseDeleteSelected={!bulkDeleteDeckCards.isPending}
        moveError={moveError}
        moveTarget={canEditDecklist ? moveTarget : null}
        onAddCardOpenChange={setIsAddCardOpen}
        onBulkAllocationModeChange={(mode) => {
          setBulkAllocationMode(mode)
          setSelectedBulkAllocationItemIds({})
          setExcludedBulkAllocationEntryIds({})
          setBulkAllocationError(null)
        }}
        onAddEdhrecCard={addEdhrecCard}
        onCloseBulkAllocation={() => {
          if (!allocateDeckPullList.isPending) {
            setIsBulkAllocationOpen(false)
            setExcludedBulkAllocationEntryIds({})
            setBulkAllocationError(null)
          }
        }}
        onCloseEditCard={() => {
          if (!updateDeckCard.isPending) {
            setEditError(null)
            setEditTarget(null)
          }
        }}
        onCloseMoveCard={() => {
          if (!updateDeckCard.isPending) {
            setMoveError(null)
            setMoveTarget(null)
          }
        }}
        onConfirmBulkAllocation={() => {
          setBulkAllocationError(null)
          allocateDeckPullList.mutate(
            allocatableDeckPullListEntries(bulkAllocationPullList, excludedBulkAllocationEntryIds),
          )
        }}
        onDeleteCardTargetChange={setDeleteCardTarget}
        onConfirmDeckDisassembly={disassembleCurrentDeck}
        onDisassemblyOpenChange={(open) => {
          if (!open && !disassembleDeck.isPending) setDisassemblyResult(null)
        }}
        onDeleteSelectedCard={deleteSelectedDeckCard}
        onDeleteSelectedDeckCards={deleteSelectedDeckCards}
        onDeleteSelectedOpenChange={setIsDeleteSelectedOpen}
        onEditCard={(input) => {
          if (editTarget) editDeckCard(editTarget, input)
        }}
        onEditDeckOpenChange={setIsEditDeckOpen}
        onExportDeckOpenChange={setIsExportDeckOpen}
        onImportDeckOpenChange={setIsImportDeckOpen}
        onMissingCardsOpenChange={setIsMissingCardsOpen}
        onOptimizePrintingsOpenChange={(open) => {
          if (!optimizeDeckCardPrintings.isPending) {
            setIsOptimizePrintingsOpen(open)
            setOptimizePrintingsError(null)
          }
        }}
        onOptimizePrintingsSubmit={(deckCardIds) => {
          setOptimizePrintingsError(null)
          optimizeDeckCardPrintings.mutate(deckCardIds)
        }}
        onMoveCard={(zone) => {
          if (moveTarget) moveDeckCard(moveTarget, zone)
        }}
        onPreviewCardOpenChange={(open) => {
          if (!open) setPreviewDeckCard(null)
        }}
        onSetEdhrecState={setEdhrecState}
        onSelectDeckCardsFromList={selectDeckCardIds}
        onSelectFromListOpenChange={setIsSelectFromListOpen}
        onSelectBulkAllocationChoice={(choiceId, collectionItemId) => {
          setSelectedBulkAllocationItemIds((selectedItemIds) => ({
            ...selectedItemIds,
            [choiceId]: collectionItemId,
          }))
          setBulkAllocationError(null)
        }}
        onToggleBulkAllocationEntry={(entryId, excluded) => {
          setExcludedBulkAllocationEntryIds((entryIds) => ({
            ...entryIds,
            [entryId]: excluded,
          }))
          setBulkAllocationError(null)
        }}
        onShareDeckOpenChange={setIsShareDeckOpen}
        excludedBulkAllocationEntryIds={excludedBulkAllocationEntryIds}
        previewDeckCard={previewDeckCard}
        selectedBulkAllocationItemIds={selectedBulkAllocationItemIds}
        selectedDeckCardCount={selectedDeckCardCount}
        shareMode={shareMode}
        updateDeckCardPending={updateDeckCard.isPending}
        zoneCounts={zoneCounts}
      />
      {shareMode ? (
        <ShareDeckBuylistDialog
          deck={deck}
          onOpenChange={setIsShareBuylistOpen}
          open={isShareBuylistOpen}
          shareToken={id}
        />
      ) : null}
    </>
  )
}
