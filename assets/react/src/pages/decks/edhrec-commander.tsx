import { ChevronDown, Eye } from "lucide-react"

import { EmptyState } from "../../components/card-image"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { compactNumber } from "../../lib/utils"
import { cardImageUrl } from "./deck-card-model"
import type {
  DeckDetail,
  EDHRecAddZone,
  EDHRecCardReturnSearch,
  EDHRecCommanderPage,
  EDHRecSection,
  EDHRecSectionCard,
} from "./deck-types"
import { EDHRecScrollContainer } from "./edhrec-card-grid"
import { CollectionStatusBadge, EDHRecCardLink, EDHRecCardMenu } from "./edhrec-card-menu"
import {
  commanderDeckCard,
  edhrecCardImageUrl,
  edhrecCardPrice,
  formatSynergy,
} from "./edhrec-helpers"

export function EDHRecCommanderData({
  cardReturnSearch,
  deck,
  isAddingCard,
  onAddCard,
  pages,
  scrollStorageKey,
}: {
  cardReturnSearch: EDHRecCardReturnSearch
  deck: DeckDetail | null
  isAddingCard: boolean
  onAddCard: (card: EDHRecSectionCard, zone: EDHRecAddZone) => void
  pages: EDHRecCommanderPage[]
  scrollStorageKey: string
}) {
  if (!pages.length) return <EmptyState title="No commander data returned" />

  return (
    <EDHRecScrollContainer className="space-y-8" storageKey={scrollStorageKey}>
      {pages.map((page) => (
        <section key={page.name} className="space-y-4">
          <EDHRecCommanderHero deck={deck} page={page} />

          <div className="space-y-5">
            {page.sections.map((section) => (
              <EDHRecSectionPanel
                key={`${page.name}-${section.tag || section.header}`}
                cardReturnSearch={cardReturnSearch}
                isAddingCard={isAddingCard}
                onAddCard={onAddCard}
                section={section}
              />
            ))}
          </div>
        </section>
      ))}
    </EDHRecScrollContainer>
  )
}

export function EDHRecCommanderHero({
  deck,
  page,
}: {
  deck: DeckDetail | null
  page: EDHRecCommanderPage
}) {
  const commander = commanderDeckCard(deck, page.name)
  const imageUrl = commander ? cardImageUrl(commander, "imageUrl") : null

  return (
    <section className="grid gap-5 rounded-box border border-base-300 bg-base-200/45 p-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-60">
        <figure className="aspect-[5/7] overflow-hidden rounded-xl bg-base-300 shadow-xl ring-1 ring-base-content/10">
          {imageUrl ? (
            <img src={imageUrl} alt={page.name} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-base-content/55">
              {page.name}
            </div>
          )}
        </figure>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-2xl font-black tracking-normal">{page.title}</h3>
            <p className="mt-1 text-sm text-base-content/65">{page.description}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={page.url} target="_blank" rel="noreferrer">
              <Eye className="h-4 w-4" />
              EDHREC
            </a>
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {page.stats.slice(0, 8).map((stat) => (
            <div
              key={`${page.name}-${stat.label}`}
              className="rounded-box border border-base-300 bg-base-100/70 p-3"
            >
              <div className="text-xs font-semibold uppercase text-base-content/55">
                {stat.label}
              </div>
              <div className="mt-1 text-lg font-black">{stat.value}</div>
            </div>
          ))}
        </div>

        {page.themes.length ? (
          <div className="flex flex-wrap gap-2">
            {page.themes.map((theme) => (
              <Badge key={`${page.name}-${theme.slug || theme.name}`} tone="primary">
                {theme.name}
                {theme.count ? ` ${compactNumber(theme.count)}` : ""}
              </Badge>
            ))}
          </div>
        ) : null}

        {page.similar.length ? (
          <div className="text-sm text-base-content/65">
            <span className="font-semibold text-base-content/80">Similar:</span>{" "}
            {page.similar.join(", ")}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function EDHRecSectionPanel({
  cardReturnSearch,
  isAddingCard,
  onAddCard,
  section,
}: {
  cardReturnSearch: EDHRecCardReturnSearch
  isAddingCard: boolean
  onAddCard: (card: EDHRecSectionCard, zone: EDHRecAddZone) => void
  section: EDHRecSection
}) {
  return (
    <details open className="group rounded-box border border-base-300 bg-base-100/80">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-base-300 px-4 py-3 marker:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown className="h-4 w-4 shrink-0 text-base-content/55 transition group-open:rotate-180" />
          <h4 className="truncate font-black tracking-normal">{section.header}</h4>
        </span>
        <span className="badge badge-ghost shrink-0">{section.cards.length}</span>
      </summary>
      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] sm:gap-4">
          {section.cards.map((card) => (
            <EDHRecSectionCardTile
              key={`${section.header}-${card.oracleId || card.name}`}
              card={card}
              cardReturnSearch={cardReturnSearch}
              isAddingCard={isAddingCard}
              onAddCard={onAddCard}
            />
          ))}
        </div>
      </div>
    </details>
  )
}

export function EDHRecSectionCardTile({
  card,
  cardReturnSearch,
  isAddingCard,
  onAddCard,
}: {
  card: EDHRecSectionCard
  cardReturnSearch: EDHRecCardReturnSearch
  isAddingCard: boolean
  onAddCard: (card: EDHRecSectionCard, zone: EDHRecAddZone) => void
}) {
  const imageUrl = edhrecCardImageUrl(card)

  return (
    <article className="min-w-0">
      <EDHRecCardLink card={card} cardReturnSearch={cardReturnSearch} className="block">
        <figure className="relative aspect-[5/7] overflow-hidden rounded-lg bg-base-300 shadow-md ring-1 ring-base-content/10 transition hover:-translate-y-0.5 hover:shadow-xl">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={card.name}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-3 text-center text-xs text-base-content/55">
              {card.name}
            </div>
          )}
          <div className="absolute bottom-1.5 right-1.5">
            <CollectionStatusBadge status={card.collectionStatus} compact />
          </div>
        </figure>
      </EDHRecCardLink>
      <div className="mt-2 flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <EDHRecCardLink
            card={card}
            cardReturnSearch={cardReturnSearch}
            className="block truncate text-sm font-black hover:text-primary"
          >
            {card.name}
          </EDHRecCardLink>
          <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-base-content/60">
            <span>{formatSynergy(card)}</span>
            <span>
              {card.numDecks ? `${compactNumber(card.numDecks)} decks` : edhrecCardPrice(card)}
            </span>
          </div>
        </div>
        <EDHRecCardMenu
          card={card}
          cardReturnSearch={cardReturnSearch}
          isAddingCard={isAddingCard}
          onAddCard={(zone) => onAddCard(card, zone)}
        />
      </div>
    </article>
  )
}
