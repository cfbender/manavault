import { Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "motion/react"
import { Boxes, ChevronLeft, ChevronRight, ListFilter, Search, X } from "lucide-react"
import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { PageHeader } from "../components/app-shell"
import { EmptyState } from "../components/card-image"
import { CardNameSearchField } from "../components/card-name-search-field"
import { addToDeckAction, CardTile } from "../components/card-tile"
import ProfileCard from "../components/profile-card"
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
import type { CardQuery } from "../gql/graphql"
import { request } from "../lib/graphql"
import {
  buildCollectionFilterQuery,
  cloneCollectionFilters,
  combineCollectionQueries,
  countActiveCollectionFilters,
  EMPTY_COLLECTION_FILTERS,
  type CollectionFilterState,
} from "../lib/collection-filters"
import { present, titleize } from "../lib/utils"
import {
  AddCollectionItemDialog,
  type AddCollectionItemInitialPrinting,
  CollectionFilterModal,
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

type CardDetail = NonNullable<CardQuery["card"]>
type CardPrinting = NonNullable<NonNullable<CardDetail["printings"]>[number]>

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
  const [previewPrintingId, setPreviewPrintingId] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ["card", id],
    queryFn: () => request(CardDocument, { id }),
  })
  const card = data?.card
  const printings = card?.printings || []
  const visiblePrintings = printings.filter(present)
  const primary = visiblePrintings[0]

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
              className="absolute inset-0 h-full w-full object-cover opacity-75"
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
          {visiblePrintings.map((printing) => (
            <div key={printing.scryfallId}>
              <CardTile
                defaultActions={[]}
                count={printing.ownedCount}
                countMin={1}
                finish={(printing.finishes || [])[0]}
                imageUrl={printing.imageUrl}
                onSelect={() => setPreviewPrintingId(printing.scryfallId)}
                primaryActionLabel={`Open ${card.name} ${printing.setCode?.toUpperCase() || "printing"} full screen`}
                primaryActionRole="button"
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
      <FullscreenPrintingDialog
        card={card}
        currentPrintingId={previewPrintingId}
        printings={visiblePrintings}
        onOpenChange={(open) => !open && setPreviewPrintingId(null)}
        onPrintingChange={setPreviewPrintingId}
      />
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

function FullscreenPrintingDialog({
  card,
  currentPrintingId,
  printings,
  onOpenChange,
  onPrintingChange,
}: {
  card: CardDetail
  currentPrintingId: string | null
  printings: CardPrinting[]
  onOpenChange: (open: boolean) => void
  onPrintingChange: (printingId: string) => void
}) {
  const currentIndex = currentPrintingId
    ? printings.findIndex((printing) => printing.scryfallId === currentPrintingId)
    : -1
  const printing = currentIndex >= 0 ? printings[currentIndex] : null
  const finish = (printing?.finishes || []).filter(present)[0]
  const foil = finish === "foil" || finish === "etched"
  const setLabel = printing?.setCode
    ? `${printing.setCode.toUpperCase()}${printing.collectorNumber ? ` #${printing.collectorNumber}` : ""}`
    : printing?.collectorNumber
      ? `#${printing.collectorNumber}`
      : ""
  const subtitle = [
    setLabel || null,
    printing?.setName || null,
    printing?.rarity ? titleize(printing.rarity) : null,
  ]
    .filter(present)
    .join(" · ")
  const profileInnerGradient = foil
    ? "linear-gradient(145deg,rgba(120,72,28,0.58) 0%,rgba(255,226,122,0.23) 42%,rgba(117,196,255,0.28) 100%)"
    : "linear-gradient(145deg,rgba(96,73,110,0.55) 0%,rgba(113,196,255,0.27) 100%)"
  const profileGlowColor = foil ? "rgba(255, 219, 122, 0.62)" : "rgba(125, 190, 255, 0.55)"
  const canNavigate = printings.length > 1 && currentIndex >= 0
  const positionLabel = canNavigate ? `${currentIndex + 1} / ${printings.length}` : null

  useEffect(() => {
    if (!canNavigate) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return

      event.preventDefault()
      const direction = event.key === "ArrowLeft" ? -1 : 1
      const nextIndex = (currentIndex + direction + printings.length) % printings.length
      const nextPrinting = printings[nextIndex]
      if (nextPrinting) onPrintingChange(nextPrinting.scryfallId)
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [canNavigate, currentIndex, onPrintingChange, printings])

  function goToPrinting(direction: -1 | 1) {
    if (!canNavigate) return

    const nextIndex = (currentIndex + direction + printings.length) % printings.length
    const nextPrinting = printings[nextIndex]
    if (nextPrinting) onPrintingChange(nextPrinting.scryfallId)
  }

  return (
    <Dialog open={Boolean(printing)} onOpenChange={onOpenChange}>
      {printing ? (
        <DialogContent
          className="relative h-[100dvh] max-h-[100dvh] w-screen shrink-0 max-w-none overflow-hidden rounded-none border-0 bg-neutral text-neutral-content shadow-2xl sm:h-[calc(100dvh-3rem)] sm:max-h-[calc(100dvh-3rem)] sm:w-full sm:shrink sm:max-w-[calc(100vw-2rem)] sm:rounded-box"
          labelledBy="fullscreen-card-title"
        >
          {printing.artCropUrl ? (
            <img
              src={printing.artCropUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-25 blur-sm scale-105"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-br from-black/95 via-neutral/90 to-black/95" />

          <motion.div
            className="relative z-10 flex h-full flex-col gap-3 p-3 sm:gap-4 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2
                  id="fullscreen-card-title"
                  className="truncate text-xl font-black tracking-normal sm:text-3xl"
                >
                  {card.name}
                </h2>
                {subtitle ? (
                  <p className="mt-1 line-clamp-1 text-xs text-neutral-content/65 sm:line-clamp-2 sm:text-sm">{subtitle}</p>
                ) : null}
                {finish || printing.priceText || printing.ownedCount || positionLabel ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.65rem] sm:mt-3 sm:gap-2 sm:text-xs">
                    {finish ? (
                      <span className="badge border-white/20 bg-white/10 text-neutral-content">
                        {titleize(finish)}
                      </span>
                    ) : null}
                    {printing.priceText ? (
                      <span className="badge border-white/20 bg-white/10 font-mono text-neutral-content">
                        {printing.priceText}
                      </span>
                    ) : null}
                    {printing.ownedCount ? (
                      <span className="badge border-white/20 bg-white/10 text-neutral-content">
                        {printing.ownedCount} owned
                      </span>
                    ) : null}
                    {positionLabel ? (
                      <span className="badge border-white/20 bg-white/10 font-mono text-neutral-content">
                        {positionLabel}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close full-screen card"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="relative mb-0 flex min-h-0 flex-1 items-center justify-center pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:mb-12 sm:pb-0">
              {canNavigate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute left-0 top-1/2 z-20 -translate-y-1/2 border border-white/10 bg-black/35 text-white backdrop-blur hover:bg-black/55 sm:left-4"
                  aria-label="Previous printing"
                  onClick={() => goToPrinting(-1)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              ) : null}

              <motion.div
                key={printing.scryfallId}
                className="relative max-h-full rounded-[4.75%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                initial={{ opacity: 0, scale: 0.82, y: 36, rotateX: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                aria-label={canNavigate ? `Show next printing of ${card.name}` : undefined}
                role={canNavigate ? "button" : undefined}
                tabIndex={canNavigate ? 0 : undefined}
                onClick={() => goToPrinting(1)}
                onKeyDown={(event) => {
                  if (!canNavigate || (event.key !== "Enter" && event.key !== " ")) return
                  event.preventDefault()
                  goToPrinting(1)
                }}
              >
                <ProfileCard
                  avatarUrl={printing.imageUrl || ""}
                  innerGradient={profileInnerGradient}
                  behindGlowColor={profileGlowColor}
                  behindGlowSize={foil ? "72%" : "58%"}
                  className={
                    foil
                      ? "manavault-printing-profile-card manavault-printing-profile-card--foil"
                      : "manavault-printing-profile-card"
                  }
                  enableTilt
                  enableMobileTilt
                  name={card.name}
                  title={subtitle}
                  handle={setLabel || printing.setCode?.toUpperCase() || "printing"}
                  status={finish ? titleize(finish) : titleize(printing.rarity)}
                  showUserInfo={false}
                />
                {printing.imageUrl ? null : (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[4.75%] p-8 text-center text-sm text-white/70">
                    No image
                  </div>
                )}
              </motion.div>

              {canNavigate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-1/2 z-20 -translate-y-1/2 border border-white/10 bg-black/35 text-white backdrop-blur hover:bg-black/55 sm:right-4"
                  aria-label="Next printing"
                  onClick={() => goToPrinting(1)}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              ) : null}
            </div>
          </motion.div>
        </DialogContent>
      ) : null}
    </Dialog>
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
        queryClient.invalidateQueries({
          queryKey: ["deck-buylist", addedDeckId],
        })
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
