import { useMemo } from "react"

import { CardTile } from "../../components/card-tile"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { titleize } from "../../lib/utils"
import type { DeckPrice } from "./deck-detail-types"
import {
  DeckCardAllocationPanel,
  allocationStatusLabel,
  allocationStatusSummary,
} from "./deck-card-allocation"
import { deckPullZones, summarizeDeckPullNeeds } from "./deck-readiness"
import { DECK_CARD_TAGS, type DeckCardEntry, type DeckCardTag } from "./deck-types"
type DeckDetailReadinessProps = {
  allocationError: string | null
  buylistPrice: DeckPrice | null
  canBulkAllocate: boolean
  deckCards: DeckCardEntry[]
  isPending: boolean
  onAllocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onClose: () => void
  onDeallocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onMissingCards: () => void
  onOpenBulkAllocation: () => void
  onOpenOptimizePrintings: () => void
  onTagCard: (deckCard: DeckCardEntry, tag: DeckCardTag | null) => void
  onToggleProxy: (deckCard: DeckCardEntry) => void
  open: boolean
  readOnly: boolean
}

function DeckReadinessMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-btn bg-base-200/60 px-3 py-2">
      <dt className="text-xs font-semibold text-base-content/60">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-black leading-none text-base-content">{value}</dd>
    </div>
  )
}

function DeckReadinessCard({
  allocationError,
  deckCard,
  isPending,
  onAllocate,
  onDeallocate,
  onTagCard,
  onToggleProxy,
}: {
  allocationError: string | null
  deckCard: DeckCardEntry
  isPending: boolean
  onAllocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onDeallocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onTagCard: (deckCard: DeckCardEntry, tag: DeckCardTag | null) => void
  onToggleProxy: (deckCard: DeckCardEntry) => void
}) {
  const name = deckCard.card?.name || "Unknown card"
  const printing = deckCard.preferredPrinting || deckCard.fallbackPrinting

  return (
    <article className="grid gap-4 rounded-box border border-base-300 bg-base-100 p-3 sm:grid-cols-[11rem_minmax(0,1fr)] lg:grid-cols-[14.25rem_minmax(0,1fr)]">
      <CardTile
        className="w-32 sm:w-full"
        finish={deckCard.finish}
        growOnHover={false}
        imageUrl={printing?.imageUrl || null}
        name={name}
        rarity={printing?.rarity}
        setCode={printing?.setCode}
        setLabel={
          printing?.setCode
            ? `${printing.setCode.toUpperCase()} #${printing.collectorNumber || "?"}`
            : undefined
        }
        setName={printing?.setName}
        showMenu={false}
        typeLine={deckCard.card?.typeLine}
      />
      <div className="min-w-0 space-y-3">
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h4 className="truncate font-black">{name}</h4>
              <Badge tone="neutral">{titleize(deckCard.zone)}</Badge>
            </div>
            <p className="mt-1 text-xs font-semibold text-base-content/70">
              {allocationStatusLabel(deckCard.allocationStatus)}
            </p>
            <p className="text-xs text-base-content/60">
              {allocationStatusSummary(deckCard.allocationStatus)}
            </p>
          </div>
          <label className="form-control">
            <span className="label-text mb-1 text-xs font-semibold uppercase text-base-content/60">
              Tag
            </span>
            <select
              className="select select-bordered select-sm w-full"
              aria-label={`Tag ${name}`}
              disabled={isPending}
              value={deckCard.tag || ""}
              onChange={(event) => {
                const value = event.currentTarget.value
                onTagCard(deckCard, value ? (value as DeckCardTag) : null)
              }}
            >
              <option value="">No tag</option>
              {DECK_CARD_TAGS.map((tag) => (
                <option key={tag.value} value={tag.value}>
                  {tag.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DeckCardAllocationPanel
          deckCard={deckCard}
          error={allocationError}
          isUpdating={isPending}
          onAllocate={(collectionItemId) => onAllocate(deckCard, collectionItemId)}
          onDeallocate={(collectionItemId) => onDeallocate(deckCard, collectionItemId)}
          onToggleProxy={() => onToggleProxy(deckCard)}
        />
      </div>
    </article>
  )
}

export function DeckDetailReadiness({
  allocationError,
  buylistPrice,
  canBulkAllocate,
  deckCards,
  isPending,
  onAllocate,
  onClose,
  onDeallocate,
  onMissingCards,
  onOpenBulkAllocation,
  onOpenOptimizePrintings,
  onTagCard,
  onToggleProxy,
  open,
  readOnly,
}: DeckDetailReadinessProps) {
  const readiness = useMemo(() => summarizeDeckPullNeeds(open ? deckCards : []), [deckCards, open])
  const pullActionCards = useMemo(
    () =>
      (open ? deckPullZones(deckCards) : []).filter((deckCard) => {
        const status = deckCard.allocationStatus
        const required = Math.max(status.required || 0, 0)
        const allocated = Math.max(status.allocated || 0, 0)
        const proxied = Math.max(status.proxyAllocated || 0, 0)
        return status.state !== "basic_land" && Math.min(required, allocated + proxied) < required
      }),
    [deckCards, open],
  )
  const needsAction = readiness.readyCount < readiness.requiredCount

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl" labelledBy="deck-readiness-title">
        <DialogHeader>
          <div>
            <DialogTitle id="deck-readiness-title">Deck pull list</DialogTitle>
            <p className="mt-1 text-sm text-base-content/65">
              Mainboard and commander only. Sideboard and maybeboard stay out of this workflow.
            </p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="grid gap-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-base-content/70">
                {needsAction
                  ? "These cards still need a physical copy pulled, bought, or proxied."
                  : "Mainboard and commander cards are accounted for."}
              </p>
              <p className="mt-1 text-sm text-base-content/60">
                Use the images to recognize cards quickly, then allocate owned copies or tag cards
                inline.
              </p>
            </div>
            <div className="font-mono text-3xl font-black text-base-content">
              {readiness.readinessPercent}%
            </div>
          </div>

          <div
            className="h-2 overflow-hidden rounded-full bg-base-200"
            aria-label={`${readiness.readyCount} of ${readiness.requiredCount} deck cards ready`}
            role="img"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${readiness.readinessPercent}%` }}
            />
          </div>

          <dl className="grid gap-2 sm:grid-cols-4">
            <DeckReadinessMetric
              label="Accounted for"
              value={`${readiness.readyCount}/${readiness.requiredCount}`}
            />
            <DeckReadinessMetric label="To pull" value={readiness.availableToPull} />
            <DeckReadinessMetric label="To buy" value={readiness.missingToBuy} />
            <DeckReadinessMetric label="Proxy" value={readiness.proxyAllocated} />
          </dl>

          {!readOnly ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-btn border border-base-300 bg-base-100 p-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={onMissingCards}
                  >
                    Buy missing
                  </Button>
                  {buylistPrice ? (
                    <p className="mt-1 px-1 text-xs text-base-content/60">
                      Estimated buylist: <span className="font-mono">{buylistPrice.label}</span>
                    </p>
                  ) : null}
                </div>
                {canBulkAllocate ? (
                  <div className="rounded-btn border border-base-300 bg-base-100 p-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full justify-start"
                      onClick={onOpenBulkAllocation}
                    >
                      Pull owned cards
                    </Button>
                    <p className="mt-1 px-1 text-xs text-base-content/60">
                      Allocate available owned copies for mainboard and commander cards.
                    </p>
                  </div>
                ) : null}
                <div className="rounded-btn border border-base-300 bg-base-100 p-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={onOpenOptimizePrintings}
                  >
                    Optimize printings
                  </Button>
                  <p className="mt-1 px-1 text-xs text-base-content/60">
                    Review cheaper or owned printings for this deck.
                  </p>
                </div>
              </div>

              {pullActionCards.length ? (
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-black text-base-content">Cards needing work</h3>
                    <p className="mt-1 text-xs text-base-content/60">
                      Cards tagged Getting still appear here, but are excluded from the buy count
                      and buy list.
                    </p>
                  </div>
                  <div className="grid max-h-[min(34rem,52dvh)] gap-3 overflow-y-auto pr-1">
                    {pullActionCards.map((deckCard) => (
                      <DeckReadinessCard
                        key={deckCard.id}
                        allocationError={allocationError}
                        deckCard={deckCard}
                        isPending={isPending}
                        onAllocate={onAllocate}
                        onDeallocate={onDeallocate}
                        onTagCard={onTagCard}
                        onToggleProxy={onToggleProxy}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
