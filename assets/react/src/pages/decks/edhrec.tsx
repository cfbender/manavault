import { useState } from "react"
import { useQuery } from "@apollo/client/react"
import { Database, Sparkles, XCircle, type LucideIcon } from "lucide-react"

import { EmptyState } from "../../components/card-image"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { cn } from "../../lib/utils"
import type {
  DeckDetail,
  EDHRecAddZone,
  EDHRecCard,
  EDHRecSectionCard,
  EDHRecTab,
} from "./deck-types"
import { CardDetailDialog, type CardDetailDialogTarget } from "./deck-card-detail-dialog"
import { EDHRecCardGrid } from "./edhrec-card-grid"
import { EDHRecCommanderData } from "./edhrec-commander"
import { edhrecScrollStorageKey } from "./edhrec-helpers"
import { DeckEdhrecDocument } from "./queries"

export { EDHRecCardGrid, EDHRecCardTile, EDHRecScrollContainer } from "./edhrec-card-grid"
export { CollectionStatusBadge, EDHRecCardDetailTrigger, EDHRecCardMenu } from "./edhrec-card-menu"
export {
  EDHRecCommanderData,
  EDHRecCommanderHero,
  EDHRecSectionCardTile,
  EDHRecSectionPanel,
} from "./edhrec-commander"
export {
  cardTypeLine,
  collectionStatusShortLabel,
  collectionStatusTone,
  commanderDeckCard,
  edhrecCardImageUrl,
  edhrecCardPrice,
  edhrecCardPrintingId,
  edhrecCardReturnSearch,
  edhrecCardUrl,
  edhrecScrollStorageKey,
  formatOptionalNumber,
  formatSynergy,
  normalizeDisplayName,
  readEdhrecScrollPosition,
  writeEdhrecScrollPosition,
} from "./edhrec-helpers"

export function EDHRecDialog({
  activeTab,
  addCardError,
  deck,
  excludeLands,
  isAddingCard,
  onAddCard,
  onExcludeLandsChange,
  onOpenChange,
  onTabChange,
  open,
}: {
  activeTab: EDHRecTab
  addCardError: string | null
  deck: DeckDetail | null
  excludeLands: boolean
  isAddingCard: boolean
  onAddCard: (card: EDHRecCard | EDHRecSectionCard, zone: EDHRecAddZone) => void
  onExcludeLandsChange: (excludeLands: boolean) => void
  onOpenChange: (open: boolean) => void
  onTabChange: (tab: EDHRecTab) => void
  open: boolean
}) {
  const [previewCard, setPreviewCard] = useState<CardDetailDialogTarget | null>(null)
  const edhrecQuery = useQuery(DeckEdhrecDocument, {
    variables: {
      id: deck?.id || "",
      excludeLands,
    },
    skip: !open || !deck?.id,
  })
  const data = edhrecQuery.data?.deckEdhrec ?? edhrecQuery.previousData?.deckEdhrec
  const isInitialLoading = edhrecQuery.loading && !data
  const isRefreshing = edhrecQuery.loading && Boolean(data)
  const scrollStorageKey = deck?.id ? edhrecScrollStorageKey(deck.id, activeTab) : null
  const tabs = [
    { count: data?.recommendations.length || 0, icon: Sparkles, label: "Recs", value: "recs" },
    { count: data?.cuts.length || 0, icon: XCircle, label: "Cuts", value: "cuts" },
    {
      count: data?.commanderPages.reduce((total, page) => total + page.sections.length, 0) || 0,
      icon: Database,
      label: "Commander",
      value: "commander",
    },
  ] satisfies Array<{
    count: number
    icon: LucideIcon
    label: string
    value: EDHRecTab
  }>

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[calc(100svh-2rem)] max-w-[96rem] flex-col"
          labelledBy="edhrec-title"
        >
          <DialogHeader>
            <div>
              <DialogTitle id="edhrec-title">EDHREC</DialogTitle>
              <p className="mt-1 text-sm text-base-content/60">
                {deck?.name}
                {data?.commanderNames.length ? ` · ${data.commanderNames.join(" + ")}` : ""}
              </p>
            </div>
            <DialogClose onClose={() => onOpenChange(false)} />
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:gap-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      className={cn(
                        "btn btn-sm min-w-0 gap-1 px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm",
                        activeTab === tab.value ? "btn-primary" : "btn-outline",
                      )}
                      onClick={() => onTabChange(tab.value)}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{tab.label}</span>
                      <span className="badge badge-sm shrink-0">{tab.count}</span>
                    </button>
                  )
                })}
              </div>

              <label className="label cursor-pointer justify-start gap-2 rounded-btn border border-base-300 px-3 py-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={excludeLands}
                  onChange={(event) => onExcludeLandsChange(event.target.checked)}
                />
                <span className="label-text text-sm">Exclude lands</span>
              </label>
            </div>

            {isInitialLoading ? <EmptyState title="Loading EDHREC..." /> : null}

            {edhrecQuery.error ? (
              <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                {edhrecQuery.error instanceof Error
                  ? edhrecQuery.error.message
                  : "Could not load EDHREC data"}
              </p>
            ) : null}

            {addCardError ? (
              <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                {addCardError}
              </p>
            ) : null}

            {isRefreshing ? (
              <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                Refreshing EDHREC…
              </p>
            ) : null}

            {data && scrollStorageKey ? (
              <>
                {activeTab === "recs" ? (
                  <EDHRecCardGrid
                    cards={data.recommendations}
                    emptyTitle="No EDHREC recommendations returned"
                    isAddingCard={isAddingCard}
                    mode="recs"
                    onAddCard={onAddCard}
                    onPreviewCard={setPreviewCard}
                    scrollStorageKey={scrollStorageKey}
                  />
                ) : null}
                {activeTab === "cuts" ? (
                  <EDHRecCardGrid
                    cards={data.cuts}
                    emptyTitle="No EDHREC cuts returned"
                    isAddingCard={isAddingCard}
                    mode="cuts"
                    onAddCard={onAddCard}
                    onPreviewCard={setPreviewCard}
                    scrollStorageKey={scrollStorageKey}
                  />
                ) : null}
                {activeTab === "commander" ? (
                  <EDHRecCommanderData
                    deck={deck}
                    isAddingCard={isAddingCard}
                    onAddCard={onAddCard}
                    onPreviewCard={setPreviewCard}
                    pages={data.commanderPages}
                    scrollStorageKey={scrollStorageKey}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <CardDetailDialog
        card={previewCard}
        hidePrivateControls={false}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPreviewCard(null)
        }}
      />
    </>
  )
}
