import { useQuery } from "@apollo/client/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { PageHeader } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { FullscreenPrintingDialog } from "../../components/fullscreen-printing-dialog"
import { Button } from "../../components/ui/button"
import { graphqlEndpointContext } from "../../lib/apollo"
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
import { ManaText, OracleText } from "./card-text"
import { CardDocument, CardsDocument } from "./data"
import { CardLegalityPanel, CardRulings, CardTagSummary } from "./detail-sections"
import { CardSearchForm } from "./search-form"

type NodeConnection<T> =
  | {
      edges?: ReadonlyArray<{ node?: T | null } | null> | null
    }
  | null
  | undefined

function connectionNodes<T>(connection: NodeConnection<T>): T[] {
  return connection?.edges?.map((edge) => edge?.node).filter(present) || []
}

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

      {!combinedQuery ? (
        <EmptyState
          title="Search for a card"
          description="Results are pulled from the synced local catalog."
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
        />
      ) : (
        <EmptyState title={isFetching ? "Searching..." : "No cards found"} />
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
          <div className="absolute inset-0 bg-gradient-to-br from-base-100/98 via-base-100/80 to-base-100/35" />
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
                <div className="max-w-4xl space-y-3 text-base leading-7 text-base-content/75">
                  <OracleText text={card.oracleText} />
                </div>
              ) : null}

              <CardLegalityPanel gameChanger={card.gameChanger} legalities={card.legalities} />
              <CardRulings rulings={card.rulings} />
            </div>
          </div>
        </section>

        {hidePrivateControls ? null : <CardCollectionCopiesPanel cardId={card.id} />}

        <CardPrintingsGrid
          cardName={card.name}
          typeLine={card.typeLine}
          printings={visiblePrintings}
          onAddToCollection={setAddPrinting}
          onAddToDeck={setDeckTarget}
          onPreviewPrinting={setPreviewPrintingId}
          showPrivateActions={!hidePrivateControls}
        />
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
