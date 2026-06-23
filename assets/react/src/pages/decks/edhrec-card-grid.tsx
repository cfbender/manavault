import { useEffect, useRef, type ReactNode } from "react"

import { EmptyState } from "../../components/card-image"
import { cn } from "../../lib/utils"
import type { EDHRecAddZone, EDHRecCard, EDHRecCardReturnSearch } from "./deck-types"
import { CollectionStatusBadge, EDHRecCardLink, EDHRecCardMenu } from "./edhrec-card-menu"
import {
  cardTypeLine,
  edhrecCardImageUrl,
  edhrecCardPrice,
  formatOptionalNumber,
  readEdhrecScrollPosition,
  writeEdhrecScrollPosition,
} from "./edhrec-helpers"

export function EDHRecScrollContainer({
  children,
  className,
  storageKey,
}: {
  children: ReactNode
  className?: string
  storageKey?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = scrollRef.current
    if (!element || !storageKey) return

    element.scrollTop = readEdhrecScrollPosition(storageKey)

    return () => {
      writeEdhrecScrollPosition(storageKey, element.scrollTop)
    }
  }, [storageKey])

  return (
    <div
      ref={scrollRef}
      className={cn("min-h-0 flex-1 overflow-y-auto pr-1", className)}
      onScroll={(event) => {
        if (storageKey) writeEdhrecScrollPosition(storageKey, event.currentTarget.scrollTop)
      }}
    >
      {children}
    </div>
  )
}

export function EDHRecCardGrid({
  cards,
  cardReturnSearch,
  emptyTitle,
  isAddingCard,
  mode,
  onAddCard,
  scrollStorageKey,
}: {
  cards: EDHRecCard[]
  cardReturnSearch: EDHRecCardReturnSearch
  emptyTitle: string
  isAddingCard: boolean
  mode: "recs" | "cuts"
  onAddCard: (card: EDHRecCard, zone: EDHRecAddZone) => void
  scrollStorageKey: string
}) {
  if (!cards.length) return <EmptyState title={emptyTitle} />

  return (
    <EDHRecScrollContainer storageKey={scrollStorageKey}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-5">
        {cards.map((card) => (
          <EDHRecCardTile
            key={`${mode}-${card.oracleId || card.name}`}
            card={card}
            cardReturnSearch={cardReturnSearch}
            isAddingCard={isAddingCard}
            mode={mode}
            onAddCard={onAddCard}
          />
        ))}
      </div>
    </EDHRecScrollContainer>
  )
}

export function EDHRecCardTile({
  card,
  cardReturnSearch,
  isAddingCard,
  mode,
  onAddCard,
}: {
  card: EDHRecCard
  cardReturnSearch: EDHRecCardReturnSearch
  isAddingCard: boolean
  mode: "recs" | "cuts"
  onAddCard: (card: EDHRecCard, zone: EDHRecAddZone) => void
}) {
  const imageUrl = edhrecCardImageUrl(card)
  const score = typeof card.score === "number" ? Math.max(0, Math.min(100, card.score)) : null

  return (
    <article className="min-w-0">
      <EDHRecCardLink card={card} cardReturnSearch={cardReturnSearch} className="block">
        <figure className="relative aspect-[5/7] overflow-hidden rounded-xl bg-base-300 shadow-lg ring-1 ring-base-content/10 transition hover:-translate-y-0.5 hover:shadow-2xl">
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
          <div className="absolute bottom-2 right-2">
            <CollectionStatusBadge status={card.collectionStatus} />
          </div>
        </figure>
      </EDHRecCardLink>

      <div className="mt-2 space-y-1.5">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <EDHRecCardLink
              card={card}
              cardReturnSearch={cardReturnSearch}
              className="block truncate text-sm font-black hover:text-primary"
            >
              {card.name}
            </EDHRecCardLink>
            <div className="truncate text-xs text-base-content/60">
              {cardTypeLine(card) || "EDHREC"}
            </div>
          </div>
          <EDHRecCardMenu
            card={card}
            cardReturnSearch={cardReturnSearch}
            isAddingCard={isAddingCard}
            onAddCard={(zone) => onAddCard(card, zone)}
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-base-content/65">
          <span>{mode === "recs" ? "Score" : "Cut score"}</span>
          <span className="font-mono">{score == null ? "-" : Math.round(score)}</span>
        </div>
        <div className="relative h-4 overflow-hidden rounded bg-primary/15">
          <div
            className="h-full rounded bg-primary/80"
            style={{ width: `${score == null ? 0 : score}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[0.65rem] font-black leading-none text-primary-content mix-blend-screen">
            {score == null ? "-" : Math.round(score)}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-base-content/60">
          <span>{edhrecCardPrice(card) || "No local price"}</span>
          <span>Salt {formatOptionalNumber(card.salt)}</span>
        </div>
      </div>
    </article>
  )
}
