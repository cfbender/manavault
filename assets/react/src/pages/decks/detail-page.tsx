import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { EmptyState } from "../../components/card-image"
import { useToast } from "../../components/ui/toast"
import type { DeckCardInput, DeckCardUpdateInput, DeckQuery } from "../../gql/graphql"
import { groupDeckCards, type DeckGroupBy } from "../../lib/deck-grouping"
import { graphqlEndpointContext, refetchActiveQueries } from "../../lib/apollo"
import { pluralize } from "../../lib/utils"
import { deckCardsTotalPrice, formatUsdCents } from "./buylist-export"
import {
  allocatableDeckPullListEntries,
  createDeckPullList,
  type DeckPullListEntry,
  type DeckPullListExclusions,
  type DeckPullListMode,
} from "./deck-allocation-model"
import { updateDeckCardTagsInDeckQuery, type DeckTagPatch } from "./deck-query-cache"
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
  AllocateDeckCardProxyDocument,
  DeallocateDeckCardItemDocument,
  DeallocateDeckCardProxyDocument,
  DeckDocument,
  DeleteDeckCardDocument,
  DisassembleDeckDocument,
  PreviewDeckDisassemblyDocument,
  OptimizeDeckCardPrintingsDocument,
  SetDeckCommanderDocument,
  UpdateDeckCardDocument,
  UpdateDeckCardsTagDocument,
} from "./queries"

type UpdateDeckCardVariables = { deckCardId: string; input: DeckCardUpdateInput }
type UpdateDeckCardMutationContext =
  | { isTagOnly: false; rollbackPatches: [] }
  | { isTagOnly: true; optimisticTag: DeckCardTag | null; rollbackPatches: DeckTagPatch[] }
type UpdateDeckCardsTagVariables = { deckCardIds: string[]; tag: DeckCardTag | null }
type UpdateDeckCardsTagMutationContext = {
  optimisticTag: DeckCardTag | null
  rollbackPatches: DeckTagPatch[]
}

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
  const [isAllocateDeckPullListPending, setIsAllocateDeckPullListPending] = useState(false)
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
          showToast("Deck disassembled")
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
  } = useQuery(DeckDocument, {
    variables: { id },
    context: shareMode ? graphqlEndpointContext("/share/graphql") : undefined,
    fetchPolicy: "cache-and-network",
  })

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

  function refetchDeckQueries() {
    void refetchActiveQueries(client)
  }
  const deckQueryData = data?.deck ? data : previousData?.deck ? previousData : data
  const deck = useMemo(() => flattenDeck(deckQueryData?.deck), [deckQueryData?.deck])
  const isInitialDeckLoading = isLoading && !deck
  const isRefreshingDeck = isLoading && Boolean(deck)
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
  const buylistPrice = useMemo(() => {
    if (!deck) return null

    const totalPrice = deckCardsTotalPrice(deckCards)
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
    setBulkActionError,
    setBulkQuantity,
    setHighlightedDeckCardIds,
    setIsDeleteSelectedOpen,
    setIsSelectingCards,
    setTagError,
    tagError,
    toggleDeckCardSelected,
  } = useDeckDetailSelection(deckCards, selectionDeckCardIds)
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

  const [bulkUpdateDeckCardMutation] = useMutation(UpdateDeckCardDocument)
  const bulkUpdateDeckCards = {
    isPending: isBulkUpdateDeckCardsPending,
    mutate: ({ deckCardIds, input }: { deckCardIds: string[]; input: DeckCardUpdateInput }) => {
      setIsBulkUpdateDeckCardsPending(true)
      void Promise.all(
        deckCardIds.map((deckCardId) =>
          bulkUpdateDeckCardMutation({ variables: { id: deckCardId, input } }),
        ),
      )
        .then(() => {
          refetchDeckQueries()
          clearSelectedDeckCards()
          setIsSelectingCards(false)
          setBulkActionError(null)
        })
        .catch((error) =>
          setBulkActionError(
            error instanceof Error ? error.message : "Could not update selected cards",
          ),
        )
        .finally(() => setIsBulkUpdateDeckCardsPending(false))
    },
  }

  const [bulkDeleteDeckCardMutation] = useMutation(DeleteDeckCardDocument)
  const bulkDeleteDeckCards = {
    isPending: isBulkDeleteDeckCardsPending,
    mutate: (deckCardIds: string[]) => {
      setIsBulkDeleteDeckCardsPending(true)
      void Promise.all(
        deckCardIds.map((deckCardId) =>
          bulkDeleteDeckCardMutation({ variables: { id: deckCardId } }),
        ),
      )
        .then(() => {
          refetchDeckQueries()
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
        .finally(() => setIsBulkDeleteDeckCardsPending(false))
    },
  }

  function invalidateAllocationQueries() {
    refetchDeckQueries()
  }

  const [allocateDeckCardItemMutation, allocateDeckCardItemResult] = useMutation(
    AllocateDeckCardItemDocument,
  )
  const allocateDeckCardItem = {
    ...allocateDeckCardItemResult,
    isPending: allocateDeckCardItemResult.loading,
    mutate: ({ collectionItemId, deckCardId }: { collectionItemId: string; deckCardId: string }) =>
      void allocateDeckCardItemMutation({
        variables: { deckCardId, collectionItemId },
        onCompleted: invalidateAllocationQueries,
        onError: () => undefined,
      }),
  }
  const [deallocateDeckCardItemMutation, deallocateDeckCardItemResult] = useMutation(
    DeallocateDeckCardItemDocument,
  )
  const deallocateDeckCardItem = {
    ...deallocateDeckCardItemResult,
    isPending: deallocateDeckCardItemResult.loading,
    mutate: ({ collectionItemId, deckCardId }: { collectionItemId: string; deckCardId: string }) =>
      void deallocateDeckCardItemMutation({
        variables: { deckCardId, collectionItemId },
        onCompleted: invalidateAllocationQueries,
        onError: () => undefined,
      }),
  }
  const [allocateDeckCardProxyMutation, allocateDeckCardProxyResult] = useMutation(
    AllocateDeckCardProxyDocument,
  )
  const allocateDeckCardProxy = {
    ...allocateDeckCardProxyResult,
    isPending: allocateDeckCardProxyResult.loading,
    mutate: ({ deckCardId, quantity }: { deckCardId: string; quantity: number }) =>
      void allocateDeckCardProxyMutation({
        variables: { deckCardId, quantity },
        onCompleted: invalidateAllocationQueries,
        onError: () => undefined,
      }),
  }
  const [deallocateDeckCardProxyMutation, deallocateDeckCardProxyResult] = useMutation(
    DeallocateDeckCardProxyDocument,
  )
  const deallocateDeckCardProxy = {
    ...deallocateDeckCardProxyResult,
    isPending: deallocateDeckCardProxyResult.loading,
    mutate: ({ deckCardId, quantity }: { deckCardId: string; quantity: number }) =>
      void deallocateDeckCardProxyMutation({
        variables: { deckCardId, quantity },
        onCompleted: invalidateAllocationQueries,
        onError: () => undefined,
      }),
  }
  const allocateDeckPullList = {
    isPending: isAllocateDeckPullListPending,
    mutate: (entries: DeckPullListEntry[]) => {
      setIsAllocateDeckPullListPending(true)
      void (async () => {
        for (const entry of entries) {
          for (let copy = 0; copy < entry.quantity; copy += 1) {
            await client.mutate({
              mutation: AllocateDeckCardItemDocument,
              variables: {
                deckCardId: entry.deckCard.id,
                collectionItemId: entry.candidate.item.id,
              },
            })
          }
        }
      })()
        .then(() => {
          const allocatedCount = entries.reduce((total, entry) => total + entry.quantity, 0)

          invalidateAllocationQueries()
          showToast(`${pluralize(allocatedCount, "card")} allocated`)
          setIsBulkAllocationOpen(false)
          setSelectedBulkAllocationItemIds({})
          setExcludedBulkAllocationEntryIds({})
          setBulkAllocationError(null)
        })
        .catch((error) =>
          setBulkAllocationError(
            error instanceof Error ? error.message : "Could not allocate deck",
          ),
        )
        .finally(() => setIsAllocateDeckPullListPending(false))
    },
  }
  const allocationError =
    allocateDeckCardItem.error instanceof Error
      ? allocateDeckCardItem.error.message
      : deallocateDeckCardItem.error instanceof Error
        ? deallocateDeckCardItem.error.message
        : allocateDeckCardProxy.error instanceof Error
          ? allocateDeckCardProxy.error.message
          : deallocateDeckCardProxy.error instanceof Error
            ? deallocateDeckCardProxy.error.message
            : deleteDeckCard.error instanceof Error
              ? deleteDeckCard.error.message
              : previewDeckDisassembly.error instanceof Error
                ? previewDeckDisassembly.error.message
                : disassembleDeck.error instanceof Error
                  ? disassembleDeck.error.message
                  : null
  const isUpdatingDeckCard =
    updateDeckCard.isPending ||
    updateDeckCardsTag.isPending ||
    optimizeDeckCardPrintings.isPending ||
    bulkUpdateDeckCards.isPending ||
    bulkDeleteDeckCards.isPending ||
    deleteDeckCard.isPending ||
    setDeckCommander.isPending ||
    allocateDeckCardItem.isPending ||
    deallocateDeckCardItem.isPending ||
    allocateDeckCardProxy.isPending ||
    deallocateDeckCardProxy.isPending

  if (isInitialDeckLoading) return <EmptyState title="Loading deck..." />
  if (!deck) return <EmptyState title="Deck not found" />

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
        allDeckCardsSelected={allDeckCardsSelected}
        bulkActionError={bulkActionError || tagError}
        bulkQuantity={bulkQuantity}
        canBulkAllocate={hasBulkAllocationAvailable}
        deck={deck}
        deckCards={deckCards}
        deckStats={deckStats}
        deckTokens={deckTokens}
        groupBy={groupBy}
        groupedCards={groupedCards}
        highlightedDeckCardIds={highlightedDeckCardIds}
        isBulkAllocating={allocateDeckPullList.isPending}
        isSelectionActive={isSelectionActive}
        isUpdatingDeckCard={isUpdatingDeckCard}
        isRefreshingDeck={isRefreshingDeck}
        legalityIssues={legalityIssues}
        maybeboardCards={maybeboardCards}
        onAllocate={(deckCard, collectionItemId) =>
          allocateDeckCardItem.mutate({ deckCardId: deckCard.id, collectionItemId })
        }
        onClearSelectedDeckCards={clearSelectedDeckCards}
        onCopySharedDecklist={copySharedDecklist}
        onDeallocate={(deckCard, collectionItemId) =>
          deallocateDeckCardItem.mutate({ deckCardId: deckCard.id, collectionItemId })
        }
        onDeleteCard={setDeleteCardTarget}
        onDownloadSharedDecklist={downloadSharedDecklist}
        onEditCard={(deckCard) => {
          setEditError(null)
          setEditTarget(deckCard)
        }}
        onEditDeck={() => setIsEditDeckOpen(true)}
        onExportDeck={() => setIsExportDeckOpen(true)}
        onGroupByChange={setGroupBy}
        onHighlightDeckCards={setHighlightedDeckCardIds}
        onImportDeck={() => setIsImportDeckOpen(true)}
        onMissingCards={() => setIsMissingCardsOpen(true)}
        onMoveCard={(deckCard) => {
          setMoveError(null)
          setMoveTarget(deckCard)
        }}
        onOpenAddCard={() => setIsAddCardOpen(true)}
        onDisassemble={previewCurrentDeckDisassembly}
        onOpenDeleteSelected={() => setIsDeleteSelectedOpen(true)}
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
        onPreviewCard={setPreviewDeckCard}
        onSelectAllDeckCards={selectAllDeckCards}
        onSetBulkQuantity={setBulkQuantity}
        onSetCommander={(deckCard) => setDeckCommander.mutate(deckCard.id)}
        onTagCard={tagDeckCard}
        onTagSelectedDeckCards={tagSelectedDeckCards}
        onToggleProxy={(deckCard) => {
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
        }}
        onToggleSelected={toggleDeckCardSelected}
        onUpdateSelectedDeckCards={updateSelectedDeckCards}
        selectedDeckCardCount={selectedDeckCardCount}
        selectedDeckCardIds={selectedDeckCardIds}
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
        bulkAllocationOpen={isBulkAllocationOpen}
        bulkAllocationPullList={bulkAllocationPullList}
        deck={deck}
        deleteCardTarget={deleteCardTarget}
        editError={editError}
        editTarget={editTarget}
        edhrecExcludeLands={edhrecExcludeLands}
        edhrecTab={edhrecTab}
        isAddCardOpen={isAddCardOpen}
        isAddingCard={addDeckCard.isPending}
        isBulkAllocating={allocateDeckPullList.isPending}
        disassemblyResult={disassemblyResult}
        isDeleteSelectedOpen={isDeleteSelectedOpen}
        isEditDeckOpen={isEditDeckOpen}
        isExportDeckOpen={isExportDeckOpen}
        isImportDeckOpen={isImportDeckOpen}
        isMissingCardsOpen={isMissingCardsOpen}
        isShareDeckOpen={isShareDeckOpen}
        isDisassemblingDeck={disassembleDeck.isPending}
        isUpdatingDeckCard={isUpdatingDeckCard}
        optimizePrintingsError={optimizePrintingsError}
        optimizePrintingsOpen={isOptimizePrintingsOpen}
        mayCloseDeleteSelected={!bulkDeleteDeckCards.isPending}
        moveError={moveError}
        moveTarget={moveTarget}
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
