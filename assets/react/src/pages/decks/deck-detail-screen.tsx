import { Link, useNavigate } from "@tanstack/react-router"
import { useMemo } from "react"

import { EmptyState } from "../../components/card-image"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/toast"
import { DECK_GROUP_OPTIONS } from "../../lib/deck-grouping"
import { deckCardsTotalPrice, deckMissingCardsTotalPrice, formatUsdCents } from "./buylist-export"
import { ShareModeHidden } from "./deck-actions"
import { createDeckPullList } from "./deck-allocation-model"
import { countDeckZones } from "./deck-card-model"
import { DeckDetailCardCollections } from "./deck-detail-card-collections"
import { DeckDetailDialogLauncher } from "./deck-detail-dialog-launcher"
import { DeckDetailHeader, DeckMobileTagsPanel } from "./deck-detail-header"
import { DeckDetailLoadingState } from "./deck-detail-loading"
import {
  bulkAllocationOverlay,
  editCardOverlay,
  moveCardOverlay,
  NO_DECK_DETAIL_OVERLAY,
} from "./deck-detail-overlay"
import { DeckDetailReadiness } from "./deck-detail-readiness"
import { DeckDetailSelectionBar } from "./deck-detail-selection-bar"
import type { DeckPrice } from "./deck-detail-types"
import { useDeckDetailSelection } from "./detail-page-selection"
import { edhrecCardPrintingId } from "./edhrec"
import { deckLegalityIssues } from "./deck-legality"
import { hasDeckBuylistWork, hasDeckPullWork } from "./deck-readiness"
import { useDeferredDeckAnalysis } from "./deck-stats-panel"
import { DeckStatsSection, DeckTokensSection } from "./deck-stats-panel"
import { useDeckDetailShortcuts } from "./use-deck-detail-shortcuts"
import { useSharedDecklistActions } from "./detail-page-share"
import { useDeckCardGroups } from "./use-deck-card-groups"
import { useDeckDetail } from "./use-deck-detail"
import { useDeckDialogs } from "./use-deck-dialogs"
import { useDeckMutations } from "./use-deck-mutations"
import {
  type EDHRecAddZone,
  type EDHRecTab,
  type EDHRecThemeSelection,
  type RecommendedCardLike,
} from "./deck-types"

export type DeckDetailPageProps = {
  edhrecExcludeLands?: boolean
  edhrecCommander?: string
  edhrecTab?: EDHRecTab
  edhrecTheme?: string
  id: string
  shareMode?: boolean
}

export function DeckDetailScreen({
  edhrecExcludeLands = false,
  edhrecCommander,
  edhrecTab,
  edhrecTheme: edhrecThemeSlug,
  id,
  shareMode = false,
}: DeckDetailPageProps) {
  const edhrecTheme =
    edhrecCommander && edhrecThemeSlug
      ? { commanderName: edhrecCommander, themeSlug: edhrecThemeSlug }
      : undefined
  const navigate = useNavigate()
  const { showToast } = useToast()
  const {
    deck,
    deckCards,
    isInitialLoading: isInitialDeckLoading,
    isRefreshing: isRefreshingDeck,
    refetch: refetchDeckQueries,
  } = useDeckDetail({ id, shareMode })
  const canEditDecklist = deck?.status !== "archived"
  const { activeTagId, overlay, setActiveTagId, setOverlay } = useDeckDialogs({
    canEdit: canEditDecklist,
    deckId: id,
    edhrecOpen: Boolean(edhrecTab),
    shareMode,
  })
  const {
    consideringCards,
    groupBy,
    groupedCards,
    partnerCandidateIds,
    selectionCardIds: selectionDeckCardIds,
    setGroupBy,
  } = useDeckCardGroups({ deckCards, deckTags: deck?.tags ?? [] })
  const selection = useDeckDetailSelection(deckCards, selectionDeckCardIds)
  const clearSelection = () => {
    selection.clearSelectedDeckCards()
    selection.setIsSelectingCards(false)
  }
  const mutations = useDeckMutations({
    clearSelection,
    deckId: id,
    onArchived: () => navigate({ to: "/decks" }),
    onRefetch: refetchDeckQueries,
    onToast: showToast,
    setOverlay,
  })
  const {
    allocation: allocationActions,
    bulk: bulkActions,
    card: cardActions,
    disassembly: disassemblyActions,
    tags: deckTagActions,
  } = mutations

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

  function setEdhrecState({
    tab,
    excludeLands = edhrecExcludeLands,
    theme,
  }: {
    tab?: EDHRecTab
    excludeLands?: boolean
    theme?: EDHRecThemeSelection | null
  }) {
    const nextTheme = theme === undefined ? edhrecTheme : theme

    navigate({
      to: "/decks/$id",
      params: { id },
      search: {
        edhrec: tab,
        edhrecCommander: tab && nextTheme ? nextTheme.commanderName : undefined,
        edhrecExcludeLands: tab && excludeLands ? true : undefined,
        edhrecTheme: tab && nextTheme ? nextTheme.themeSlug : undefined,
      },
    })
  }

  function addEdhrecCard(card: RecommendedCardLike, zone: EDHRecAddZone) {
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
            <ShareModeHidden shareMode={shareMode}>
              <Button asChild>
                <Link to="/decks">Back to decks</Link>
              </Button>
            </ShareModeHidden>
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
          saltSum={deferredDeckAnalysis?.stats.saltSum ?? null}
          onAddCard={() => setOverlay({ kind: "add-card" })}
          onCombos={() => setOverlay({ kind: "combos" })}
          onCompareDeck={() => setOverlay({ kind: "compare-deck" })}
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
            setEdhrecState({ tab: "recs", theme: null })
          }}
          onOpenRecommander={() => setOverlay({ kind: "recommander" })}
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
            consideringCards={consideringCards}
            deckFormat={deck.format}
            deckId={deck.id}
            deckTags={deck.tags}
            groupedCards={groupedCards}
            highlightedCardIds={selection.highlightedDeckCardIds}
            isSelecting={selection.isSelectionActive}
            isUpdating={isUpdatingDeckCard}
            onAddPartner={(deckCard) => cardActions.addDeckPartner(deckCard.id)}
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
            partnerCandidateIds={partnerCandidateIds}
            selectedCardIds={selection.selectedDeckCardIds}
            shareMode={shareMode}
          />
          <DeckTokensSection tokens={deferredDeckAnalysis?.tokens ?? null} />
          <DeckStatsSection
            stats={deferredDeckAnalysis?.stats ?? null}
            onHighlightDeckCards={selection.setHighlightedDeckCardIds}
          />
        </DeckDetailHeader>
      </div>

      <DeckDetailDialogLauncher
        canEdit={canEditDecklist}
        deck={deck}
        deckCards={deckCards}
        edhrecExcludeLands={edhrecExcludeLands}
        edhrecTheme={edhrecTheme}
        edhrecTab={edhrecTab}
        mutations={mutations}
        onAddEdhrecCard={addEdhrecCard}
        onSetEdhrecState={setEdhrecState}
        overlay={overlay}
        selection={selection}
        setOverlay={setOverlay}
        shareMode={shareMode}
        shareToken={id}
        zoneCounts={zoneCounts}
      />
    </>
  )
}
