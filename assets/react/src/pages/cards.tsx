import { Link, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ListFilter, Search } from "lucide-react"
import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { PageHeader } from "../components/app-shell"
import { EmptyState } from "../components/card-image"
import { CardNameSearchField } from "../components/card-name-search-field"
import { addToDeckAction, CardTile } from "../components/card-tile"
import { Button } from "../components/ui/button"
import { graphql } from "../gql"
import { request } from "../lib/graphql"
import { present, titleize } from "../lib/utils"
import {
  AddCollectionItemDialog,
  type AddCollectionItemInitialPrinting,
  buildCollectionFilterQuery,
  cloneCollectionFilters,
  CollectionFilterModal,
  combineCollectionQueries,
  countActiveCollectionFilters,
  EMPTY_COLLECTION_FILTERS,
  type CollectionFilterState,
} from "./collection"

const CardsDocument = graphql(`
  query Cards($q: String!, $limit: Int!) {
    cards(q: $q, limit: $limit) {
      oracleId
      name
      typeLine
      manaCost
      printings {
        scryfallId
        setCode
        setName
        collectorNumber
        imageUrl
        rarity
      }
    }
  }
`)

const CardDocument = graphql(`
  query Card($id: ID!) {
    card(id: $id) {
      oracleId
      name
      typeLine
      manaCost
      oracleText
      colorIdentity
      printings {
        scryfallId
        setCode
        setName
        collectorNumber
        lang
        rarity
        finishes
        imageUrl
        artCropUrl
        releasedAt
        prices
      }
    }
  }
`)

export function CardsPage({ query }: { query: string }) {
  const [q, setQ] = useState(query)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [structuredFilters, setStructuredFilters] = useState<CollectionFilterState>(EMPTY_COLLECTION_FILTERS)
  const navigate = useNavigate({ from: "/cards/" })
  const structuredFilterSyntax = buildCollectionFilterQuery(structuredFilters)
  const combinedQuery = combineCollectionQueries(query, structuredFilterSyntax)
  const activeStructuredFilterCount = countActiveCollectionFilters(structuredFilters)
  const { data, isFetching } = useQuery({
    queryKey: ["cards", combinedQuery],
    queryFn: () => request(CardsDocument, { q: combinedQuery, limit: 36 }),
    enabled: Boolean(combinedQuery.trim()),
  })

  useEffect(() => {
    setQ(query)
  }, [query])

  function submitSearch(value = q) {
    const term = value.trim()
    navigate({ to: "/cards", search: { q: term || undefined } })
  }

  function updateSearchDraft(value: string) {
    setQ(value)
    if (!value.trim() && query) navigate({ to: "/cards", search: { q: undefined } })
  }

  function applyStructuredFilters(nextFilters: CollectionFilterState) {
    setStructuredFilters(cloneCollectionFilters(nextFilters))
    setIsFilterModalOpen(false)
  }

  function clearStructuredFilters() {
    setStructuredFilters(EMPTY_COLLECTION_FILTERS)
  }

  return (
    <>
      <PageHeader eyebrow="ManaVault Catalog" title="Card search" description="Search the local Scryfall catalog and add exact printings to your collection." />
      <CardSearchForm
        activeFilterCount={activeStructuredFilterCount}
        onFilterClick={() => setIsFilterModalOpen(true)}
        q={q}
        setQ={updateSearchDraft}
        onSearch={submitSearch}
      />

      {!combinedQuery ? (
        <EmptyState title="Search for a card" description="Results are pulled from the synced local catalog." />
      ) : data?.cards?.length ? (
        <div className="grid justify-center gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(14.25rem,14.25rem))]">
          {data.cards.map(card => {
            const printing = card.printings?.[0]
            return (
              <Link key={card.oracleId} to="/cards/$id" params={{ id: card.oracleId }} search={{ q: query }} className="block">
                <CardTile
                  imageUrl={printing?.imageUrl}
                  name={card.name}
                  rarity={printing?.rarity}
                  setCode={printing?.setCode}
                  setLabel={`${printing?.setCode?.toUpperCase() || "?"} #${printing?.collectorNumber || "?"}`}
                  setName={printing?.setName}
                  showMenu={false}
                  typeLine={card.typeLine}
                />
              </Link>
            )
          })}
        </div>
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
    </>
  )
}

function CardSearchForm({
  activeFilterCount,
  onFilterClick,
  q,
  setQ,
  onSearch,
}: {
  activeFilterCount: number
  onFilterClick: () => void
  q: string
  setQ: (value: string) => void
  onSearch: (value?: string) => void
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch(q)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="control-toolbar mb-7 grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-[1fr_auto_auto]"
    >
      <CardNameSearchField
        name="q"
        value={q}
        onValueChange={setQ}
        onClear={() => onSearch("")}
        onSuggestionSelect={onSearch}
        placeholder="Card name"
      />
      <Button type="button" variant="outline" className="relative" onClick={onFilterClick}>
        <ListFilter className="h-4 w-4" />
        Filter
        {activeFilterCount ? <span className="badge badge-primary badge-sm absolute -right-2 -top-2 min-w-5">{activeFilterCount}</span> : null}
      </Button>
      <Button type="submit">
        <Search className="h-4 w-4" />
        Search
      </Button>
    </form>
  )
}

export function CardDetailPage({ id, query }: { id: string; query: string }) {
  const [addPrinting, setAddPrinting] = useState<AddCollectionItemInitialPrinting | null>(null)
  const { data, isLoading } = useQuery({ queryKey: ["card", id], queryFn: () => request(CardDocument, { id }) })
  const card = data?.card
  const printings = card?.printings || []
  const primary = printings[0]

  if (isLoading) return <EmptyState title="Loading card..." />
  if (!card) return <EmptyState title="Card not found" />

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-7">
        <Button asChild variant="outline" size="sm">
          <Link to="/cards" search={{ q: query || undefined }}>Back to search</Link>
        </Button>

        <section className="relative min-h-80 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm">
          {primary?.artCropUrl ? (
            <img src={primary.artCropUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-br from-base-100/98 via-base-100/80 to-base-100/35" />
          <div className="relative z-10 flex min-h-80 flex-col justify-between gap-8 p-6">
            <div className="max-w-5xl space-y-4">
              <div className="flex items-center gap-4">
                <h1 className="min-w-0 flex-1 text-4xl font-black tracking-normal md:text-5xl">{card.name}</h1>
                {card.manaCost ? <ManaText text={card.manaCost} className="shrink-0 justify-end text-3xl md:text-4xl" /> : null}
              </div>

              {card.typeLine ? (
                <div className="border-y border-base-300/70 py-2 text-base font-semibold text-base-content/80">
                  {card.typeLine}
                </div>
              ) : null}

              {card.oracleText ? (
                <div className="max-w-4xl space-y-3 text-base leading-7 text-base-content/75">
                  <OracleText text={card.oracleText} />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div className="grid justify-center gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(14.25rem,14.25rem))]">
          {printings.filter(present).map(printing => (
            <div key={printing.scryfallId}>
              <CardTile
                defaultActions={[]}
                finish={(printing.finishes || [])[0]}
                imageUrl={printing.imageUrl}
                menuActions={[
                  {
                    onClick: () => setAddPrinting({
                      cardName: card.name,
                      collectorNumber: printing.collectorNumber,
                      finishes: printing.finishes,
                      imageUrl: printing.imageUrl,
                      rarity: printing.rarity,
                      scryfallId: printing.scryfallId,
                      setCode: printing.setCode,
                      setName: printing.setName,
                      typeLine: card.typeLine,
                    }),
                    label: "Add to collection",
                  },
                  addToDeckAction(),
                ]}
                name={card.name}
                rarity={printing.rarity}
                setCode={printing.setCode}
                setLabel={`${printing.setCode?.toUpperCase() || "?"} #${printing.collectorNumber || "?"}`}
                setName={printing.setName}
                typeLine={`${printing.setCode?.toUpperCase() || "?"} #${printing.collectorNumber || "?"} · ${titleize(printing.rarity)}`}
              />
            </div>
          ))}
        </div>
      </div>
      <AddCollectionItemDialog initialPrinting={addPrinting} open={Boolean(addPrinting)} onOpenChange={open => !open && setAddPrinting(null)} />
    </>
  )
}

function ManaText({ className, text }: { className?: string; text: string }) {
  return <span className={["inline-flex flex-wrap items-center gap-1", className].filter(Boolean).join(" ")}>{renderRichCardText(text)}</span>
}

function OracleText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <p key={index} className={line.startsWith("(") && line.endsWith(")") ? "italic text-base-content/60" : undefined}>
          {renderRichCardText(line)}
        </p>
      ))}
    </>
  )
}

function renderRichCardText(text: string) {
  return text.split(/(\{[^}]+\}|\([^)]*\))/g).filter(Boolean).map((part, index) => {
    if (/^\{[^}]+\}$/.test(part)) return <ManaSymbol key={index} symbol={part} />
    if (/^\([^)]*\)$/.test(part)) {
      return (
        <em key={index} className="text-base-content/65">
          {renderManaSymbols(part)}
        </em>
      )
    }
    return <span key={index}>{part}</span>
  })
}

function renderManaSymbols(text: string) {
  return text.split(/(\{[^}]+\})/g).filter(Boolean).map((part, index) => {
    if (/^\{[^}]+\}$/.test(part)) return <ManaSymbol key={index} symbol={part} />
    return <span key={index}>{part}</span>
  })
}

function ManaSymbol({ symbol }: { symbol: string }) {
  const filename = symbol.replace(/[{}]/g, "").replace("/", "").toUpperCase()

  return (
    <img
      src={`/scryfall-assets/symbols/${filename}.svg`}
      alt={symbol}
      title={symbol}
      className="mx-0.5 inline-block h-[1.15em] w-[1.15em] translate-y-[-0.08em] align-middle"
    />
  )
}
