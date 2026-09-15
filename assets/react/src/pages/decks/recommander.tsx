import { useMemo, useState } from "react"
import { useQuery } from "@apollo/client/react"
import { ExternalLink } from "lucide-react"

import { EmptyState } from "../../components/card-image"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { cn } from "../../lib/utils"
import { useMobileHoverReveal } from "../../lib/mobile-hover"
import type { DeckDetail, EDHRecAddZone, RecommanderCard } from "./deck-types"
import { CardDetailDialog, type CardDetailDialogTarget } from "./deck-card-detail-dialog"
import { EDHRecScrollContainer } from "./edhrec-card-grid"
import { CollectionStatusBadge, EDHRecCardDetailTrigger, EDHRecCardMenu } from "./edhrec-card-menu"
import { cardTypeLine, edhrecCardImageUrl, edhrecCardPrice } from "./edhrec-helpers"
import { DeckRecommanderDocument } from "./queries"

// Collection states that count as "owned" for the owned-only filter: the card
// is in this deck, freely available, or owned but allocated elsewhere.
const OWNED_STATES = new Set(["allocated", "available", "partial", "basic_land"])

export function RecommanderDialog({
  addCardError,
  deck,
  isAddingCard,
  onAddCard,
  onOpenChange,
  open,
}: {
  addCardError: string | null
  deck: DeckDetail | null
  isAddingCard: boolean
  onAddCard: (card: RecommanderCard, zone: EDHRecAddZone) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [previewCard, setPreviewCard] = useState<CardDetailDialogTarget | null>(null)
  const [ownedOnly, setOwnedOnly] = useState(false)
  const recommanderQuery = useQuery(DeckRecommanderDocument, {
    variables: { id: deck?.id || "" },
    skip: !open || !deck?.id,
  })
  const data =
    recommanderQuery.data?.deckRecommander ?? recommanderQuery.previousData?.deckRecommander
  const isInitialLoading = recommanderQuery.loading && !data
  const isRefreshing = recommanderQuery.loading && Boolean(data)
  const recommendations = useMemo(() => {
    const cards = data?.recommendations || []
    if (!ownedOnly) return cards
    return cards.filter((card) => OWNED_STATES.has(card.collectionStatus.state))
  }, [data, ownedOnly])
  const ownedCount = useMemo(
    () =>
      (data?.recommendations || []).filter((card) => OWNED_STATES.has(card.collectionStatus.state))
        .length,
    [data],
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[calc(100svh-2rem)] max-w-[96rem] flex-col"
          labelledBy="recommander-title"
        >
          <DialogHeader>
            <div>
              <DialogTitle id="recommander-title">Recommander</DialogTitle>
              <p className="mt-1 text-sm text-base-content/60">
                {deck?.name}
                {data?.commanders.length
                  ? ` · ${data.commanders.map((commander) => commander.name).join(" + ")}`
                  : ""}
                {" · recommendations tailored to this deck's current cards"}
              </p>
            </div>
            <DialogClose onClose={() => onOpenChange(false)} />
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-base-content/70">
                {data ? (
                  <>
                    <span className="font-bold">{recommendations.length}</span>
                    {ownedOnly ? ` of ${data.recommendations.length}` : ""} recommendations
                    {ownedCount ? ` · ${ownedCount} in your collection` : ""}
                  </>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(data?.commanders || [])
                  .filter((commander) => commander.url)
                  .map((commander) => (
                    <Button key={commander.name} asChild variant="outline" size="sm">
                      <a href={commander.url || ""} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        {data && data.commanders.length > 1
                          ? commander.name
                          : "View on Recommander"}
                      </a>
                    </Button>
                  ))}

                <label className="label cursor-pointer justify-start gap-2 rounded-btn border border-base-300 px-3 py-2">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={ownedOnly}
                    onChange={(event) => setOwnedOnly(event.target.checked)}
                  />
                  <span className="label-text text-sm">Owned cards only</span>
                </label>
              </div>
            </div>

            {isInitialLoading ? <EmptyState title="Loading Recommander..." /> : null}

            {recommanderQuery.error ? (
              <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                {recommanderQuery.error instanceof Error
                  ? recommanderQuery.error.message
                  : "Could not load Recommander data"}
              </p>
            ) : null}

            {addCardError ? (
              <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                {addCardError}
              </p>
            ) : null}

            {isRefreshing ? (
              <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                Refreshing Recommander…
              </p>
            ) : null}

            {data && !isInitialLoading ? (
              recommendations.length ? (
                <EDHRecScrollContainer
                  storageKey={deck?.id ? recommanderScrollKey(deck.id) : undefined}
                >
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-5">
                    {recommendations.map((card) => (
                      <RecommanderCardTile
                        key={card.oracleId || card.name}
                        card={card}
                        isAddingCard={isAddingCard}
                        onAddCard={onAddCard}
                        onPreviewCard={setPreviewCard}
                      />
                    ))}
                  </div>
                </EDHRecScrollContainer>
              ) : (
                <EmptyState
                  title={
                    ownedOnly
                      ? "No recommended cards in your collection"
                      : "No recommendations above Recommander's confidence threshold"
                  }
                />
              )
            ) : null}

            <p className="text-xs text-base-content/50">
              Card recommendations powered by{" "}
              <a className="link" href="https://recommander.cards" target="_blank" rel="noreferrer">
                Recommander
              </a>
              .
            </p>
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

function recommanderScrollKey(deckId: string) {
  return `manavault.recommander.scroll.${deckId}`
}

function RecommanderCardTile({
  card,
  isAddingCard,
  onAddCard,
  onPreviewCard,
}: {
  card: RecommanderCard
  isAddingCard: boolean
  onAddCard: (card: RecommanderCard, zone: EDHRecAddZone) => void
  onPreviewCard: (card: CardDetailDialogTarget) => void
}) {
  const imageUrl = edhrecCardImageUrl(card)
  const match = typeof card.score === "number" ? Math.max(0, Math.min(100, card.score * 100)) : null
  const [isTouchRevealed, setIsTouchRevealed] = useState(false)
  const mobileHover = useMobileHoverReveal<HTMLElement>({
    isRevealed: isTouchRevealed,
    onRevealChange: setIsTouchRevealed,
  })

  return (
    <article
      ref={mobileHover.ref}
      className="min-w-0"
      onClickCapture={mobileHover.suppressClickIfRevealed}
      onPointerDown={mobileHover.onPointerDown}
    >
      <EDHRecCardDetailTrigger card={card} className="block w-full" onPreviewCard={onPreviewCard}>
        <figure
          className={cn(
            "relative aspect-[5/7] overflow-hidden rounded-xl bg-base-300 shadow-lg ring-1 ring-base-content/10 transition hover:-translate-y-0.5 hover:shadow-2xl",
            isTouchRevealed && "-translate-y-0.5 shadow-2xl",
          )}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={card.name}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-base-content/55">
              {card.name}
            </div>
          )}
          <div className="absolute left-2 top-2 rounded-btn bg-base-100/90 px-1.5 py-0.5 text-xs font-black shadow-sm backdrop-blur">
            #{card.rank}
          </div>
          <div className="absolute bottom-2 right-2">
            <CollectionStatusBadge status={card.collectionStatus} />
          </div>
        </figure>
      </EDHRecCardDetailTrigger>

      <div className="mt-2 space-y-1.5">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <EDHRecCardDetailTrigger
              card={card}
              onPreviewCard={onPreviewCard}
              className={cn(
                "block w-full truncate text-sm font-black hover:text-primary",
                isTouchRevealed && "text-primary",
              )}
            >
              {card.name}
            </EDHRecCardDetailTrigger>
            <div className="truncate text-xs text-base-content/60">
              {cardTypeLine(card) || "Recommander"}
            </div>
          </div>
          <EDHRecCardMenu
            card={card}
            isPending={isAddingCard}
            mode="recs"
            onPreviewCard={onPreviewCard}
            onAddCard={(zone) => onAddCard(card, zone)}
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-base-content/60">
          <span>{edhrecCardPrice(card) || "No local price"}</span>
          <span className="font-mono">{match == null ? "-" : `${match.toFixed(1)}% match`}</span>
        </div>
      </div>
    </article>
  )
}
