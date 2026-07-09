import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { Plus } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { CardNameSearchField } from "../components/card-name-search-field"
import { Button } from "../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { useToast } from "../components/ui/toast"
import { refetchActiveQueries } from "../lib/apollo"
import { cn, pluralize, present, titleize } from "../lib/utils"
import { CardsDocument } from "./cards/data"
import { COLLECTION_CONDITIONS } from "./collection/constants"
import {
  CollectionItemFormOptionsDocument,
  CreateCollectionItemDocument,
} from "./collection/documents"
import {
  collectionConditionValue,
  collectionFinishValue,
  parseCurrencyInputCents,
} from "./collection/form-helpers"
import {
  CollectionFinishField,
  CollectionQuantityField,
  type CollectionFinishOption,
} from "./collection/item-form-fields"
import { isUnfiledLocation } from "./collection/location-summary"
import type { AddCollectionItemInitialPrinting } from "./collection/types"
import { selectedDeckCardNameForMutation } from "./decks/add-card-dialog-model"
import type { DeckDetail, DeckZone } from "./decks/deck-types"
import { ADD_CARD_ZONES, NON_COMMANDER_ADD_CARD_ZONES } from "./decks/deck-types"
import { AddDeckCardDocument } from "./decks/queries"

const ADD_CARD_SEARCH_DEBOUNCE_MS = 250
const KNOWN_FINISHES = ["nonfoil", "foil", "etched"] as const

type UnifiedPrinting = {
  id: string
  cardName: string
  typeLine?: string | null
  imageUrl?: string | null
  setCode?: string | null
  setName?: string | null
  collectorNumber?: string | null
  rarity?: string | null
  finishes?: Array<string | null> | null
  ownedCount?: number | null
  priceText?: string | null
}

type CardAddDialogProps =
  | {
      mode: "deck"
      deck: DeckDetail | null
      open: boolean
      onOpenChange: (open: boolean) => void
    }
  | {
      mode: "collection"
      initialPrinting?: AddCollectionItemInitialPrinting | null
      open: boolean
      onOpenChange: (open: boolean) => void
    }

/**
 * Single add-card dialog parameterized by destination. Deck mode adds a card to
 * a deck zone; collection mode adds a printing to a collection location with
 * condition/finish/price metadata. Both share the same card search + printing
 * selection and the finish toggle. Collection mode honors `initialPrinting`,
 * opening with that exact printing already selected.
 */
export function CardAddDialog(props: CardAddDialogProps) {
  const { mode, open, onOpenChange } = props
  const deck = props.mode === "deck" ? props.deck : null
  const initialPrinting = props.mode === "collection" ? props.initialPrinting : null

  const client = useApolloClient()
  const { showToast } = useToast()

  const [name, setName] = useState("")
  const [debouncedName, setDebouncedName] = useState("")
  const [selectedPrintingId, setSelectedPrintingId] = useState("")
  const [seededPrinting, setSeededPrinting] = useState<UnifiedPrinting | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [finish, setFinish] = useState<CollectionFinishOption>("nonfoil")
  const [error, setError] = useState<string | null>(null)

  // Deck-only
  const [zone, setZone] = useState<DeckZone>("mainboard")

  // Collection-only
  const [condition, setCondition] = useState<(typeof COLLECTION_CONDITIONS)[number]>("near_mint")
  const [language, setLanguage] = useState("en")
  const [locationId, setLocationId] = useState("")
  const [notes, setNotes] = useState("")
  const [purchasePrice, setPurchasePrice] = useState("")

  const zoneOptions = deck?.format === "commander" ? ADD_CARD_ZONES : NON_COMMANDER_ADD_CARD_ZONES

  const cardSearchDraftTerm = name.trim()
  const cardSearchTerm = debouncedName.trim()
  const isCardSearchSettled = cardSearchTerm === cardSearchDraftTerm

  const cardSearchQuery = useQuery(CardsDocument, {
    variables: { q: cardSearchTerm, limit: 5 },
    skip: !open || cardSearchTerm.length < 2,
  })
  const optionsQuery = useQuery(CollectionItemFormOptionsDocument, {
    skip: !open || mode !== "collection",
    fetchPolicy: "cache-and-network",
  })
  const locations =
    optionsQuery.data?.locations?.edges?.map((edge) => edge?.node).filter(present) || []

  const cardOptions =
    isCardSearchSettled && !cardSearchQuery.loading
      ? cardSearchQuery.data?.cards?.edges?.map((edge) => edge?.node).filter(present) || []
      : []
  const selectedCard =
    cardOptions.find((card) => card.name.toLowerCase() === cardSearchTerm.toLowerCase()) ||
    cardOptions[0]
  const selectedCardName = selectedDeckCardNameForMutation(name, selectedCard)
  const isCardSearchPending =
    open && cardSearchDraftTerm.length >= 2 && (!isCardSearchSettled || cardSearchQuery.loading)
  const selectedCardMatchesInput = Boolean(
    selectedCard && selectedCardName.toLowerCase() === cardSearchDraftTerm.toLowerCase(),
  )

  const searchPrintingOptions: UnifiedPrinting[] =
    selectedCard?.printings?.edges
      ?.map((edge) => edge?.node)
      .filter(present)
      .map((printing) => ({
        id: printing.id,
        cardName: selectedCard.name,
        typeLine: selectedCard.typeLine,
        imageUrl: printing.imageUrl,
        setCode: printing.setCode,
        setName: printing.setName,
        collectorNumber: printing.collectorNumber,
        rarity: printing.rarity,
        finishes: printing.finishes,
        ownedCount: printing.ownedCount,
        priceText: printing.priceText,
      })) || []
  // Keep the seeded printing (from `initialPrinting`) available even when the
  // card has >20 printings and the search page didn't return it, so the exact
  // printing is never silently swapped for the first search result.
  const printingOptions: UnifiedPrinting[] =
    seededPrinting && !searchPrintingOptions.some((printing) => printing.id === seededPrinting.id)
      ? [seededPrinting, ...searchPrintingOptions]
      : searchPrintingOptions
  const effectivePrinting =
    printingOptions.find((printing) => printing.id === selectedPrintingId) ||
    printingOptions[0] ||
    seededPrinting ||
    null

  const selectedFinishes = (effectivePrinting?.finishes?.filter(present) || []).map(
    collectionFinishValue,
  )
  const finishOptions: CollectionFinishOption[] = selectedFinishes.length
    ? selectedFinishes
    : [...KNOWN_FINISHES]

  const [addDeckCardMutation, addDeckCardResult] = useMutation(AddDeckCardDocument)
  const [createItemMutation, createItemResult] = useMutation(CreateCollectionItemDocument)
  const isPending = mode === "deck" ? addDeckCardResult.loading : createItemResult.loading

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedName(name), ADD_CARD_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [name])

  useEffect(() => {
    if (!open) return

    setQuantity(1)
    setZone("mainboard")
    setError(null)
    setCondition("near_mint")
    setLanguage("en")
    setLocationId("")
    setNotes("")
    setPurchasePrice("")

    if (mode === "collection" && initialPrinting) {
      setName(initialPrinting.cardName)
      setDebouncedName(initialPrinting.cardName)
      setSelectedPrintingId(initialPrinting.id)
      setSeededPrinting({
        id: initialPrinting.id,
        cardName: initialPrinting.cardName,
        typeLine: initialPrinting.typeLine,
        imageUrl: initialPrinting.imageUrl,
        setCode: initialPrinting.setCode,
        setName: initialPrinting.setName,
        collectorNumber: initialPrinting.collectorNumber,
        rarity: initialPrinting.rarity,
        finishes: initialPrinting.finishes,
      })
      setFinish(collectionFinishValue(initialPrinting.finishes?.filter(present)[0] || "nonfoil"))
    } else {
      setName("")
      setDebouncedName("")
      setSelectedPrintingId("")
      setSeededPrinting(null)
      setFinish("nonfoil")
    }
  }, [open, mode, initialPrinting])

  useEffect(() => {
    if (!zoneOptions.includes(zone)) setZone("mainboard")
  }, [zone, zoneOptions])

  useEffect(() => {
    if (!effectivePrinting?.id) {
      setSelectedPrintingId("")
      return
    }

    setSelectedPrintingId(effectivePrinting.id)
  }, [effectivePrinting?.id])

  useEffect(() => {
    if (!finishOptions.includes(finish)) setFinish(finishOptions[0] || "nonfoil")
  }, [finish, finishOptions])

  function handleNameChange(value: string) {
    setName(value)
    if (seededPrinting && value !== seededPrinting.cardName) setSeededPrinting(null)
  }

  function close() {
    if (isPending) return
    setError(null)
    onOpenChange(false)
  }

  function onAdded(message: string) {
    void refetchActiveQueries(client)
    showToast(message)
    onOpenChange(false)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (mode === "deck") {
      if (!cardSearchDraftTerm) return setError("Choose a card.")
      if (isCardSearchPending) return setError("Wait for the card search to finish.")
      if (!selectedCard) return setError("Choose a matching card.")

      void addDeckCardMutation({
        variables: {
          deckId: deck?.id || "",
          input: {
            name: selectedCardName,
            quantity,
            zone,
            finish,
            preferredPrintingId: effectivePrinting?.id || null,
          },
        },
        onCompleted: () => onAdded(`${pluralize(quantity, "card")} added to deck`),
        onError: (error) =>
          setError(error instanceof Error ? error.message : "Could not add card to deck"),
      })
      return
    }

    if (!effectivePrinting) return setError("Choose a printing")
    if (isCardSearchPending || !effectiveMatchesInput) {
      return setError("Wait for the card search to finish.")
    }
    if (quantity < 1) return setError("Quantity must be at least 1")

    const purchasePriceCents = parseCurrencyInputCents(purchasePrice)
    if (purchasePriceCents === undefined) {
      return setError("Purchase price must be a dollar amount")
    }

    void createItemMutation({
      variables: {
        input: {
          scryfallId: effectivePrinting.id,
          quantity,
          condition,
          finish,
          language: language.trim() || "en",
          locationId: locationId || null,
          notes: notes.trim() || null,
          purchasePriceCents,
        },
      },
      onCompleted: () => onAdded(`${pluralize(quantity, "card")} added to collection`),
      onError: (error) =>
        setError(error instanceof Error ? error.message : "Could not add collection card"),
    })
  }

  // Block collection submit when the typed name has diverged from the effective
  // printing and the search hasn't caught up yet, so a stale/seeded printing is
  // never submitted while the input shows a different card.
  const effectiveMatchesInput =
    !effectivePrinting ||
    !cardSearchDraftTerm ||
    effectivePrinting.cardName.toLowerCase() === cardSearchDraftTerm.toLowerCase() ||
    (selectedCard != null && effectivePrinting.cardName === selectedCard.name)
  const canSubmit =
    mode === "deck"
      ? Boolean(deck && selectedCard && !isCardSearchPending && !isPending)
      : Boolean(effectivePrinting && !isPending && !isCardSearchPending && effectiveMatchesInput)

  const title = mode === "deck" ? "Add card" : "Add collection card"
  const subtitle = mode === "deck" ? deck?.name : "Choose an exact printing and where it lives."

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_2rem)] overflow-y-auto sm:max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_4rem)]",
          mode === "deck" ? "max-w-xl" : "max-w-2xl",
        )}
        labelledBy="add-card-dialog-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="add-card-dialog-title">{title}</DialogTitle>
            {subtitle ? <p className="mt-1 text-sm text-base-content/60">{subtitle}</p> : null}
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-4 p-5" onSubmit={submit}>
          <div className="form-control">
            <label htmlFor="add-card-search" className="label-text mb-1 text-sm font-semibold">
              Card
            </label>
            <CardNameSearchField
              id="add-card-search"
              value={name}
              onValueChange={handleNameChange}
              onSuggestionSelect={handleNameChange}
              placeholder="Search card name"
              selectFirstSuggestionOnEnter
              disabled={isPending}
            />
            <p className="mt-1 text-xs text-base-content/60">
              {isCardSearchPending
                ? "Searching for the matching card..."
                : effectivePrinting
                  ? selectedCardMatchesInput || !selectedCard
                    ? "Printing selected."
                    : `Selected match: ${selectedCard.name}`
                  : !cardSearchDraftTerm
                    ? "Type a card name; the selected match below is what will be added."
                    : cardSearchDraftTerm.length < 2
                      ? "Enter at least 2 characters."
                      : "No matching card found."}
            </p>
          </div>

          {effectivePrinting ? (
            <div className="rounded-box border border-base-300 bg-base-200/35 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  Selected card
                </p>
                {selectedCard && !selectedCardMatchesInput ? (
                  <p className="rounded-full border border-primary/30 px-2 py-0.5 text-xs font-semibold text-primary">
                    Matched from search
                  </p>
                ) : null}
              </div>
              <div className="flex gap-3">
                {effectivePrinting.imageUrl ? (
                  <img
                    src={effectivePrinting.imageUrl}
                    alt=""
                    className="h-28 w-20 shrink-0 rounded-lg object-cover shadow"
                    loading="lazy"
                  />
                ) : null}
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="font-semibold">{effectivePrinting.cardName}</p>
                    <p className="text-sm text-base-content/65">
                      {printingLabel(effectivePrinting)}
                    </p>
                    {mode === "deck" ? (
                      <p className="mt-1 text-xs text-base-content/60">
                        {effectivePrinting.ownedCount
                          ? `${effectivePrinting.ownedCount} owned in collection`
                          : "Not in collection"}
                        {effectivePrinting.priceText ? ` · ${effectivePrinting.priceText}` : ""}
                      </p>
                    ) : null}
                  </div>
                  {printingOptions.length ? (
                    <label className="form-control">
                      <span className="label-text mb-1 text-sm font-semibold">Printing</span>
                      <select
                        className="select select-bordered w-full"
                        value={selectedPrintingId}
                        disabled={isPending}
                        onChange={(event) => setSelectedPrintingId(event.target.value)}
                      >
                        {printingOptions.map((printing) => (
                          <option key={printing.id} value={printing.id}>
                            {printingLabel(printing)}
                            {printing.ownedCount ? ` · ${printing.ownedCount} owned` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CollectionQuantityField value={quantity} onChange={setQuantity} />

            <CollectionFinishField options={finishOptions} value={finish} onChange={setFinish} />

            {mode === "deck" ? (
              <label className="form-control">
                <span className="label-text mb-1 text-sm font-semibold">Zone</span>
                <select
                  className="select select-bordered w-full"
                  value={zone}
                  disabled={isPending}
                  onChange={(event) => setZone(event.target.value as DeckZone)}
                >
                  {zoneOptions.map((zoneOption) => (
                    <option key={zoneOption} value={zoneOption}>
                      {titleize(zoneOption)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="form-control">
                  <span className="label-text mb-1 text-sm font-semibold">Condition</span>
                  <select
                    className="select select-bordered w-full"
                    value={condition}
                    disabled={isPending}
                    onChange={(event) => setCondition(collectionConditionValue(event.target.value))}
                  >
                    {COLLECTION_CONDITIONS.map((conditionOption) => (
                      <option key={conditionOption} value={conditionOption}>
                        {titleize(conditionOption)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-control">
                  <span className="label-text mb-1 text-sm font-semibold">Language</span>
                  <Input
                    value={language}
                    disabled={isPending}
                    onChange={(event) => setLanguage(event.target.value)}
                    placeholder="en"
                  />
                </label>

                <label className="form-control sm:col-span-2 lg:col-span-1">
                  <span className="label-text mb-1 text-sm font-semibold">Purchase price</span>
                  <Input
                    inputMode="decimal"
                    value={purchasePrice}
                    disabled={isPending}
                    onChange={(event) => setPurchasePrice(event.target.value)}
                    placeholder="Current market price"
                  />
                </label>

                <label className="form-control sm:col-span-2">
                  <span className="label-text mb-1 text-sm font-semibold">Location</span>
                  <select
                    className="select select-bordered w-full"
                    value={locationId}
                    disabled={isPending}
                    onChange={(event) => setLocationId(event.target.value)}
                  >
                    <option value="">Unfiled</option>
                    {locations
                      .filter((location) => !isUnfiledLocation(location))
                      .map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name} ({titleize(location.kind)})
                        </option>
                      ))}
                  </select>
                </label>

                <label className="form-control sm:col-span-2 lg:col-span-3">
                  <span className="label-text mb-1 text-sm font-semibold">Notes</span>
                  <textarea
                    className="textarea textarea-bordered min-h-16 w-full"
                    value={notes}
                    disabled={isPending}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional notes"
                  />
                </label>
              </>
            )}
          </div>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={isPending} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mode === "collection" ? <Plus className="h-4 w-4" /> : null}
              {isPending
                ? "Adding..."
                : mode === "deck" && selectedCard
                  ? `Add ${selectedCard.name}`
                  : "Add card"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function printingLabel(printing: {
  collectorNumber?: string | null
  rarity?: string | null
  setCode?: string | null
  setName?: string | null
}) {
  return (
    [
      printing.setCode?.toUpperCase(),
      printing.collectorNumber ? `#${printing.collectorNumber}` : null,
      printing.setName,
      printing.rarity ? titleize(printing.rarity) : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Selected printing"
  )
}
