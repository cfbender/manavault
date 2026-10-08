import { Link } from "@tanstack/react-router"
import {
  Archive,
  AlertTriangle,
  ArrowRightLeft,
  CheckSquare,
  Clipboard,
  createLucideIcon,
  Download,
  ExternalLink,
  Layers,
  Link2,
  MessageCircleQuestion,
  RefreshCw,
  Play,
  Plus,
  ShoppingCart,
} from "lucide-react"
import { useState, type ReactNode } from "react"

import { ImageSummaryCard } from "../../components/image-summary-card"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import type { DeckGroupBy } from "../../lib/deck-grouping"
import { compactNumber, cn, titleize } from "../../lib/utils"
import { ShareModeHidden, SummaryActionMenu } from "./deck-actions"
import { DeckAIAnalysis } from "./deck-ai-analysis"
import { DeckBracketBadge } from "./deck-bracket"
import type { DeckLegalityIssue, DeckPrice, DetailZoneCounts } from "./deck-detail-types"
import { DeckGroupMenu } from "./deck-group-menu"
import { deckLegalityIssueCountLabel, deckLegalityLabel, deckLegalityTone } from "./deck-legality"
import { DeckNameWithCommanderIdentity } from "./deck-list-model"
import { DeckPrimer } from "./deck-primer"
import { DeckQuestionDialog } from "./deck-question-dialog"
import { DeckTagsSidebar } from "./deck-tags-sidebar"
import type { DeckCardEntry, DeckCustomTag, DeckDetail } from "./deck-types"
import { useDeckAnalysis } from "./use-deck-analysis"
import { externalSourceLabel, useDeckExternalSource } from "./use-deck-external-source"
import { formatDate } from "../settings/data"

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
  /** Collection allocation is allowed (deck is not archived). */
  canAllocate: boolean
  /** Decklist edits are allowed (not archived and not linked to an external deck). */
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
  saltSum: number | null
  onAddCard: () => void
  onCombos: () => void
  onCompareDeck: () => void
  onCopySharedDecklist: () => void
  onDisassemble: () => void
  onDownloadSharedDecklist: () => void
  onEditDeck: () => void
  onExportDeck: () => void
  onExternalSource: () => void
  onGroupByChange: (groupBy: DeckGroupBy) => void
  onImportDeck: () => void
  onMissingCards: () => void
  onOpenEdhrec: () => void
  onOpenRecommander: () => void
  onOpenReadiness: () => void
  onShareBuylist: () => void
  onShareDeck: () => void
  onSharePlaytest: () => void
  onStartSelecting: () => void
  onSwapCards: () => void
  shareCopyState: "idle" | "copied" | "failed"
  shareMode: boolean
  tagActions: DeckTagActions
  zoneCounts: DetailZoneCounts
}

const SaltShakerIcon = createLucideIcon("salt-shaker", [
  ["path", { d: "M8 7h8", key: "cap" }],
  ["path", { d: "m9 7 .75-4h4.5L15 7", key: "top" }],
  ["path", { d: "M7 7.5 5.5 21h13L17 7.5", key: "body" }],
  ["path", { d: "M10 5h.01", key: "hole-left" }],
  ["path", { d: "M12 5h.01", key: "hole-center" }],
  ["path", { d: "M14 5h.01", key: "hole-right" }],
])

export function DeckSaltBadge({ saltSum }: { saltSum: number | null }) {
  if (saltSum === null) return null

  const label = `EDHREC salt sum: ${saltSum.toFixed(2)}`

  return (
    <Badge
      aria-label={label}
      title={label}
      className="inline-flex items-center gap-1.5 px-2 font-mono font-bold leading-none"
    >
      <SaltShakerIcon aria-hidden="true" className="h-3.5 w-3.5 translate-y-px" />
      <span className="translate-y-px tabular-nums leading-none">{saltSum.toFixed(2)}</span>
    </Badge>
  )
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

function DeckExternalSourceNotice({ deck, onManage }: { deck: DeckDetail; onManage: () => void }) {
  const { isSyncing, sync } = useDeckExternalSource(deck.id)
  const sourceLabel = externalSourceLabel(deck.externalSource)

  return (
    <div
      className={cn(
        "rounded-box border p-4 text-sm text-base-content/75",
        deck.externalSyncError
          ? "border-warning/40 bg-warning/5"
          : "border-base-300 bg-base-200/60",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-bold text-base-content">
            <Link2 className="h-4 w-4" />
            <span>Linked to {sourceLabel}</span>
          </div>
          <p className="mt-1 max-w-3xl">
            The decklist mirrors {sourceLabel} and syncs hourly, so card edits are disabled here.
            Allocating copies from your collection still works.
          </p>
          <p className="mt-1 text-xs text-base-content/60">
            {deck.externalSyncError
              ? `Last sync failed: ${deck.externalSyncError}`
              : deck.externalSyncedAt
                ? `Last synced ${formatDate(deck.externalSyncedAt)}`
                : "Not synced yet"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {deck.externalUrl ? (
            <Button asChild variant="outline" size="sm">
              <a href={deck.externalUrl} rel="noreferrer" target="_blank">
                <ExternalLink className="h-4 w-4" />
                Open in {sourceLabel}
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSyncing}
            onClick={() => sync()}
          >
            <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing..." : "Sync now"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onManage}>
            Manage
          </Button>
        </div>
      </div>
    </div>
  )
}

export function DeckDetailHeader({
  canAllocate,
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
  saltSum,
  onAddCard,
  onCombos,
  onCompareDeck,
  onCopySharedDecklist,
  onDisassemble,
  onDownloadSharedDecklist,
  onEditDeck,
  onExportDeck,
  onExternalSource,
  onGroupByChange,
  onImportDeck,
  onMissingCards,
  onOpenEdhrec,
  onOpenRecommander,
  onOpenReadiness,
  onShareBuylist,
  onShareDeck,
  onSharePlaytest,
  onStartSelecting,
  onSwapCards,
  shareCopyState,
  shareMode,
  tagActions,
  zoneCounts,
}: DeckDetailHeaderProps) {
  const [questionOpen, setQuestionOpen] = useState(false)
  const analysis = useDeckAnalysis(deck, !shareMode)
  const hasAnalysis = Boolean(deck.aiAnalysis?.trim())
  const canAnalyze = deck.status !== "archived"

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
          imageUrl={deck.coverImageUrl}
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
              <DeckBracketBadge deck={deck} />
              <DeckSaltBadge saltSum={saltSum} />
              <DeckPriceChip
                price={deckPrice}
                onClick={shareMode ? onShareBuylist : onMissingCards}
              />
              {isRefreshing ? <Badge tone="neutral">Refreshing…</Badge> : null}
            </div>
          }
          nameLine={
            <DeckNameWithCommanderIdentity colors={deck.commanderColorIdentity} name={deck.name} />
          }
          actionSlot={
            <ShareModeHidden shareMode={shareMode}>
              <SummaryActionMenu
                analyzeLabel={
                  analysis.pending
                    ? "Analyzing..."
                    : hasAnalysis
                      ? "Refresh AI analysis"
                      : "Analyze deck with AI"
                }
                analyzePending={analysis.pending || analysis.checking}
                label={`${deck.name} actions`}
                onAnalyze={canAnalyze ? analysis.analyze : undefined}
                onCombos={onCombos}
                onCompare={onCompareDeck}
                externalSourceLinked={Boolean(deck.externalSource)}
                onDisassemble={canAllocate ? onDisassemble : undefined}
                onEdhrec={canEdit && deck.format === "commander" ? onOpenEdhrec : undefined}
                onRecommander={
                  canEdit && deck.format === "commander" ? onOpenRecommander : undefined
                }
                onEdit={onEditDeck}
                onExport={onExportDeck}
                onExternalSource={canAllocate ? onExternalSource : undefined}
                onImport={canEdit ? onImportDeck : undefined}
                onMissing={canAllocate && hasBuylistWork ? onMissingCards : undefined}
                onShare={onShareDeck}
              />
            </ShareModeHidden>
          }
        />

        <DeckPrimer primer={deck.primer} />

        {analysis.connectionError ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 text-sm text-base-content/75"
          >
            <span>Unable to check AI analysis progress. It may still be running.</span>
            <Button variant="outline" size="sm" onClick={analysis.checkStatus}>
              Check status
            </Button>
          </div>
        ) : analysis.pending ? (
          <p role="status" className="text-sm text-base-content/75">
            Analyzing in the background. You can leave this page.
            {hasAnalysis
              ? " Your previous analysis is shown below until the new one is ready."
              : ""}
          </p>
        ) : analysis.failed ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 text-sm text-base-content/75"
          >
            <span>
              AI analysis could not be completed. Your saved analysis has not been changed.
            </span>
            {canAnalyze ? (
              <Button variant="outline" size="sm" onClick={analysis.analyze}>
                Retry analysis
              </Button>
            ) : null}
          </div>
        ) : null}

        <DeckAIAnalysis deck={deck} shareMode={shareMode} />

        {!canAllocate ? (
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
        ) : deck.externalSource && !shareMode ? (
          <DeckExternalSourceNotice deck={deck} onManage={onExternalSource} />
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
            {[
              { key: "commander", label: "Commander", count: zoneCounts.commander || 0 },
              { key: "mainboard", label: "Mainboard", count: zoneCounts.mainboard || 0 },
              {
                key: "considering",
                label: "Considering",
                count: zoneCounts.considering || 0,
              },
            ].map(({ key, label, count }) => (
              <div key={key} className="flex items-baseline gap-1.5">
                <dt
                  className={cn(
                    "text-xs font-black uppercase tracking-[0.16em]",
                    key === "commander" ? "text-primary" : "text-base-content/45",
                  )}
                >
                  {label}
                </dt>
                <dd className="font-mono text-sm font-black text-base-content/80">{count}</dd>
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuestionOpen(true)}
              >
                <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
                Ask AI
              </Button>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!deckCards.length}
                    onClick={onSwapCards}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    Swap cards
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
                </>
              ) : null}
              {canAllocate && hasReadinessWork ? (
                <Button type="button" variant="outline" size="sm" onClick={onOpenReadiness}>
                  Pull list
                </Button>
              ) : null}
            </ShareModeHidden>
            <DeckGroupMenu value={groupBy} onChange={onGroupByChange} />
          </div>
        </div>
        {children}
      </div>
      {!shareMode && questionOpen ? (
        <DeckQuestionDialog
          deckId={deck.id}
          deckName={deck.name}
          deckCards={deckCards}
          open={questionOpen}
          onOpenChange={setQuestionOpen}
        />
      ) : null}
    </>
  )
}
