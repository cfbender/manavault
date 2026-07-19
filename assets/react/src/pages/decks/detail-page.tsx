import { useApolloClient, useQuery } from "@apollo/client/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"

import { EmptyState } from "../../components/card-image"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/toast"
import { graphqlEndpointContext, refetchActiveQueries } from "../../lib/apollo"
import { deckCardsTotalPrice, deckMissingCardsTotalPrice, formatUsdCents } from "./buylist-export"
import { createDeckPullList } from "./deck-allocation-model"
import { compareDeckCards, countDeckZones } from "./deck-card-model"
import { DeckDetailBulkAllocationOverlay } from "./deck-detail-bulk-allocation-overlay"
import { DeckDetailCardCollections } from "./deck-detail-card-collections"
import { DeckDetailCardOverlays } from "./deck-detail-card-overlays"
import { DeckDetailDisassemblyOverlay } from "./deck-detail-disassembly-overlay"
import { DeckDetailHeader, DeckMobileTagsPanel } from "./deck-detail-header"
import { DeckDetailLoadingState } from "./deck-detail-loading"
import { mergeDeckCardsPage } from "./deck-detail-pagination"
import {
  bulkAllocationOverlay,
  editCardOverlay,
  moveCardOverlay,
  NO_DECK_DETAIL_OVERLAY,
  type DeckDetailOverlay,
  updateBulkAllocationOverlay,
} from "./deck-detail-overlay"
import { DeckDetailReadiness } from "./deck-detail-readiness"
import { DeckDetailSelectionBar } from "./deck-detail-selection-bar"
import { DeckDetailShareOverlays } from "./deck-detail-share-overlays"
import { DeckDetailShortcutsOverlay } from "./deck-detail-shortcuts-overlay"
import type { DeckPrice } from "./deck-detail-types"
import { DeckDetailUtilityOverlays } from "./deck-detail-utility-overlays"
import { useDeckAllocationActions } from "./use-deck-allocation-actions"
import { useDeckBulkActions } from "./use-deck-bulk-actions"
import { useDeckCardActions } from "./use-deck-card-actions"
import { useDeckDisassemblyActions } from "./use-deck-disassembly-actions"
import { useDeckDetailSelection } from "./detail-page-selection"
import { edhrecCardPrintingId } from "./edhrec"
import { groupDeckCards, type DeckGroupBy, DECK_GROUP_OPTIONS } from "../../lib/deck-grouping"
import { deckLegalityIssues } from "./deck-legality"
import { hasDeckBuylistWork, hasDeckPullWork } from "./deck-readiness"
import { useDeferredDeckAnalysis } from "./deck-stats-panel"
import { DeckStatsSection, DeckTokensSection } from "./deck-stats-panel"
import { useDeckTags } from "./use-deck-tags"
import { useDeckDetailShortcuts } from "./use-deck-detail-shortcuts"
import { usePageTitle } from "../../lib/page-title"
import { useSharedDecklistActions } from "./detail-page-share"
import { DeckDocument } from "./queries"
import {
  flattenDeck,
  type EDHRecAddZone,
  type EDHRecCard,
  type EDHRecSectionCard,
  type EDHRecTab,
} from "./deck-types"

type DeckDetailPageProps = {
  edhrecExcludeLands?: boolean
  edhrecTab?: EDHRecTab
  id: string
  shareMode?: boolean
}

export function DeckDetailPage({
  edhrecExcludeLands = false,
  edhrecTab,
  id,
  shareMode = false,
}: DeckDetailPageProps) {
  const [groupBy, setGroupBy] = useState<DeckGroupBy>("theme")
  const [overlay, setOverlay] = useState<DeckDetailOverlay>(NO_DECK_DETAIL_OVERLAY)
  const [activeTagId, setActiveTagId] = useState<string | null>(null)
  const navigate = useNavigate()
  const client = useApolloClient()
  const { showToast } = useToast()
  const {
    data,
    fetchMore: fetchMoreDeck,
    loading: isLoading,
    previousData,
  } = useQuery(DeckDocument, {
    variables: { id },
    context: shareMode ? graphqlEndpointContext("/share/graphql") : undefined,
    fetchPolicy: "cache-and-network",
  })

  const deckCardsPageInfo = data?.deck?.deckCards?.pageInfo
  const isLoadingMoreDeckCards = useRef(false)
  useEffect(() => {
    if (!deckCardsPageInfo?.hasNextPage || !deckCardsPageInfo.endCursor) return
    if (isLoadingMoreDeckCards.current) return

    isLoadingMoreDeckCards.current = true
    void fetchMoreDeck({
      variables: { id, deckCardsAfter: deckCardsPageInfo.endCursor },
      updateQuery: (previous, { fetchMoreResult }) => mergeDeckCardsPage(previous, fetchMoreResult),
    }).finally(() => {
      isLoadingMoreDeckCards.current = false
    })
  }, [deckCardsPageInfo?.endCursor, deckCardsPageInfo?.hasNextPage, fetchMoreDeck, id])

  const deckQueryData = data?.deck ? data : previousData?.deck?.id === id ? previousData : data
  const deck = useMemo(() => flattenDeck(deckQueryData?.deck), [deckQueryData?.deck])
  const deckCards = useMemo(() => deck?.deckCards || [], [deck?.deckCards])
  const isInitialDeckLoading = isLoading && !deck
  const isRefreshingDeck = isLoading && Boolean(deck)
  const canEditDecklist = deck?.status !== "archived"
  usePageTitle(deck?.name ?? (isInitialDeckLoading ? "Deck" : "Deck not found"))

  function refetchDeckQueries() {
    void refetchActiveQueries(client)
  }

  const deckTagActions = useDeckTags(id)
  useEffect(() => {
    if (deckTagActions.error) showToast(deckTagActions.error)
  }, [deckTagActions.error, showToast])

  useEffect(() => {
    setOverlay(NO_DECK_DETAIL_OVERLAY)
    setActiveTagId(null)
  }, [id])
  useEffect(() => {
    setOverlay((current) => {
      if (edhrecTab) return current.kind === "edhrec" ? current : { kind: "edhrec" }
      return current.kind === "edhrec" ? NO_DECK_DETAIL_OVERLAY : current
    })
  }, [edhrecTab])

  useEffect(() => {
    if (shareMode) {
      setOverlay((current) =>
        current.kind === "preview-card" ||
        current.kind === "share-buylist" ||
        current.kind === "share-playtest"
          ? current
          : NO_DECK_DETAIL_OVERLAY,
      )
      return
    }

    if (!canEditDecklist) {
      setOverlay((current) =>
        current.kind === "edit-deck" ||
        current.kind === "export-deck" ||
        current.kind === "preview-card" ||
        current.kind === "share-deck" ||
        current.kind === "shortcuts"
          ? current
          : NO_DECK_DETAIL_OVERLAY,
      )
    }
  }, [canEditDecklist, shareMode])

  const cardActions = useDeckCardActions({
    deckId: id,
    onRefetch: refetchDeckQueries,
    onToast: showToast,
    setOverlay,
  })
  const allocationActions = useDeckAllocationActions({
    onRefetch: refetchDeckQueries,
    onToast: showToast,
  })
  const disassemblyActions = useDeckDisassemblyActions({
    onArchived: () => navigate({ to: "/decks" }),
    onRefetch: refetchDeckQueries,
    onToast: showToast,
    setOverlay,
  })

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
    () => groupDeckCards(stackDeckCards, groupBy, deck?.tags ?? []),
    [deck?.tags, groupBy, stackDeckCards],
  )
  const selectionDeckCardIds = useMemo(
    () => [
      ...new Set(groupedCards.flatMap((group) => group.cards.map((deckCard) => deckCard.id))),
      ...sideboardCards.map((deckCard) => deckCard.id),
      ...maybeboardCards.map((deckCard) => deckCard.id),
    ],
    [groupedCards, maybeboardCards, sideboardCards],
  )
  const selection = useDeckDetailSelection(deckCards, selectionDeckCardIds)
  const clearSelection = () => {
    selection.clearSelectedDeckCards()
    selection.setIsSelectingCards(false)
  }
  const bulkActions = useDeckBulkActions({
    onClearSelection: clearSelection,
    onRefetch: refetchDeckQueries,
    onToast: showToast,
  })

  const selectedDeallocatableDeckCardIdList = useMemo(() => {
    const selectedIds = new Set(selection.selectedDeckCardIdList)
    return deckCards
      .filter((deckCard) => selectedIds.has(deckCard.id) && deckCard.allocationStatus.allocated > 0)
      .map((deckCard) => deckCard.id)
  }, [deckCards, selection.selectedDeckCardIdList])
  const selectedAllocatedDeckCardCount = selectedDeallocatableDeckCardIdList.length
  const hasBulkAllocationAvailable = useMemo(() => {
    if (shareMode) return false
    const available = createDeckPullList(deckCards, undefined, "any")
    return available.exactEntries.length > 0 || available.choices.length > 0
  }, [deckCards, shareMode])
  const hasReadinessWork = useMemo(() => hasDeckPullWork(deckCards), [deckCards])
  const hasBuylistWork = useMemo(() => hasDeckBuylistWork(deckCards), [deckCards])
  const zoneCounts = useMemo(() => countDeckZones(deckCards), [deckCards])
  const deferredDeckAnalysis = useDeferredDeckAnalysis(deckCards)
  const deckPrice = useMemo<DeckPrice | null>(() => {
    if (!deck) return null
    const price = deckCardsTotalPrice(deckCards)
    return {
      label: formatUsdCents(price.totalCents),
      loading: false,
      unpricedQuantity: price.unpricedQuantity,
    }
  }, [deck, deckCards])
  const buylistPrice = useMemo<DeckPrice | null>(() => {
    if (!deck) return null
    const price = deckMissingCardsTotalPrice(deckCards)
    return {
      label: formatUsdCents(price.totalCents),
      loading: false,
      unpricedQuantity: price.unpricedQuantity,
    }
  }, [deck, deckCards])
  const { copySharedDecklist, downloadSharedDecklist, shareCopyState } = useSharedDecklistActions(
    deck?.name || "deck",
    deckCards,
  )

  function jumpToTag(tagId: string) {
    if (activeTagId === tagId) {
      setActiveTagId(null)
      selection.setHighlightedDeckCardIds(null)
      return
    }

    setActiveTagId(tagId)
    selection.setHighlightedDeckCardIds(
      new Set(
        deckCards
          .filter((deckCard) => (deckCard.tagIds ?? []).includes(tagId))
          .map((deckCard) => deckCard.id),
      ),
    )
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

  function addEdhrecCard(card: EDHRecCard | EDHRecSectionCard, zone: EDHRecAddZone) {
    cardActions.addDeckCard({
      finish: "nonfoil",
      name: card.name,
      preferredPrintingId: edhrecCardPrintingId(card),
      quantity: 1,
      zone,
    })
  }

  useDeckDetailShortcuts(
    {
      onAddCard: () => setOverlay({ kind: "add-card" }),
      onClearHighlight: () => {
        setActiveTagId(null)
        selection.setHighlightedDeckCardIds(null)
      },
      onCycleGroup: () => {
        const index = DECK_GROUP_OPTIONS.findIndex((option) => option.value === groupBy)
        const next = DECK_GROUP_OPTIONS[(index + 1) % DECK_GROUP_OPTIONS.length]
        if (next) setGroupBy(next.value)
      },
      onJumpToTagIndex: (index) => {
        const tag = deck?.tags?.[index]
        if (tag) jumpToTag(tag.id)
      },
      onOpenPlaytest: () => navigate({ to: "/decks/$id/playtest", params: { id } }),
      onToggleHelp: () =>
        setOverlay((current) =>
          current.kind === "shortcuts" ? NO_DECK_DETAIL_OVERLAY : { kind: "shortcuts" },
        ),
      onToggleSelect: () => selection.setIsSelectingCards((selecting) => !selecting),
    },
    !shareMode && canEditDecklist,
  )

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

  const legalityIssues = deckLegalityIssues(deck.legality)
  const isUpdatingDeckCard =
    cardActions.isPending ||
    allocationActions.isAllocating ||
    allocationActions.isOptimizingPrintings ||
    bulkActions.isPending
  const workflowError =
    bulkActions.error ||
    cardActions.tagError ||
    cardActions.deleteError ||
    allocationActions.allocationError ||
    disassemblyActions.error

  return (
    <>
      <div
        className={
          shareMode
            ? undefined
            : "lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start lg:gap-6"
        }
      >
        <DeckDetailHeader
          canEdit={canEditDecklist}
          deck={deck}
          deckCards={deckCards}
          deckPrice={deckPrice}
          deckTags={deck.tags}
          groupBy={groupBy}
          hasBuylistWork={hasBuylistWork}
          hasReadinessWork={hasReadinessWork}
          isRefreshing={isRefreshingDeck}
          isSelectionActive={selection.isSelectionActive}
          legalityIssues={legalityIssues}
          onAddCard={() => setOverlay({ kind: "add-card" })}
          onCopySharedDecklist={copySharedDecklist}
          onDisassemble={() => disassemblyActions.preview(deck.id)}
          onDownloadSharedDecklist={downloadSharedDecklist}
          onEditDeck={() => setOverlay({ kind: "edit-deck" })}
          onExportDeck={() => setOverlay({ kind: "export-deck" })}
          onGroupByChange={setGroupBy}
          onImportDeck={() => setOverlay({ kind: "import-deck" })}
          onMissingCards={() => setOverlay({ kind: "missing-cards" })}
          onOpenEdhrec={() => {
            setOverlay({ kind: "edhrec" })
            setEdhrecState("recs")
          }}
          onOpenReadiness={() => setOverlay({ kind: "readiness" })}
          onShareBuylist={() => setOverlay({ kind: "share-buylist" })}
          onShareDeck={() => setOverlay({ kind: "share-deck" })}
          onSharePlaytest={() => setOverlay({ kind: "share-playtest" })}
          onStartSelecting={() => selection.setIsSelectingCards(true)}
          shareCopyState={shareCopyState}
          shareMode={shareMode}
          tagActions={{
            activeTagId,
            onCreate: deckTagActions.createTag,
            onDelete: deckTagActions.deleteTag,
            onJumpTo: jumpToTag,
            onReorder: deckTagActions.reorderTags,
            onUpdate: deckTagActions.updateTag,
          }}
          zoneCounts={zoneCounts}
        >
          <DeckDetailReadiness
            allocationError={workflowError}
            buylistPrice={buylistPrice}
            canBulkAllocate={canEditDecklist && hasBulkAllocationAvailable}
            deckCards={deckCards}
            isPending={isUpdatingDeckCard}
            onAllocate={(deckCard, collectionItemId) =>
              allocationActions.allocate(deckCard.id, collectionItemId)
            }
            onClose={() => setOverlay(NO_DECK_DETAIL_OVERLAY)}
            onDeallocate={(deckCard, collectionItemId) =>
              allocationActions.deallocate(deckCard.id, collectionItemId)
            }
            onMissingCards={() => setOverlay({ kind: "missing-cards" })}
            onOpenBulkAllocation={() => setOverlay(bulkAllocationOverlay())}
            onOpenOptimizePrintings={() => setOverlay({ kind: "optimize-printings", error: null })}
            onTagCard={cardActions.tagDeckCard}
            onToggleProxy={allocationActions.toggleProxy}
            open={canEditDecklist && overlay.kind === "readiness"}
            readOnly={shareMode || !canEditDecklist}
          />

          {!shareMode && canEditDecklist && selection.isSelectionActive ? (
            <DeckDetailSelectionBar
              allSelected={selection.allDeckCardsSelected}
              bulkQuantity={selection.bulkQuantity}
              error={bulkActions.error || cardActions.tagError}
              isPending={isUpdatingDeckCard}
              onClear={() => {
                bulkActions.clearError()
                cardActions.clearTagError()
                clearSelection()
              }}
              onDeallocate={() => {
                if (!selectedDeallocatableDeckCardIdList.length) return
                bulkActions.deallocate(selectedDeallocatableDeckCardIdList)
              }}
              onDelete={() => setOverlay({ kind: "delete-selected" })}
              onOpenSelectFromList={() => setOverlay({ kind: "select-from-list" })}
              onQuantityChange={selection.setBulkQuantity}
              onSelectAll={selection.selectAllDeckCards}
              onTag={(tag) => {
                if (!selection.selectedDeckCardIdList.length) return
                bulkActions.clearError()
                cardActions.clearTagError()
                cardActions.updateSelectedDeckCardsTag(
                  selection.selectedDeckCardIdList,
                  tag,
                  clearSelection,
                )
              }}
              onUpdate={(input) => {
                if (!selection.selectedDeckCardIdList.length) return
                bulkActions.update(selection.selectedDeckCardIdList, input)
              }}
              selectedAllocatedCount={selectedAllocatedDeckCardCount}
              selectedCount={selection.selectedDeckCardCount}
              totalCount={deckCards.length}
            />
          ) : null}

          <DeckMobileTagsPanel
            canEdit={canEditDecklist}
            deckTags={deck.tags}
            shareMode={shareMode}
            tagActions={{
              activeTagId,
              onCreate: deckTagActions.createTag,
              onDelete: deckTagActions.deleteTag,
              onJumpTo: jumpToTag,
              onReorder: deckTagActions.reorderTags,
              onUpdate: deckTagActions.updateTag,
            }}
          />

          <DeckDetailCardCollections
            canEdit={canEditDecklist}
            deckFormat={deck.format}
            deckId={deck.id}
            deckTags={deck.tags}
            groupedCards={groupedCards}
            highlightedCardIds={selection.highlightedDeckCardIds}
            isSelecting={selection.isSelectionActive}
            isUpdating={isUpdatingDeckCard}
            maybeboardCards={maybeboardCards}
            onAllocate={(deckCard, collectionItemId) =>
              allocationActions.allocate(deckCard.id, collectionItemId)
            }
            onAssignTag={cardActions.assignDeckCardTag}
            onDeallocate={(deckCard, collectionItemId) =>
              allocationActions.deallocate(deckCard.id, collectionItemId)
            }
            onDelete={(deckCard) => setOverlay({ kind: "delete-card", deckCard })}
            onEdit={(deckCard) => setOverlay(editCardOverlay(deckCard))}
            onMove={(deckCard) => setOverlay(moveCardOverlay(deckCard))}
            onPreview={(deckCard) => setOverlay({ kind: "preview-card", deckCard })}
            onSetCommander={(deckCard) => cardActions.setDeckCommander(deckCard.id)}
            onTag={cardActions.tagDeckCard}
            onToggleProxy={allocationActions.toggleProxy}
            onToggleSelected={selection.toggleDeckCardSelected}
            onUnassignTag={cardActions.unassignDeckCardTag}
            selectedCardIds={selection.selectedDeckCardIds}
            shareMode={shareMode}
            sideboardCards={sideboardCards}
          />
          <DeckTokensSection tokens={deferredDeckAnalysis?.tokens ?? null} />
          <DeckStatsSection
            stats={deferredDeckAnalysis?.stats ?? null}
            onHighlightDeckCards={selection.setHighlightedDeckCardIds}
          />
        </DeckDetailHeader>
      </div>

      <DeckDetailCardOverlays
        deck={deck}
        isDeleting={cardActions.isDeletingCard}
        isUpdating={cardActions.isUpdatingCard}
        onClose={() => setOverlay(NO_DECK_DETAIL_OVERLAY)}
        onDelete={cardActions.deleteDeckCard}
        onMove={(deckCardId, zone) => cardActions.updateDeckCard(deckCardId, { zone }, "move-card")}
        onSave={(deckCardId, input) => cardActions.updateDeckCard(deckCardId, input, "edit-card")}
        overlay={overlay}
        shareMode={shareMode}
        zoneCounts={zoneCounts}
      />
      <DeckDetailUtilityOverlays
        addCardError={cardActions.addCardError}
        canCloseDeleteSelected={!bulkActions.isDeleting}
        deck={deck}
        edhrecExcludeLands={edhrecExcludeLands}
        edhrecTab={edhrecTab}
        isAddingCard={cardActions.isAddingCard}
        isOptimizing={allocationActions.isOptimizingPrintings}
        onAddEdhrecCard={addEdhrecCard}
        onClose={() => setOverlay(NO_DECK_DETAIL_OVERLAY)}
        onDeleteSelected={() => {
          if (selection.selectedDeckCardIdList.length) {
            bulkActions.remove(selection.selectedDeckCardIdList, () =>
              setOverlay(NO_DECK_DETAIL_OVERLAY),
            )
          }
        }}
        onOptimizePrintings={(deckCardIds) =>
          allocationActions.optimizePrintings(deckCardIds, {
            onError: (error) =>
              setOverlay((current) =>
                current.kind === "optimize-printings" ? { ...current, error } : current,
              ),
            onSuccess: () => setOverlay(NO_DECK_DETAIL_OVERLAY),
          })
        }
        onSelectDeckCards={(deckCardIds) => {
          selection.selectDeckCardIds(deckCardIds)
          setOverlay(NO_DECK_DETAIL_OVERLAY)
        }}
        onSetEdhrecState={setEdhrecState}
        overlay={overlay}
        selectedDeckCardCount={selection.selectedDeckCardCount}
        shareMode={shareMode}
      />
      <DeckDetailBulkAllocationOverlay
        deck={deck}
        isPending={allocationActions.isBulkAllocating}
        onClose={() => setOverlay(NO_DECK_DETAIL_OVERLAY)}
        onConfirm={(entries) =>
          allocationActions.allocatePullList(deck, entries, {
            onError: (error) =>
              setOverlay((current) => updateBulkAllocationOverlay(current, { error })),
            onSkipped: (error) =>
              setOverlay((current) => updateBulkAllocationOverlay(current, { error })),
            onSuccess: () => setOverlay(NO_DECK_DETAIL_OVERLAY),
          })
        }
        onOverlayChange={setOverlay}
        overlay={canEditDecklist ? overlay : NO_DECK_DETAIL_OVERLAY}
      />
      <DeckDetailDisassemblyOverlay
        deck={deck}
        isApplying={disassemblyActions.isApplying}
        onApply={() => disassemblyActions.apply(deck.id)}
        onClose={() => setOverlay(NO_DECK_DETAIL_OVERLAY)}
        overlay={canEditDecklist ? overlay : NO_DECK_DETAIL_OVERLAY}
      />
      <DeckDetailShareOverlays
        deck={deck}
        deckCards={deckCards}
        onClose={() => setOverlay(NO_DECK_DETAIL_OVERLAY)}
        overlay={overlay}
        shareMode={shareMode}
        shareToken={id}
      />
      <DeckDetailShortcutsOverlay
        onClose={() => setOverlay(NO_DECK_DETAIL_OVERLAY)}
        overlay={overlay}
      />
    </>
  )
}
