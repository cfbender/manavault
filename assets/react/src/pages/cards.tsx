import { Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Boxes, ListFilter, Search } from "lucide-react"
import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { PageHeader } from "../components/app-shell"
import { EmptyState } from "../components/card-image"
import { CardNameSearchField } from "../components/card-name-search-field"
import { addToDeckAction, CardTile } from "../components/card-tile"
import { Button } from "../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import { Input } from "../components/ui/input"
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
        priceText
      }
    }
  }
`)

const CardDeckOptionsDocument = graphql(`
  query CardDeckOptions {
    decks {
      id
      name
      format
      status
    }
  }
`)

const AddCardToDeckDocument = graphql(`
  mutation AddCardToDeck($deckId: ID!, $input: DeckCardInput!) {
    addDeckCard(deckId: $deckId, input: $input) {
      id
      quantity
      zone
      finish
      card {
        oracleId
        name
      }
      preferredPrinting {
        scryfallId
        setCode
        collectorNumber
        imageUrl
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
        ownedCount
        finishes
        imageUrl
        artCropUrl
        releasedAt
        prices
        priceText
      }
    }
  }
`)

export function CardsPage({ query }: { query: string }) {
  const [q, setQ] = useState(query)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [deckTarget, setDeckTarget] = useState<CardDeckTarget | null>(null)
  const [structuredFilters, setStructuredFilters] =
    useState<CollectionFilterState>(EMPTY_COLLECTION_FILTERS)
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
      ) : data?.cards?.length ? (
        <div className="grid justify-center gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(14.25rem,14.25rem))]">
          {data.cards.map((card) => {
            const printing = card.printings?.[0]
            return (
              <div key={card.oracleId}>
                <CardTile
                  imageUrl={printing?.imageUrl}
                  menuActions={[
                    addToDeckAction({
                      onClick: () =>
                        setDeckTarget({
                          cardName: card.name,
                          finish: "nonfoil",
                          preferredPrintingId: printing?.scryfallId,
                          setCode: printing?.setCode,
                          collectorNumber: printing?.collectorNumber,
                        }),
                    }),
                  ]}
                  name={card.name}
                  onSelect={() =>
                    navigate({
                      to: "/cards/$id",
                      params: { id: card.oracleId },
                      search: { q: query },
                    })
                  }
                  price={printing?.priceText}
                  rarity={printing?.rarity}
                  setCode={printing?.setCode}
                  setLabel={`${printing?.setCode?.toUpperCase() || "?"} #${printing?.collectorNumber || "?"}`}
                  setName={printing?.setName}
                  typeLine={card.typeLine}
                />
              </div>
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
      <AddCatalogCardToDeckDialog
        target={deckTarget}
        onOpenChange={(open) => !open && setDeckTarget(null)}
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
        {activeFilterCount ? (
          <span className="badge badge-primary badge-sm absolute -right-2 -top-2 min-w-5">
            {activeFilterCount}
          </span>
        ) : null}
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
  const [deckTarget, setDeckTarget] = useState<CardDeckTarget | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ["card", id],
    queryFn: () => request(CardDocument, { id }),
  })
  const card = data?.card
  const printings = card?.printings || []
  const primary = printings[0]

  if (isLoading) return <EmptyState title="Loading card..." />
  if (!card) return <EmptyState title="Card not found" />

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-7">
        <Button asChild variant="outline" size="sm">
          <Link to="/cards" search={{ q: query || undefined }}>
            Back to search
          </Link>
        </Button>

        <section className="relative min-h-80 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm">
          {primary?.artCropUrl ? (
            <img
              src={primary.artCropUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-30"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-br from-base-100/98 via-base-100/80 to-base-100/35" />
          <div className="relative z-10 flex min-h-80 flex-col justify-between gap-8 p-6">
            <div className="max-w-5xl space-y-4">
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

              {card.oracleText ? (
                <div className="max-w-4xl space-y-3 text-base leading-7 text-base-content/75">
                  <OracleText text={card.oracleText} />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div className="grid justify-center gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(14.25rem,14.25rem))]">
          {printings.filter(present).map((printing) => (
            <div key={printing.scryfallId}>
              <CardTile
                defaultActions={[]}
                count={printing.ownedCount}
                countMin={1}
                finish={(printing.finishes || [])[0]}
                imageUrl={printing.imageUrl}
                menuActions={[
                  {
                    icon: <Boxes className="h-4 w-4" />,
                    onClick: () =>
                      setAddPrinting({
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
                  addToDeckAction({
                    onClick: () =>
                      setDeckTarget({
                        cardName: card.name,
                        collectorNumber: printing.collectorNumber,
                        finish: (printing.finishes || []).includes("nonfoil")
                          ? "nonfoil"
                          : printing.finishes?.[0] || "nonfoil",
                        finishes: printing.finishes?.filter(present),
                        preferredPrintingId: printing.scryfallId,
                        setCode: printing.setCode,
                      }),
                  }),
                ]}
                name={card.name}
                price={printing.priceText}
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
  )
}

type CardDeckTarget = {
  cardName: string
  collectorNumber?: string | null
  finish?: string | null
  finishes?: string[] | null
  preferredPrintingId?: string | null
  setCode?: string | null
}
type CardDeckZone = "mainboard" | "sideboard" | "commander" | "maybeboard"
const CARD_DECK_ZONES: CardDeckZone[] = ["mainboard", "sideboard", "commander", "maybeboard"]
const NON_COMMANDER_CARD_DECK_ZONES: CardDeckZone[] = ["mainboard", "sideboard", "maybeboard"]
const CARD_DECK_FINISHES = ["nonfoil", "foil", "etched"]

function AddCatalogCardToDeckDialog({
  target,
  onOpenChange,
}: {
  target: CardDeckTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [deckId, setDeckId] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [zone, setZone] = useState<CardDeckZone>("mainboard")
  const [finish, setFinish] = useState("nonfoil")
  const [error, setError] = useState<string | null>(null)
  const open = Boolean(target)
  const decksQuery = useQuery({
    queryKey: ["card-deck-options"],
    queryFn: () => request(CardDeckOptionsDocument),
    enabled: open,
  })
  const selectedDeck = decksQuery.data?.decks.find((deck) => deck.id === deckId)
  const zoneOptions =
    selectedDeck?.format === "commander" ? CARD_DECK_ZONES : NON_COMMANDER_CARD_DECK_ZONES
  const finishOptions =
    target?.finishes?.length && target.finishes.some((value) => CARD_DECK_FINISHES.includes(value))
      ? target.finishes.filter((value) => CARD_DECK_FINISHES.includes(value))
      : CARD_DECK_FINISHES
  const addToDeck = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("Choose a card")
      if (!deckId) throw new Error("Choose a deck")
      return request(AddCardToDeckDocument, {
        deckId,
        input: {
          name: target.cardName,
          quantity,
          zone,
          finish,
          preferredPrintingId: target.preferredPrintingId || null,
        },
      })
    },
    onSuccess: () => {
      const addedDeckId = deckId
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      if (addedDeckId) {
        queryClient.invalidateQueries({ queryKey: ["deck", addedDeckId] })
        queryClient.invalidateQueries({ queryKey: ["deck-buylist", addedDeckId] })
      }
      close()
      if (addedDeckId) navigate({ to: "/decks/$id", params: { id: addedDeckId } })
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not add card to deck"),
  })

  useEffect(() => {
    if (open) {
      setFinish(target?.finish || "nonfoil")
      return
    }

    setDeckId("")
    setQuantity(1)
    setZone("mainboard")
    setFinish("nonfoil")
    setError(null)
  }, [open, target])

  useEffect(() => {
    if (!zoneOptions.includes(zone)) setZone("mainboard")
  }, [zone, zoneOptions])

  useEffect(() => {
    if (!finishOptions.includes(finish)) setFinish(finishOptions[0] || "nonfoil")
  }, [finish, finishOptions])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    addToDeck.mutate()
  }

  function close() {
    if (addToDeck.isPending) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-xl" labelledBy="add-catalog-card-to-deck-title">
        <DialogHeader>
          <div>
            <DialogTitle id="add-catalog-card-to-deck-title">Add to deck</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              {target?.cardName}
              {target?.setCode ? (
                <>
                  {" "}
                  ({target.setCode.toUpperCase()}
                  {target.collectorNumber ? ` #${target.collectorNumber}` : ""})
                </>
              ) : null}
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-4 p-5" onSubmit={submit}>
          <label className="form-control">
            <span className="label-text mb-1 text-sm font-semibold">Deck</span>
            <select
              className="select select-bordered w-full"
              value={deckId}
              disabled={addToDeck.isPending}
              onChange={(event) => setDeckId(event.target.value)}
              autoFocus
            >
              <option value="">Choose a deck</option>
              {decksQuery.data?.decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name} ({titleize(deck.format)})
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Quantity</span>
              <Input
                type="number"
                min={1}
                value={quantity}
                disabled={addToDeck.isPending}
                onChange={(event) =>
                  setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
                }
              />
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Zone</span>
              <select
                className="select select-bordered w-full"
                value={zone}
                disabled={addToDeck.isPending}
                onChange={(event) => setZone(event.target.value as CardDeckZone)}
              >
                {zoneOptions.map((zone) => (
                  <option key={zone} value={zone}>
                    {titleize(zone)}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Finish</span>
              <select
                className="select select-bordered w-full"
                value={finish}
                disabled={addToDeck.isPending}
                onChange={(event) => setFinish(event.target.value)}
              >
                {finishOptions.map((finish) => (
                  <option key={finish} value={finish}>
                    {titleize(finish)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={addToDeck.isPending} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={addToDeck.isPending || !deckId}>
              {addToDeck.isPending ? "Adding..." : "Add to deck"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ManaText({ className, text }: { className?: string; text: string }) {
  return (
    <span
      className={["inline-flex flex-wrap items-center gap-1", className].filter(Boolean).join(" ")}
    >
      {renderRichCardText(text)}
    </span>
  )
}

function OracleText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <p
          key={index}
          className={
            line.startsWith("(") && line.endsWith(")") ? "italic text-base-content/60" : undefined
          }
        >
          {renderRichCardText(line)}
        </p>
      ))}
    </>
  )
}

function renderRichCardText(text: string) {
  return text
    .split(/(\{[^}]+\}|\([^)]*\))/g)
    .filter(Boolean)
    .map((part, index) => {
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
  return text
    .split(/(\{[^}]+\})/g)
    .filter(Boolean)
    .map((part, index) => {
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
