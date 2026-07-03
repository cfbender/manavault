import { useQuery } from "@apollo/client/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { shuffle } from "es-toolkit"
import { PageHeader } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { FullscreenPrintingDialog } from "../../components/fullscreen-printing-dialog"
import DomeGallery, { type DomeGalleryCard } from "../../components/dome-gallery"
import { Button } from "../../components/ui/button"
import { graphqlEndpointContext } from "../../lib/apollo"
import { usePageTitle } from "../../lib/page-title"
import {
  buildCollectionFilterQuery,
  cloneCollectionFilters,
  combineCollectionQueries,
  countActiveCollectionFilters,
  decodeCollectionFilters,
  EMPTY_COLLECTION_FILTERS,
  encodeCollectionFilters,
  type CollectionFilterState,
} from "../../lib/collection-filters"
import { present } from "../../lib/utils"
import {
  AddCollectionItemDialog,
  CollectionFilterModal,
  type AddCollectionItemInitialPrinting,
} from "../collection"
import { CardActionsMenu } from "./card-actions-menu"
import { AddCatalogCardToDeckDialog, type CardDeckTarget } from "./add-card-to-deck-dialog"
import { CardCollectionCopiesPanel } from "./card-collection-copies"
import { CardPrintingsGrid } from "./card-printings-grid"
import { CardResultsGrid } from "./card-results-grid"
import { ManaText, OracleTextPanel } from "./card-text"
import { CardDocument, CardsDocument } from "./data"
import { CardLegalityPanel, CardRulings, CardTagSummary } from "./detail-sections"
import { CardSearchForm } from "./search-form"
import useIsMobile from "../../lib/mobile-hover"

type NodeConnection<T> =
  | {
      edges?: ReadonlyArray<{ node?: T | null } | null> | null
    }
  | null
  | undefined

function connectionNodes<T>(connection: NodeConnection<T>): T[] {
  return connection?.edges?.map((edge) => edge?.node).filter(present) || []
}

const EDHREC_WEEK_COMMANDERS_URL = "https://json-cloudflare.edhrec.com/pages/commanders/week.json"
const EDHREC_COMMANDER_GALLERY_LIMIT = 50

export function CardsPage({ query, filterSearch }: { query: string; filterSearch?: string }) {
  const routeFilters = useMemo(() => decodeCollectionFilters(filterSearch), [filterSearch])
  const [q, setQ] = useState(query)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [deckTarget, setDeckTarget] = useState<CardDeckTarget | null>(null)
  const [structuredFilters, setStructuredFilters] = useState<CollectionFilterState>(routeFilters)
  const navigate = useNavigate({ from: "/cards/" })
  const structuredFilterSyntax = buildCollectionFilterQuery(structuredFilters)
  const combinedQuery = combineCollectionQueries(query, structuredFilterSyntax)
  const activeStructuredFilterCount = countActiveCollectionFilters(structuredFilters)
  const shouldSearchCards = Boolean(combinedQuery.trim())
  const { data, loading: isFetching } = useQuery(CardsDocument, {
    variables: { q: combinedQuery, limit: 36 },
    skip: !shouldSearchCards,
    fetchPolicy: "cache-and-network",
  })
  const cards = shouldSearchCards
    ? connectionNodes(data?.cards).map((card) => ({
        ...card,
        printings: connectionNodes(card.printings),
      }))
    : []
  const {
    cards: galleryCards,
    hasError: hasGalleryError,
    isLoading: isGalleryLoading,
  } = useEdhrecCommanderGallery(!shouldSearchCards)

  useEffect(() => {
    setQ(query)
  }, [query])

  useEffect(() => {
    setStructuredFilters(routeFilters)
  }, [routeFilters])

  function cardSearchParams(nextQuery: string, nextFilters = structuredFilters) {
    const term = nextQuery.trim()

    return {
      q: term || undefined,
      filters: encodeCollectionFilters(nextFilters),
    }
  }

  function submitSearch(value = q) {
    navigate({ to: "/cards", search: cardSearchParams(value) })
  }

  function updateSearchDraft(value: string) {
    setQ(value)
    if (!value.trim() && query) navigate({ to: "/cards", search: cardSearchParams("") })
  }

  function applyStructuredFilters(nextFilters: CollectionFilterState) {
    const filters = cloneCollectionFilters(nextFilters)
    setStructuredFilters(filters)
    setIsFilterModalOpen(false)
    navigate({ to: "/cards", search: cardSearchParams(query, filters) })
  }

  function clearStructuredFilters() {
    const filters = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
    setStructuredFilters(filters)
    navigate({ to: "/cards", search: cardSearchParams(query, filters) })
  }

  const hasMoreResults = Boolean(data?.cards.pageInfo.hasNextPage)
  const resultSearchParams = cardSearchParams(query)

  return (
    <>
      <PageHeader
        eyebrow="ManaVault Catalog"
        title="Card search"
        description="Search the local Scryfall catalog and add exact printings to your collection."
      />
      <CardSearchForm
        activeFilterCount={activeStructuredFilterCount}
        onFilterClick={() => setIsFilterModalOpen(true)}
        q={q}
        setQ={updateSearchDraft}
        onSearch={submitSearch}
      />

      {combinedQuery ? (
        <CardSearchResultsStatus
          activeFilterCount={activeStructuredFilterCount}
          hasMoreResults={hasMoreResults}
          isFetching={isFetching}
          query={query}
          visibleResultCount={cards.length}
        />
      ) : null}

      {!combinedQuery ? (
        <CardSearchEmptyGallery
          cards={galleryCards}
          hasError={hasGalleryError}
          isLoading={isGalleryLoading}
        />
      ) : cards.length ? (
        <CardResultsGrid
          cards={cards}
          onAddToDeck={setDeckTarget}
          onSelectCard={(id) =>
            navigate({
              to: "/cards/$id",
              params: { id },
              search: cardSearchParams(query),
            })
          }
          searchParams={resultSearchParams}
        />
      ) : (
        <NoCardResults
          hasActiveFilters={activeStructuredFilterCount > 0}
          isFetching={isFetching}
          query={query}
          onClearFilters={clearStructuredFilters}
          onSearchExact={() => submitSearch(`!"${query.trim()}"`)}
        />
      )}

      <CollectionFilterModal
        filters={structuredFilters}
        open={isFilterModalOpen}
        onApply={applyStructuredFilters}
        onClear={clearStructuredFilters}
        onClose={() => setIsFilterModalOpen(false)}
      />
      <AddCatalogCardToDeckDialog
        target={deckTarget}
        onOpenChange={(open) => !open && setDeckTarget(null)}
      />
    </>
  )
}

function CardSearchEmptyGallery({
  cards,
  hasError,
  isLoading,
}: {
  cards: DomeGalleryCard[]
  hasError: boolean
  isLoading: boolean
}) {
  const { isMobile } = useIsMobile()
  if (!cards.length) {
    return (
      <EmptyState
        title={isLoading ? "Loading top commanders..." : "No commander art available"}
        description={
          hasError
            ? "EDHREC commander data could not be loaded. Search by name or Scryfall syntax instead."
            : "Search by name or Scryfall syntax, then choose the exact printing to inspect or add."
        }
      />
    )
  }

  return (
    <section className="relative h-[min(72vh,38rem)] min-h-[26rem] w-full mx-auto overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm">
      <DomeGallery
        cards={cards}
        fit={1}
        minRadius={isMobile ? 600 : 1200}
        segments={20}
        dragDampening={1.2}
        overlayBlurColor="var(--color-base-100)"
        padFactor={0.08}
        imageBorderRadius="8px"
        openedImageBorderRadius="12px"
        grayscale={false}
      />
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-30 sm:bottom-6 sm:left-6 sm:right-auto">
        <div className="max-w-md rounded-box border border-base-300 bg-base-100/95 p-4 shadow-sm">
          <p className="text-sm font-black text-base-content">Top EDHREC commanders this week</p>
          <p className="md:mt-1 text-xs md:text-sm text-base-content/70">
            Drag through the weekly commander list, select art to inspect the full card, or search
            above for exact printings.
          </p>
        </div>
      </div>
    </section>
  )
}

type EdhrecCommanderCardView = {
  id?: string | null
  name?: string | null
  num_decks?: number | null
  rank?: number | null
}

type EdhrecWeekCommandersResponse = {
  container?: {
    json_dict?: {
      cardlists?: Array<{
        cardviews?: EdhrecCommanderCardView[] | null
      }> | null
    } | null
  } | null
}

function useEdhrecCommanderGallery(enabled: boolean) {
  const [cards, setCards] = useState<DomeGalleryCard[]>([])
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return

    const abortController = new AbortController()
    setHasError(false)
    setIsLoading(true)

    fetch(EDHREC_WEEK_COMMANDERS_URL, { signal: abortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`EDHREC returned ${response.status}`)
        return response.json() as Promise<EdhrecWeekCommandersResponse>
      })
      .then((data) => {
        setCards(buildEdhrecCommanderCards(data))
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setCards([])
        setHasError(true)
      })
      .finally(() => {
        if (!abortController.signal.aborted) setIsLoading(false)
      })

    return () => abortController.abort()
  }, [enabled])

  return { cards, hasError, isLoading }
}

function buildEdhrecCommanderCards(data: EdhrecWeekCommandersResponse): DomeGalleryCard[] {
  const cardviews = data.container?.json_dict?.cardlists?.[0]?.cardviews || []

  return shuffle(cardviews)
    .slice(0, EDHREC_COMMANDER_GALLERY_LIMIT)
    .reduce<DomeGalleryCard[]>((galleryCards, card, index) => {
      if (!card.id || !card.name) return galleryCards
      const artCropUrl = scryfallImageUrl(card.id, "art_crop")
      const imageUrl = scryfallImageUrl(card.id, "normal")
      if (!artCropUrl || !imageUrl) return galleryCards
      const rank = card.rank || index + 1
      const deckCount = card.num_decks ? deckCountFormatter.format(card.num_decks) : null

      galleryCards.push({
        id: card.id,
        name: card.name,
        artCropUrl,
        imageUrl,
        collectorNumber: String(rank),
        setCode: "EDHREC",
        setName: deckCount ? `${deckCount} decks this week` : "Top commander this week",
        typeLine: deckCount ? `Rank #${rank} · ${deckCount} decks this week` : `Rank #${rank}`,
      })
      return galleryCards
    }, [])
}

function scryfallImageUrl(id: string, size: "art_crop" | "normal") {
  const scryfallId = id.toLowerCase()
  if (!/^[a-f0-9-]{36}$/.test(scryfallId)) return null
  return `https://cards.scryfall.io/${size}/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`
}

const deckCountFormatter = new Intl.NumberFormat("en-US")

function CardSearchResultsStatus({
  activeFilterCount,
  hasMoreResults,
  isFetching,
  query,
  visibleResultCount,
}: {
  activeFilterCount: number
  hasMoreResults: boolean
  isFetching: boolean
  query: string
  visibleResultCount: number
}) {
  const resultLabel = isFetching
    ? visibleResultCount
      ? `Refreshing ${visibleResultCount}${hasMoreResults ? "+" : ""} visible results`
      : "Searching local catalog"
    : visibleResultCount
      ? `Showing ${visibleResultCount}${hasMoreResults ? "+" : ""} result${visibleResultCount === 1 ? "" : "s"}`
      : "No visible results"

  return (
    <section className="mb-6 flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-black">{resultLabel}</p>
        <p className="text-xs text-base-content/65">
          Results rank by catalog relevance. Choose a card to inspect its printings and owned
          copies.
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        {query.trim() ? (
          <span className="rounded-full border border-base-300 bg-base-200 px-2.5 py-1 font-mono font-bold text-base-content/80">
            q: {query.trim()}
          </span>
        ) : null}
        {activeFilterCount ? (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-bold text-primary">
            {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {hasMoreResults ? (
          <span className="rounded-full border border-base-300 px-2.5 py-1 font-bold text-base-content/70">
            More available
          </span>
        ) : null}
      </div>
    </section>
  )
}

function NoCardResults({
  hasActiveFilters,
  isFetching,
  onClearFilters,
  onSearchExact,
  query,
}: {
  hasActiveFilters: boolean
  isFetching: boolean
  onClearFilters: () => void
  onSearchExact: () => void
  query: string
}) {
  if (isFetching) {
    return (
      <EmptyState
        title="Searching local catalog"
        description="Checking synced card names, oracle text, sets, and printings."
      />
    )
  }

  const trimmedQuery = query.trim()

  return (
    <EmptyState
      title="No cards found"
      description="Try an exact-name search, remove filters, or use catalog syntax such as set:lea, type:artifact, or oracle:draw."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {trimmedQuery ? (
            <Button type="button" variant="outline" onClick={onSearchExact}>
              Search exact name
            </Button>
          ) : null}
          {hasActiveFilters ? (
            <Button type="button" variant="outline" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      }
    />
  )
}
export type CardReturnEdhrecTab = "recs" | "cuts" | "commander"

export function CardDetailPage({
  id,
  query,
  filterSearch,
  hideBackLink = false,
  hidePrivateControls = false,
  graphqlEndpoint,
  returnCollection = false,
  returnDeckId,
  returnEdhrecExcludeLands = false,
  returnEdhrecTab,
  returnLocationId,
}: {
  id: string
  query: string
  filterSearch?: string
  hideBackLink?: boolean
  hidePrivateControls?: boolean
  graphqlEndpoint?: string
  returnCollection?: boolean
  returnDeckId?: string
  returnEdhrecExcludeLands?: boolean
  returnEdhrecTab?: CardReturnEdhrecTab
  returnLocationId?: string
}) {
  const [addPrinting, setAddPrinting] = useState<AddCollectionItemInitialPrinting | null>(null)
  const [deckTarget, setDeckTarget] = useState<CardDeckTarget | null>(null)
  const [previewPrintingId, setPreviewPrintingId] = useState<string | null>(null)
  const { data, loading } = useQuery(CardDocument, {
    variables: { id },
    context: graphqlEndpointContext(graphqlEndpoint),
    fetchPolicy: graphqlEndpoint ? "no-cache" : "cache-and-network",
  })
  const isLoading = loading && !data
  const card = data?.card
  const visiblePrintings = connectionNodes(card?.printings)
  const primary = visiblePrintings[0]
  usePageTitle(card?.name ?? (isLoading ? "Card" : "Card not found"))
  const previewPrintings = visiblePrintings.map((printing) => ({
    ...printing,
    scryfallId: printing.id,
  }))

  if (isLoading) return <EmptyState title="Loading card..." />
  if (!card) return <EmptyState title="Card not found" />

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-7">
        {hideBackLink ? null : returnDeckId ? (
          <Button asChild variant="outline" size="sm">
            <Link
              to="/decks/$id"
              params={{ id: returnDeckId }}
              search={{
                edhrec: returnEdhrecTab,
                edhrecExcludeLands: returnEdhrecTab && returnEdhrecExcludeLands ? true : undefined,
              }}
            >
              {returnEdhrecTab ? "Back to EDHREC" : "Back to deck"}
            </Link>
          </Button>
        ) : returnLocationId ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/collection/locations/$id" params={{ id: returnLocationId }}>
              Back to collection
            </Link>
          </Button>
        ) : returnCollection ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/collection" search={{ importFile: false }}>
              Back to collection
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link to="/cards" search={{ q: query || undefined, filters: filterSearch }}>
              Back to search
            </Link>
          </Button>
        )}

        <section className="relative min-h-80 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm">
          {primary?.artCropUrl ? (
            <img
              src={primary.artCropUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-75"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-br from-base-100/98 via-base-100/25 to-base-100/0" />
          <CardActionsMenu
            cardName={card.name}
            className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"
            primaryPrinting={primary}
          />
          <div className="relative z-10 flex min-h-80 flex-col justify-between gap-8 p-6">
            <div className="max-w-5xl space-y-4 pr-12">
              <div className="flex items-center gap-4">
                <h1 className="min-w-0 flex-1 text-4xl font-black tracking-normal md:text-5xl">
                  {card.name}
                </h1>
                {card.manaCost ? (
                  <ManaText
                    text={card.manaCost}
                    className="shrink-0 justify-end text-3xl md:text-4xl"
                  />
                ) : null}
              </div>

              {card.typeLine ? (
                <div className="border-y border-base-300/70 py-2 text-base font-semibold text-base-content/80">
                  {card.typeLine}
                </div>
              ) : null}

              <CardTagSummary card={card} />

              {card.oracleText ? (
                <OracleTextPanel artCropUrl={primary?.artCropUrl} text={card.oracleText} />
              ) : null}

              <CardLegalityPanel gameChanger={card.gameChanger} legalities={card.legalities} />
              <CardRulings rulings={card.rulings} />
            </div>
          </div>
        </section>

        {hidePrivateControls ? null : <CardCollectionCopiesPanel cardId={card.id} />}

        <section className="space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Printings</h2>
              <p className="text-sm text-base-content/65">
                {visiblePrintings.length} printing
                {visiblePrintings.length === 1 ? "" : "s"} sorted by catalog relevance. Owned badges
                mark copies already in your vault.
              </p>
            </div>
          </div>
          <CardPrintingsGrid
            cardName={card.name}
            typeLine={card.typeLine}
            printings={visiblePrintings}
            onAddToCollection={setAddPrinting}
            onAddToDeck={setDeckTarget}
            onPreviewPrinting={setPreviewPrintingId}
            showPrivateActions={!hidePrivateControls}
          />
        </section>
      </div>
      <FullscreenPrintingDialog
        card={card}
        currentPrintingId={previewPrintingId}
        printings={previewPrintings}
        onOpenChange={(open) => !open && setPreviewPrintingId(null)}
        onPrintingChange={setPreviewPrintingId}
      />
      {hidePrivateControls ? null : (
        <>
          <AddCollectionItemDialog
            initialPrinting={addPrinting}
            open={Boolean(addPrinting)}
            onOpenChange={(open) => !open && setAddPrinting(null)}
          />
          <AddCatalogCardToDeckDialog
            target={deckTarget}
            onOpenChange={(open) => !open && setDeckTarget(null)}
          />
        </>
      )}
    </>
  )
}
