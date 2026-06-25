import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { EmptyState } from "../../components/card-image"
import type { DeckCardInput, DeckCardUpdateInput } from "../../gql/graphql"
import { groupDeckCards, type DeckGroupBy } from "../../lib/deck-grouping"
import { request } from "../../lib/graphql"
import { present } from "../../lib/utils"
import { deckCardsTotalPrice, formatUsdCents } from "./buylist-export"
import { createDeckPullList, selectedDeckPullListEntries, type DeckPullListMode } from "./deck-allocation-model"
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
import { ShareDeckBuylistDialog, SharePlaytestOverlay, useSharedDecklistActions } from "./detail-page-share"
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
  SetDeckCommanderDocument,
  UpdateDeckCardDocument,
  UpdateDeckCardsTagDocument,
} from "./queries"

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
  const [bulkAllocationError, setBulkAllocationError] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const previewDeckDisassembly = useMutation({
    mutationFn: (deckId: string) => request(PreviewDeckDisassemblyDocument, { id: deckId }),
    onSuccess: (data) => {
      setDisassemblyResult(data.previewDeckDisassembly?.disassemblyResult ?? null)
    },
  })
  const disassembleDeck = useMutation({
    mutationFn: (deckId: string) => request(DisassembleDeckDocument, { id: deckId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.invalidateQueries({ queryKey: ["deck-buylist", id] })
      queryClient.invalidateQueries({ queryKey: ["deck-edhrec", id] })
      queryClient.invalidateQueries({ queryKey: ["collection"] })
      queryClient.invalidateQueries({ queryKey: ["collection-items"] })
      queryClient.invalidateQueries({ queryKey: ["location"] })
      queryClient.invalidateQueries({ queryKey: ["home"] })
      queryClient.removeQueries({ queryKey: ["deck", id], exact: true })
      setDisassemblyResult(null)
      navigate({ to: "/decks" })
    },
  })
  const { data, isLoading } = useQuery({
    queryKey: [shareMode ? "shared-deck" : "deck", id],
    queryFn: () =>
      request(DeckDocument, { id }, shareMode ? { endpoint: "/share/graphql" } : undefined),
  })
  const deck = useMemo(() => flattenDeck(data?.deck), [data?.deck])
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
  const previewDeckCards = useMemo(() => {
    const deckCardById = new Map(deckCards.map((deckCard) => [deckCard.id, deckCard]))
    return selectionDeckCardIds.map((deckCardId) => deckCardById.get(deckCardId)).filter(present)
  }, [deckCards, selectionDeckCardIds])
  const hasBulkAllocationAvailable = useMemo(() => {
    if (shareMode) return false

    const availablePullList = createDeckPullList(deckCards, undefined, "any")

    return availablePullList.exactEntries.length > 0 || availablePullList.choices.length > 0
  }, [deckCards, shareMode])

  const updateDeckCard = useMutation({
    mutationFn: ({ deckCardId, input }: { deckCardId: string; input: DeckCardUpdateInput }) =>
      request(UpdateDeckCardDocument, { id: deckCardId, input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.invalidateQueries({ queryKey: ["deck-buylist", id] })
      setEditTarget(null)
      setEditError(null)
      setMoveTarget(null)
      setMoveError(null)
      setTagError(null)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not update deck card"
      if (editTarget) setEditError(message)
      else if (moveTarget) setMoveError(message)
      else setTagError(message)
    },
  })

  const deleteDeckCard = useMutation({
    mutationFn: (deckCardId: string) => request(DeleteDeckCardDocument, { id: deckCardId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.invalidateQueries({ queryKey: ["deck-buylist", id] })
    },
  })

  const setDeckCommander = useMutation({
    mutationFn: (deckCardId: string) => request(SetDeckCommanderDocument, { id: deckCardId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      setMoveError(null)
    },
    onError: (error) =>
      setMoveError(error instanceof Error ? error.message : "Could not set commander"),
  })
  const addDeckCard = useMutation({
    mutationFn: (input: DeckCardInput) => request(AddDeckCardDocument, { deckId: id, input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.invalidateQueries({ queryKey: ["deck-buylist", id] })
      queryClient.invalidateQueries({ queryKey: ["deck-edhrec", id] })
    },
  })

  const updateDeckCardsTag = useMutation({
    mutationFn: ({ deckCardIds, tag }: { deckCardIds: string[]; tag: DeckCardTag | null }) =>
      request(UpdateDeckCardsTagDocument, { deckCardIds, tag }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      clearSelectedDeckCards()
      setIsSelectingCards(false)
      setBulkActionError(null)
      setTagError(null)
    },
    onError: (error) =>
      setBulkActionError(error instanceof Error ? error.message : "Could not tag selected cards"),
  })

  const bulkUpdateDeckCards = useMutation({
    mutationFn: ({ deckCardIds, input }: { deckCardIds: string[]; input: DeckCardUpdateInput }) =>
      Promise.all(
        deckCardIds.map((deckCardId) => request(UpdateDeckCardDocument, { id: deckCardId, input })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.invalidateQueries({ queryKey: ["deck-buylist", id] })
      clearSelectedDeckCards()
      setIsSelectingCards(false)
      setBulkActionError(null)
    },
    onError: (error) =>
      setBulkActionError(
        error instanceof Error ? error.message : "Could not update selected cards",
      ),
  })

  const bulkDeleteDeckCards = useMutation({
    mutationFn: (deckCardIds: string[]) =>
      Promise.all(
        deckCardIds.map((deckCardId) => request(DeleteDeckCardDocument, { id: deckCardId })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deck", id] })
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      queryClient.invalidateQueries({ queryKey: ["deck-buylist", id] })
      clearSelectedDeckCards()
      setIsSelectingCards(false)
      setIsDeleteSelectedOpen(false)
      setBulkActionError(null)
    },
    onError: (error) =>
      setBulkActionError(
        error instanceof Error ? error.message : "Could not delete selected cards",
      ),
  })

  function invalidateAllocationQueries() {
    queryClient.invalidateQueries({ queryKey: ["deck", id] })
    queryClient.invalidateQueries({ queryKey: ["decks"] })
    queryClient.invalidateQueries({ queryKey: ["deck-buylist", id] })
    queryClient.invalidateQueries({ queryKey: ["deck-edhrec", id] })
    queryClient.invalidateQueries({ queryKey: ["collection"] })
    queryClient.invalidateQueries({ queryKey: ["collection-items"] })
  }

  const allocateDeckCardItem = useMutation({
    mutationFn: ({
      collectionItemId,
      deckCardId,
    }: {
      collectionItemId: string
      deckCardId: string
    }) => request(AllocateDeckCardItemDocument, { deckCardId, collectionItemId }),
    onSuccess: () => {
      invalidateAllocationQueries()
    },
  })
  const deallocateDeckCardItem = useMutation({
    mutationFn: ({
      collectionItemId,
      deckCardId,
    }: {
      collectionItemId: string
      deckCardId: string
    }) => request(DeallocateDeckCardItemDocument, { deckCardId, collectionItemId }),
    onSuccess: () => {
      invalidateAllocationQueries()
    },
  })
  const allocateDeckCardProxy = useMutation({
    mutationFn: ({ deckCardId, quantity }: { deckCardId: string; quantity: number }) =>
      request(AllocateDeckCardProxyDocument, { deckCardId, quantity }),
    onSuccess: () => {
      invalidateAllocationQueries()
    },
  })
  const deallocateDeckCardProxy = useMutation({
    mutationFn: ({ deckCardId, quantity }: { deckCardId: string; quantity: number }) =>
      request(DeallocateDeckCardProxyDocument, { deckCardId, quantity }),
    onSuccess: () => {
      invalidateAllocationQueries()
    },
  })
  const allocateDeckPullList = useMutation({
    mutationFn: async (entries: ReturnType<typeof selectedDeckPullListEntries>) => {
      for (const entry of entries) {
        for (let copy = 0; copy < entry.quantity; copy += 1) {
          await request(AllocateDeckCardItemDocument, {
            deckCardId: entry.deckCard.id,
            collectionItemId: entry.candidate.item.id,
          })
        }
      }
    },
    onSuccess: () => {
      invalidateAllocationQueries()
      setIsBulkAllocationOpen(false)
      setSelectedBulkAllocationItemIds({})
      setBulkAllocationError(null)
    },
    onError: (error) =>
      setBulkAllocationError(error instanceof Error ? error.message : "Could not allocate deck"),
  })
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
    bulkUpdateDeckCards.isPending ||
    bulkDeleteDeckCards.isPending ||
    deleteDeckCard.isPending ||
    setDeckCommander.isPending ||
    allocateDeckCardItem.isPending ||
    deallocateDeckCardItem.isPending ||
    allocateDeckCardProxy.isPending ||
    deallocateDeckCardProxy.isPending

  if (isLoading) return <EmptyState title="Loading deck..." />
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
        mayCloseDeleteSelected={!bulkDeleteDeckCards.isPending}
        moveError={moveError}
        moveTarget={moveTarget}
        onAddCardOpenChange={setIsAddCardOpen}
        onBulkAllocationModeChange={(mode) => {
          setBulkAllocationMode(mode)
          setSelectedBulkAllocationItemIds({})
          setBulkAllocationError(null)
        }}
        onAddEdhrecCard={addEdhrecCard}
        onCloseBulkAllocation={() => {
          if (!allocateDeckPullList.isPending) {
            setIsBulkAllocationOpen(false)
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
          allocateDeckPullList.mutate(selectedDeckPullListEntries(bulkAllocationPullList))
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
        onShareDeckOpenChange={setIsShareDeckOpen}
        previewDeckCard={previewDeckCard}
        previewDeckCards={previewDeckCards}
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
