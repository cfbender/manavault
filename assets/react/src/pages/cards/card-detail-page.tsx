import { useQuery } from "@apollo/client/react"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { EmptyState } from "../../components/card-image"
import { FullscreenPrintingDialog } from "../../components/fullscreen-printing-dialog"
import { Button } from "../../components/ui/button"
import { graphqlEndpointContext } from "../../lib/apollo"
import { usePageTitle } from "../../lib/page-title"
import { present } from "../../lib/utils"
import {
  AddCollectionItemDialog,
  type AddCollectionItemInitialPrinting,
} from "../collection"
import { AddCatalogCardToDeckDialog, type CardDeckTarget } from "./add-card-to-deck-dialog"
import { CardActionsMenu } from "./card-actions-menu"
import { CardCollectionCopiesPanel } from "./card-collection-copies"
import { CardPrintingsGrid } from "./card-printings-grid"
import { CardSynergies } from "./card-synergies"
import { ManaText, OracleTextPanel } from "./card-text"
import { CardDocument } from "./data"
import { CardLegalityPanel, CardRulings, CardTagSummary } from "./detail-sections"

type NodeConnection<T> =
  | { edges?: ReadonlyArray<{ node?: T | null } | null> | null }
  | null
  | undefined

function connectionNodes<T>(connection: NodeConnection<T>): T[] {
  return connection?.edges?.map((edge) => edge?.node).filter(present) || []
}

export type CardReturnEdhrecTab = "recs" | "cuts" | "commander"

export type CardDetailPageProps = {
  id: string
  query: string
  filterSearch?: string
  sortSearch?: string
  hideBackLink?: boolean
  hidePrivateControls?: boolean
  graphqlEndpoint?: string
  returnCollection?: boolean
  returnDeckId?: string
  returnEdhrecExcludeLands?: boolean
  returnEdhrecTab?: CardReturnEdhrecTab
  returnLocationId?: string
}

export function CardDetailPage({
  id,
  query,
  filterSearch,
  sortSearch,
  hideBackLink = false,
  hidePrivateControls = false,
  graphqlEndpoint,
  returnCollection = false,
  returnDeckId,
  returnEdhrecExcludeLands = false,
  returnEdhrecTab,
  returnLocationId,
}: CardDetailPageProps) {
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
            <Link
              to="/cards"
              search={{ q: query || undefined, filters: filterSearch, sort: sortSearch }}
            >
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
              <div className="flex flex-col-reverse gap-1 sm:flex-row sm:items-center sm:gap-4">
                <h1 className="min-w-0 flex-1 text-3xl font-black tracking-normal sm:text-4xl md:text-5xl">
                  {card.name}
                </h1>
                {card.manaCost ? (
                  <ManaText
                    text={card.manaCost}
                    className="shrink-0 justify-start text-2xl sm:justify-end sm:text-3xl md:text-4xl"
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
              <CardSynergies cardName={card.name} graphqlEndpoint={graphqlEndpoint} />
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
