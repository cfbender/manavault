import { Link } from "@tanstack/react-router"
import {
  AlertTriangle,
  CheckSquare,
  Clipboard,
  Download,
  Layers,
  Play,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react"

import { EmptyState } from "../../components/card-image"
import { ImageSummaryCard } from "../../components/image-summary-card"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import type { DeckCardUpdateInput } from "../../gql/graphql"
import type { DeckGroup, DeckGroupBy } from "../../lib/deck-grouping"
import { cn, compactNumber, titleize } from "../../lib/utils"
import { ShareModeHidden, SummaryActionMenu } from "./deck-actions"
import { deckDetailCoverUrl } from "./deck-card-model"
import { DeckGroupMenu } from "./deck-group-menu"
import { deckLegalityIssueCountLabel, deckLegalityLabel, deckLegalityTone } from "./deck-legality"
import { summarizeDeckReadiness } from "./deck-readiness"
import { DeckNameWithCommanderIdentity, commanderColorIdentity } from "./deck-list-model"
import { DeckGroupGrid } from "./deck-stack-grid"
import { DeckStatsSection, DeckTokensSection, type DeferredDeckAnalysis } from "./deck-stats-panel"
import type { DeckCardEntry, DeckCardTag, DeckDetail, DeckZone } from "./deck-types"
import { DECK_CARD_TAGS, MOVE_TARGET_ZONES } from "./deck-types"
import { DeckZoneTable } from "./deck-zone-table"

export type DetailZoneCounts = Record<DeckZone, number>

export type DeckLegalityIssue = {
  code?: string | null
  cardName?: string | null
  message: string
}

type BuylistPrice = {
  label: string
  loading: boolean
  unpricedQuantity: number
}

function BuylistPriceChip({ onClick, price }: { onClick: () => void; price: BuylistPrice | null }) {
  if (!price) return null

  return (
    <button
      type="button"
      className="badge badge-warning badge-outline badge-sm inline-flex cursor-pointer items-center gap-1.5 px-2 font-medium leading-none align-middle transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/35"
      aria-label="Open buy list"
      onClick={onClick}
      title={
        !price.loading && price.unpricedQuantity > 0
          ? `${price.unpricedQuantity} cards are unpriced`
          : undefined
      }
    >
      <span className="tabular-nums leading-none">
        {price.loading ? "Pricing..." : price.label}
      </span>
    </button>
  )
}
function DeckReadinessStrip({
  buylistPrice,
  canBulkAllocate,
  deckCards,
  onMissingCards,
  onOpenBulkAllocation,
  onOpenOptimizePrintings,
  shareMode,
}: {
  buylistPrice: BuylistPrice | null
  canBulkAllocate: boolean
  deckCards: DeckCardEntry[]
  onMissingCards: () => void
  onOpenBulkAllocation: () => void
  onOpenOptimizePrintings: () => void
  shareMode: boolean
}) {
  const readiness = summarizeDeckReadiness(deckCards)
  const needsAction =
    readiness.availableToPull > 0 || readiness.missingToBuy > 0 || readiness.proxyAllocated > 0

  return (
    <section
      className="grid gap-4 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto]"
      aria-label="Deck readiness"
    >
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-black">Deck readiness</h2>
            <p className="mt-1 max-w-2xl text-sm text-base-content/70">
              {needsAction
                ? "Physical-card work is still visible: pull owned copies, buy gaps, or review proxies."
                : "All required cards are accounted for in this deck."}
            </p>
          </div>
          <div className="font-mono text-2xl font-black text-base-content">
            {readiness.readinessPercent}%
          </div>
        </div>

        <div
          className="h-2 overflow-hidden rounded-full bg-base-200"
          aria-label={`${readiness.readyCount} of ${readiness.requiredCount} required cards ready`}
          role="img"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${readiness.readinessPercent}%` }}
          />
        </div>

        <dl className="grid gap-2 sm:grid-cols-4">
          <DeckReadinessMetric
            label="Ready"
            value={`${readiness.readyCount}/${readiness.requiredCount}`}
          />
          <DeckReadinessMetric label="Pull" value={readiness.availableToPull} />
          <DeckReadinessMetric label="Buy" value={readiness.missingToBuy} />
          <DeckReadinessMetric label="Proxy" value={readiness.proxyAllocated} />
        </dl>
      </div>

      <ShareModeHidden shareMode={shareMode}>
        <div className="flex flex-wrap items-center gap-2 lg:max-w-72 lg:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onMissingCards}>
            <ShoppingCart className="h-4 w-4" />
            Missing cards
            {buylistPrice ? <span className="font-mono">{buylistPrice.label}</span> : null}
          </Button>
          {canBulkAllocate ? (
            <Button type="button" variant="secondary" size="sm" onClick={onOpenBulkAllocation}>
              Pull owned cards
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onOpenOptimizePrintings}>
            Optimize printings
          </Button>
        </div>
      </ShareModeHidden>
    </section>
  )
}

function DeckReadinessMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-btn bg-base-200/60 px-3 py-2">
      <dt className="text-xs font-semibold text-base-content/60">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-black leading-none text-base-content">{value}</dd>
    </div>
  )
}

export function DeckDetailContent({
  allocationError,
  allDeckCardsSelected,
  bulkActionError,
  bulkQuantity,
  canBulkAllocate,
  deck,
  deckCards,
  deckStats,
  deckTokens,
  groupBy,
  groupedCards,
  highlightedDeckCardIds,
  isSelectionActive,
  isUpdatingDeckCard,
  isRefreshingDeck,
  legalityIssues,
  maybeboardCards,
  onAllocate,
  onClearSelectedDeckCards,
  onCopySharedDecklist,
  onDeallocate,
  onDeleteCard,
  onDownloadSharedDecklist,
  onEditCard,
  onEditDeck,
  onExportDeck,
  onGroupByChange,
  onHighlightDeckCards,
  onImportDeck,
  onMissingCards,
  onMoveCard,
  onOpenAddCard,
  onOpenDeleteSelected,
  onDisassemble,
  onOpenEdhrec,
  onOpenShareDeck,
  onOpenShareBuylist,
  onOpenSharePlaytest,
  onOpenBulkAllocation,
  onOpenOptimizePrintings,
  onPreviewCard,
  onSelectAllDeckCards,
  onSetCommander,
  onSetBulkQuantity,
  onTagCard,
  onTagSelectedDeckCards,
  onToggleProxy,
  onToggleSelected,
  onUpdateSelectedDeckCards,
  selectedDeckCardCount,
  selectedDeckCardIds,
  buylistPrice,
  shareCopyState,
  shareMode,
  sideboardCards,
  zoneCounts,
}: {
  allocationError: string | null
  allDeckCardsSelected: boolean
  bulkActionError: string | null
  bulkQuantity: number
  canBulkAllocate: boolean
  deck: DeckDetail
  deckCards: DeckCardEntry[]
  deckStats: DeferredDeckAnalysis["stats"] | null
  deckTokens: DeferredDeckAnalysis["tokens"] | null
  groupBy: DeckGroupBy
  groupedCards: DeckGroup<DeckCardEntry>[]
  highlightedDeckCardIds: Set<string> | null
  isSelectionActive: boolean
  isUpdatingDeckCard: boolean
  isRefreshingDeck: boolean
  legalityIssues: DeckLegalityIssue[]
  maybeboardCards: DeckCardEntry[]
  onAllocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onClearSelectedDeckCards: () => void
  onCopySharedDecklist: () => void
  onDeallocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onDeleteCard: (deckCard: DeckCardEntry) => void
  onDownloadSharedDecklist: () => void
  onEditCard: (deckCard: DeckCardEntry) => void
  onEditDeck: () => void
  onExportDeck: () => void
  onGroupByChange: (groupBy: DeckGroupBy) => void
  onHighlightDeckCards: (deckCardIds: Set<string> | null) => void
  onImportDeck: () => void
  onMissingCards: () => void
  onMoveCard: (deckCard: DeckCardEntry) => void
  onOpenAddCard: () => void
  onOpenDeleteSelected: () => void
  onDisassemble: () => void
  onOpenEdhrec: () => void
  onOpenShareDeck: () => void
  onOpenShareBuylist: () => void
  onOpenSharePlaytest: () => void
  onOpenBulkAllocation: () => void
  onOpenOptimizePrintings: () => void
  onPreviewCard: (deckCard: DeckCardEntry) => void
  onSelectAllDeckCards: () => void
  onSetCommander: (deckCard: DeckCardEntry) => void
  onSetBulkQuantity: (quantity: number) => void
  onTagCard: (deckCard: DeckCardEntry, tag: DeckCardTag | null) => void
  onTagSelectedDeckCards: (tag: DeckCardTag | null) => void
  onToggleProxy: (deckCard: DeckCardEntry) => void
  onToggleSelected: (deckCardId: string, selectRange?: boolean) => void
  onUpdateSelectedDeckCards: (input: DeckCardUpdateInput) => void
  selectedDeckCardCount: number
  selectedDeckCardIds: Set<string>
  buylistPrice: BuylistPrice | null
  shareCopyState: "idle" | "copied" | "failed"
  shareMode: boolean
  sideboardCards: DeckCardEntry[]
  zoneCounts: DetailZoneCounts
}) {
  return (
    <div className="space-y-7">
      <ShareModeHidden shareMode={shareMode}>
        <Button asChild variant="outline" size="sm">
          <Link to="/decks">Back to decks</Link>
        </Button>
      </ShareModeHidden>

      <ImageSummaryCard
        imageUrl={deckDetailCoverUrl(deckCards)}
        fallback={<Layers className="h-12 w-12" />}
        interactive={false}
        typeLine={<Badge>{titleize(deck.format)}</Badge>}
        countLine={`${compactNumber(deck.cardCount || 0)} cards`}
        detailLine={
          <div className="flex flex-wrap items-center gap-2 text-base leading-none">
            <Badge tone={deck.status === "active" ? "success" : "neutral"}>
              {titleize(deck.status)}
            </Badge>
            <Badge tone={deckLegalityTone(deck.legality)}>{deckLegalityLabel(deck.legality)}</Badge>
            <BuylistPriceChip
              price={buylistPrice}
              onClick={shareMode ? onOpenShareBuylist : onMissingCards}
            />
            {isRefreshingDeck ? <Badge tone="neutral">Refreshing…</Badge> : null}
          </div>
        }
        nameLine={
          <DeckNameWithCommanderIdentity
            colors={commanderColorIdentity(deckCards)}
            name={deck.name}
          />
        }
        actionSlot={
          <ShareModeHidden shareMode={shareMode}>
            <SummaryActionMenu
              label={`${deck.name} actions`}
              onEdit={onEditDeck}
              onExport={onExportDeck}
              onImport={onImportDeck}
              onShare={onOpenShareDeck}
              onDisassemble={onDisassemble}
              onEdhrec={deck.format === "commander" ? onOpenEdhrec : undefined}
            />
          </ShareModeHidden>
        }
      />

      <DeckReadinessStrip
        buylistPrice={buylistPrice}
        canBulkAllocate={canBulkAllocate}
        deckCards={deckCards}
        onMissingCards={onMissingCards}
        onOpenBulkAllocation={onOpenBulkAllocation}
        onOpenOptimizePrintings={onOpenOptimizePrintings}
        shareMode={shareMode}
      />

      {legalityIssues.length ? (
        <div className="rounded-box border border-error/25 bg-error/5 p-4 text-sm text-base-content/80">
          <div className="mb-2 flex flex-wrap items-center gap-2 font-bold text-error">
            <AlertTriangle className="h-4 w-4" />
            <span>{deckLegalityIssueCountLabel(legalityIssues.length)}</span>
          </div>
          <ul className="space-y-1.5">
            {legalityIssues.map((issue, index) => (
              <li key={`${issue.code}-${issue.cardName || "deck"}-${index}`} className="flex gap-2">
                <span aria-hidden="true" className="text-error">
                  •
                </span>
                <span>
                  {issue.cardName ? (
                    <span className="font-bold text-base-content">{issue.cardName}: </span>
                  ) : null}
                  {issue.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-4">
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {(["commander", "mainboard", "sideboard", "maybeboard"] as DeckZone[]).map((zone) => (
            <div key={zone} className="flex items-baseline gap-1.5">
              <dt
                className={cn(
                  "text-xs font-black uppercase tracking-[0.16em]",
                  zone === "commander" ? "text-primary" : "text-base-content/45",
                )}
              >
                {titleize(zone)}
              </dt>
              <dd className="font-mono text-sm font-black text-base-content/80">
                {zoneCounts[zone] || 0}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          {shareMode ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!deckCards.length}
                onClick={onOpenSharePlaytest}
              >
                <Play className="h-4 w-4" />
                Playtest
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!deckCards.length}
                onClick={onOpenShareBuylist}
              >
                <ShoppingCart className="h-4 w-4" />
                Buy list
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!deckCards.length}
                onClick={onCopySharedDecklist}
              >
                <Clipboard className="h-4 w-4" />
                {shareCopyState === "copied" ? "Copied" : "Copy decklist"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!deckCards.length}
                onClick={onDownloadSharedDecklist}
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
              {shareCopyState === "failed" ? (
                <span className="text-sm text-error">Copy failed.</span>
              ) : null}
            </div>
          ) : null}
          <ShareModeHidden shareMode={shareMode}>
            <Button asChild variant="outline" size="sm">
              <Link to="/decks/$id/playtest" params={{ id: deck.id }}>
                <Play className="h-4 w-4" />
                Playtest
              </Link>
            </Button>
            <Button type="button" size="sm" onClick={onOpenAddCard}>
              <Plus className="h-4 w-4" />
              Add card
            </Button>
          </ShareModeHidden>
          <DeckGroupMenu value={groupBy} onChange={onGroupByChange} />
        </div>
      </div>

      <ShareModeHidden shareMode={shareMode}>
        {selectedDeckCardCount > 0 ? (
          <div className="grid gap-3 rounded-box border border-base-300 bg-base-100 p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span className="font-semibold">{selectedDeckCardCount} selected</span>
                <span className="text-xs text-base-content/60">Shift-click selects a range.</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!deckCards.length || allDeckCardsSelected}
                  onClick={onSelectAllDeckCards}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!selectedDeckCardCount}
                  onClick={onClearSelectedDeckCards}
                >
                  Clear
                </Button>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!selectedDeckCardCount || isUpdatingDeckCard}
                onClick={onOpenDeleteSelected}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                className="select select-bordered select-sm w-40"
                aria-label="Move selected cards"
                disabled={!selectedDeckCardCount || isUpdatingDeckCard}
                defaultValue=""
                onChange={(event) => {
                  const zone = event.currentTarget.value as DeckZone | ""
                  if (zone) onUpdateSelectedDeckCards({ zone })
                  event.currentTarget.value = ""
                }}
              >
                <option value="">Move to zone...</option>
                {MOVE_TARGET_ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {titleize(zone)}
                  </option>
                ))}
              </select>

              <label className="join h-8 items-stretch">
                <span className="join-item flex h-8 min-h-8 items-center border border-base-300 bg-base-200 px-2 text-xs font-semibold">
                  Qty
                </span>
                <Input
                  className="join-item h-8 min-h-8 w-20"
                  type="number"
                  min={1}
                  value={bulkQuantity}
                  disabled={!selectedDeckCardCount || isUpdatingDeckCard}
                  onChange={(event) =>
                    onSetBulkQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
                  }
                />
                <Button
                  type="button"
                  className="join-item h-8 min-h-8 px-3"
                  size="sm"
                  disabled={!selectedDeckCardCount || isUpdatingDeckCard}
                  onClick={() => onUpdateSelectedDeckCards({ quantity: bulkQuantity })}
                >
                  Set
                </Button>
              </label>

              <select
                className="select select-bordered select-sm w-44"
                aria-label="Tag selected cards"
                disabled={!selectedDeckCardCount || isUpdatingDeckCard}
                defaultValue=""
                onChange={(event) => {
                  const value = event.currentTarget.value as DeckCardTag | "clear" | ""
                  if (value === "clear") onTagSelectedDeckCards(null)
                  else if (value) onTagSelectedDeckCards(value)
                  event.currentTarget.value = ""
                }}
              >
                <option value="">Tag selected...</option>
                {DECK_CARD_TAGS.map((tag) => (
                  <option key={tag.value} value={tag.value}>
                    {tag.label}
                  </option>
                ))}
                <option value="clear">Clear tag</option>
              </select>
            </div>
            {bulkActionError ? (
              <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                {bulkActionError}
              </p>
            ) : null}
          </div>
        ) : null}
      </ShareModeHidden>

      {groupedCards.length ? (
        <DeckGroupGrid
          allocationError={allocationError}
          canSetCommander={deck.format === "commander"}
          deckId={deck.id}
          groups={groupedCards}
          isSelecting={isSelectionActive}
          isUpdating={isUpdatingDeckCard}
          selectedCardIds={selectedDeckCardIds}
          highlightedCardIds={highlightedDeckCardIds}
          onPreview={onPreviewCard}
          onMove={onMoveCard}
          onEdit={onEditCard}
          onAllocate={onAllocate}
          onDeallocate={onDeallocate}
          onTag={onTagCard}
          onToggleProxy={onToggleProxy}
          onDelete={onDeleteCard}
          onSetCommander={onSetCommander}
          onToggleSelected={onToggleSelected}
          shareMode={shareMode}
        />
      ) : (
        <EmptyState title="No cards in this deck" />
      )}

      <div className="space-y-3">
        <DeckZoneTable
          cards={sideboardCards}
          deckId={deck.id}
          isSelecting={isSelectionActive}
          isUpdating={isUpdatingDeckCard}
          selectedCardIds={selectedDeckCardIds}
          highlightedCardIds={highlightedDeckCardIds}
          shareMode={shareMode}
          onPreview={onPreviewCard}
          title="Sideboard"
          onMove={onMoveCard}
          onEdit={onEditCard}
          onDelete={onDeleteCard}
          onTag={onTagCard}
          onToggleSelected={onToggleSelected}
        />
        <DeckZoneTable
          cards={maybeboardCards}
          deckId={deck.id}
          isSelecting={isSelectionActive}
          isUpdating={isUpdatingDeckCard}
          selectedCardIds={selectedDeckCardIds}
          highlightedCardIds={highlightedDeckCardIds}
          shareMode={shareMode}
          onPreview={onPreviewCard}
          title="Maybeboard"
          onMove={onMoveCard}
          onEdit={onEditCard}
          onDelete={onDeleteCard}
          onTag={onTagCard}
          onToggleSelected={onToggleSelected}
        />
      </div>

      <DeckTokensSection tokens={deckTokens} />
      <DeckStatsSection stats={deckStats} onHighlightDeckCards={onHighlightDeckCards} />
    </div>
  )
}
