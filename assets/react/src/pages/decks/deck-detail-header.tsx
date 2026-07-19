import { Link } from "@tanstack/react-router"
import {
  Archive,
  AlertTriangle,
  CheckSquare,
  Clipboard,
  Download,
  Layers,
  Play,
  Plus,
  ShoppingCart,
} from "lucide-react"
import type { ReactNode } from "react"

import { ImageSummaryCard } from "../../components/image-summary-card"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import type { DeckGroupBy } from "../../lib/deck-grouping"
import { compactNumber, cn, titleize } from "../../lib/utils"
import { ShareModeHidden, SummaryActionMenu } from "./deck-actions"
import { deckDetailCoverUrl } from "./deck-card-model"
import type { DeckLegalityIssue, DeckPrice, DetailZoneCounts } from "./deck-detail-types"
import { DeckGroupMenu } from "./deck-group-menu"
import { deckLegalityIssueCountLabel, deckLegalityLabel, deckLegalityTone } from "./deck-legality"
import { DeckNameWithCommanderIdentity, commanderColorIdentity } from "./deck-list-model"
import { DeckTagsSidebar } from "./deck-tags-sidebar"
import type { DeckCardEntry, DeckCustomTag, DeckDetail, DeckZone } from "./deck-types"

type DeckTagActions = {
  activeTagId: string | null
  onCreate: (input: { name: string; color: string; targetCount: number | null }) => void
  onDelete: (id: string) => void
  onJumpTo: (tagId: string) => void
  onReorder: (tagIds: string[]) => void
  onUpdate: (id: string, input: { name: string; color: string; targetCount: number | null }) => void
}

type DeckDetailHeaderProps = {
  children: ReactNode
  canEdit: boolean
  deck: DeckDetail
  deckCards: DeckCardEntry[]
  deckPrice: DeckPrice | null
  deckTags: DeckCustomTag[]
  groupBy: DeckGroupBy
  hasBuylistWork: boolean
  hasReadinessWork: boolean
  isSelectionActive: boolean
  isRefreshing: boolean
  legalityIssues: DeckLegalityIssue[]
  onAddCard: () => void
  onCopySharedDecklist: () => void
  onDisassemble: () => void
  onDownloadSharedDecklist: () => void
  onEditDeck: () => void
  onExportDeck: () => void
  onGroupByChange: (groupBy: DeckGroupBy) => void
  onImportDeck: () => void
  onMissingCards: () => void
  onOpenEdhrec: () => void
  onOpenReadiness: () => void
  onShareBuylist: () => void
  onShareDeck: () => void
  onSharePlaytest: () => void
  onStartSelecting: () => void
  shareCopyState: "idle" | "copied" | "failed"
  shareMode: boolean
  tagActions: DeckTagActions
  zoneCounts: DetailZoneCounts
}

function DeckPriceChip({ onClick, price }: { onClick: () => void; price: DeckPrice | null }) {
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

function DeckTagPanels({
  canEdit,
  deckTags,
  shareMode,
  tagActions,
}: Pick<DeckDetailHeaderProps, "canEdit" | "deckTags" | "shareMode" | "tagActions">) {
  if (shareMode) return null

  const sidebar = (
    <DeckTagsSidebar
      tags={deckTags}
      activeTagId={tagActions.activeTagId}
      disabled={!canEdit}
      onCreateTag={tagActions.onCreate}
      onDeleteTag={tagActions.onDelete}
      onJumpToTag={tagActions.onJumpTo}
      onReorderTags={tagActions.onReorder}
      onUpdateTag={tagActions.onUpdate}
      variant="sidebar"
    />
  )

  return (
    <div className="hidden lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      {sidebar}
    </div>
  )
}

export function DeckMobileTagsPanel({
  canEdit,
  deckTags,
  shareMode,
  tagActions,
}: Pick<DeckDetailHeaderProps, "canEdit" | "deckTags" | "shareMode" | "tagActions">) {
  if (shareMode) return null

  return (
    <div className="lg:hidden">
      <DeckTagsSidebar
        tags={deckTags}
        activeTagId={tagActions.activeTagId}
        disabled={!canEdit}
        onCreateTag={tagActions.onCreate}
        onDeleteTag={tagActions.onDelete}
        onJumpToTag={tagActions.onJumpTo}
        onReorderTags={tagActions.onReorder}
        onUpdateTag={tagActions.onUpdate}
        storageKey="manavault.deckTags.mobilePanelCollapsed"
        variant="panel"
      />
    </div>
  )
}

export function DeckDetailHeader({
  canEdit,
  children,
  deck,
  deckCards,
  deckPrice,
  deckTags,
  groupBy,
  hasBuylistWork,
  hasReadinessWork,
  isRefreshing,
  isSelectionActive,
  legalityIssues,
  onAddCard,
  onCopySharedDecklist,
  onDisassemble,
  onDownloadSharedDecklist,
  onEditDeck,
  onExportDeck,
  onGroupByChange,
  onImportDeck,
  onMissingCards,
  onOpenEdhrec,
  onOpenReadiness,
  onShareBuylist,
  onShareDeck,
  onSharePlaytest,
  onStartSelecting,
  shareCopyState,
  shareMode,
  tagActions,
  zoneCounts,
}: DeckDetailHeaderProps) {
  return (
    <>
      <DeckTagPanels
        canEdit={canEdit}
        deckTags={deckTags}
        shareMode={shareMode}
        tagActions={tagActions}
      />
      <div className="min-w-0 space-y-7">
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
              <Badge tone={deckLegalityTone(deck.legality)}>
                {deckLegalityLabel(deck.legality)}
              </Badge>
              <DeckPriceChip
                price={deckPrice}
                onClick={shareMode ? onShareBuylist : onMissingCards}
              />
              {isRefreshing ? <Badge tone="neutral">Refreshing…</Badge> : null}
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
                onDisassemble={canEdit ? onDisassemble : undefined}
                onEdhrec={canEdit && deck.format === "commander" ? onOpenEdhrec : undefined}
                onEdit={onEditDeck}
                onExport={onExportDeck}
                onImport={canEdit ? onImportDeck : undefined}
                onMissing={canEdit && hasBuylistWork ? onMissingCards : undefined}
                onShare={onShareDeck}
              />
            </ShareModeHidden>
          }
        />

        {!canEdit ? (
          <div className="rounded-box border border-base-300 bg-base-200/60 p-4 text-sm text-base-content/75">
            <div className="flex flex-wrap items-center gap-2 font-bold text-base-content">
              <Archive className="h-4 w-4" />
              <span>Archived decklist</span>
            </div>
            <p className="mt-1 max-w-3xl">
              This deck is view-only. Use Edit to unarchive it before changing cards, tags,
              printings, or collection allocations.
            </p>
          </div>
        ) : null}

        {legalityIssues.length ? (
          <div className="rounded-box border border-error/25 bg-error/5 p-4 text-sm text-base-content/80">
            <div className="mb-2 flex flex-wrap items-center gap-2 font-bold text-error">
              <AlertTriangle className="h-4 w-4" />
              <span>{deckLegalityIssueCountLabel(legalityIssues.length)}</span>
            </div>
            <ul className="space-y-1.5">
              {legalityIssues.map((issue, index) => (
                <li
                  key={`${issue.code}-${issue.cardName || "deck"}-${index}`}
                  className="flex gap-2"
                >
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
                  onClick={onSharePlaytest}
                >
                  <Play className="h-4 w-4" />
                  Playtest
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!deckCards.length}
                  onClick={onShareBuylist}
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
              {canEdit ? (
                <>
                  <Button type="button" size="sm" onClick={onAddCard}>
                    <Plus className="h-4 w-4" />
                    Add card
                  </Button>
                  {!isSelectionActive ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!deckCards.length}
                      onClick={onStartSelecting}
                    >
                      <CheckSquare className="h-4 w-4" />
                      Select
                    </Button>
                  ) : null}
                  {hasReadinessWork ? (
                    <Button type="button" variant="outline" size="sm" onClick={onOpenReadiness}>
                      Pull list
                    </Button>
                  ) : null}
                </>
              ) : null}
            </ShareModeHidden>
            <DeckGroupMenu value={groupBy} onChange={onGroupByChange} />
          </div>
        </div>
        {children}
      </div>
    </>
  )
}
