import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import type * as React from "react"
import { useEffect, useRef, useState } from "react"
import { CardNameSearchField } from "../../components/card-name-search-field"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { request } from "../../lib/graphql"
import { present, titleize } from "../../lib/utils"
import { COLLECTION_CONDITIONS, COLLECTION_FINISHES, MODAL_SEARCH_DEBOUNCE_MS } from "./constants"
import {
  CollectionItemFormOptionsDocument,
  CreateCollectionItemDocument,
  LocationCoverCardSearchDocument,
} from "./documents"
import {
  collectionConditionValue,
  collectionFinishValue,
  parseCurrencyInputCents,
  printingSetLabel,
  useDebouncedValue,
} from "./form-helpers"
import { CollectionFinishField, CollectionQuantityField } from "./item-form-fields"
import { isUnfiledLocation } from "./location-summary"
import type {
  AddCollectionItemInitialPrinting,
  AddCollectionItemPrintingSelection,
  LocationCoverCard,
  LocationCoverPrinting,
} from "./types"

export function AddCollectionItemDialog({
  initialPrinting,
  onOpenChange,
  open,
}: {
  initialPrinting?: AddCollectionItemInitialPrinting | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [selectedPrinting, setSelectedPrinting] =
    useState<AddCollectionItemPrintingSelection | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [condition, setCondition] = useState<(typeof COLLECTION_CONDITIONS)[number]>("near_mint")
  const [finish, setFinish] = useState<(typeof COLLECTION_FINISHES)[number]>("nonfoil")
  const [language, setLanguage] = useState("en")
  const [locationId, setLocationId] = useState("")
  const [notes, setNotes] = useState("")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const cardSearchRootRef = useRef<HTMLDivElement>(null)
  const isCardSearchPointerInsideRef = useRef(false)
  const [isCardSearchOpen, setIsCardSearchOpen] = useState(false)
  const debouncedSearch = useDebouncedValue(search, MODAL_SEARCH_DEBOUNCE_MS)
  const searchTerm = debouncedSearch.trim()
  const searchDraftTerm = search.trim()
  const selectedFinishes =
    selectedPrinting?.finishes?.filter(present).map(collectionFinishValue) || []
  const finishOptions = selectedFinishes.length ? selectedFinishes : COLLECTION_FINISHES
  const showCardSearchResults = !selectedPrinting && isCardSearchOpen && searchDraftTerm.length > 1

  const optionsQuery = useQuery({
    queryKey: ["collection-item-form-options"],
    queryFn: () => request(CollectionItemFormOptionsDocument),
    enabled: open,
  })
  const cardSearchQuery = useQuery({
    queryKey: ["collection-item-card-search", searchTerm],
    queryFn: () => request(LocationCoverCardSearchDocument, { q: searchTerm, limit: 8 }),
    enabled: open && !selectedPrinting && isCardSearchOpen && searchTerm.length > 1,
    staleTime: 60_000,
  })
  const createItem = useMutation({
    mutationFn: () => {
      if (!selectedPrinting) throw new Error("Choose a printing")
      const purchasePriceCents = parseCurrencyInputCents(purchasePrice)

      if (purchasePriceCents === undefined)
        throw new Error("Purchase price must be a dollar amount")

      return request(CreateCollectionItemDocument, {
        input: {
          scryfallId: selectedPrinting.scryfallId,
          quantity,
          condition,
          finish,
          language: language.trim() || "en",
          locationId: locationId || null,
          notes: notes.trim() || null,
          purchasePriceCents,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection"] })
      queryClient.invalidateQueries({ queryKey: ["collection-items"] })
      queryClient.invalidateQueries({ queryKey: ["home"] })
      close(true)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not add collection card"),
  })

  useEffect(() => {
    if (!open) return

    setSelectedPrinting(initialPrinting || null)
    setSearch("")
    setQuantity(1)
    setCondition("near_mint")
    setFinish(collectionFinishValue(initialPrinting?.finishes?.filter(present)[0] || "nonfoil"))
    setLanguage("en")
    setLocationId("")
    setNotes("")
    setPurchasePrice("")
    setError(null)
    setIsCardSearchOpen(false)
  }, [initialPrinting, open])

  useEffect(() => {
    if (!finishOptions.includes(finish))
      setFinish(collectionFinishValue(finishOptions[0] || "nonfoil"))
  }, [finish, finishOptions])

  function selectPrinting(card: LocationCoverCard, printing: LocationCoverPrinting) {
    setSelectedPrinting({
      cardName: card.name,
      collectorNumber: printing.collectorNumber,
      finishes: printing.finishes,
      imageUrl: printing.imageUrl,
      rarity: printing.rarity,
      scryfallId: printing.scryfallId,
      setCode: printing.setCode,
      setName: printing.setName,
      typeLine: card.typeLine,
    })
    setFinish(collectionFinishValue(printing.finishes?.filter(present)[0] || "nonfoil"))
    setSearch("")
    setIsCardSearchOpen(false)
  }

  function handleCardSearchChange(value: string) {
    setSearch(value)
    setIsCardSearchOpen(value.trim().length > 1)
  }

  function handleCardSuggestionSelect(value: string) {
    setSearch(value)
    setIsCardSearchOpen(true)
  }

  function handleCardSearchBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (isCardSearchPointerInsideRef.current) return
    if (!cardSearchRootRef.current?.contains(event.relatedTarget as Node | null))
      setIsCardSearchOpen(false)
  }

  function markCardSearchPointerInside() {
    isCardSearchPointerInsideRef.current = true
    window.setTimeout(() => {
      isCardSearchPointerInsideRef.current = false
    }, 0)
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!selectedPrinting) {
      setError("Choose a printing")
      return
    }

    if (quantity < 1) {
      setError("Quantity must be at least 1")
      return
    }

    if (parseCurrencyInputCents(purchasePrice) === undefined) {
      setError("Purchase price must be a dollar amount")
      return
    }

    createItem.mutate()
  }

  function close(force = false) {
    if (createItem.isPending && !force) return
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent
        className="max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_2rem)] max-w-4xl overflow-y-auto sm:max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_4rem)]"
        labelledBy="add-collection-item-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="add-collection-item-title">Add collection card</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Choose an exact printing and where it lives.
            </p>
          </div>
          <DialogClose onClose={() => close()} />
        </DialogHeader>

        <form className="space-y-3 p-4 sm:p-5" onSubmit={submit}>
          <fieldset className="space-y-2">
            <legend className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Printing
            </legend>
            {selectedPrinting ? (
              <div className="flex gap-3 rounded-box border border-base-300 bg-base-200/40 p-2.5">
                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-base-300">
                  {selectedPrinting.imageUrl ? (
                    <img
                      src={selectedPrinting.imageUrl}
                      alt={selectedPrinting.cardName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center text-xs text-base-content/50">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="font-bold leading-tight">{selectedPrinting.cardName}</p>
                  {selectedPrinting.typeLine ? (
                    <p className="mt-1 text-xs text-base-content/60">{selectedPrinting.typeLine}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-base-content/65">
                    {printingSetLabel(selectedPrinting)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPrinting(null)}
                >
                  Change
                </Button>
              </div>
            ) : null}

            {!selectedPrinting ? (
              <div
                ref={cardSearchRootRef}
                className="space-y-2"
                onBlur={handleCardSearchBlur}
                onPointerDownCapture={markCardSearchPointerInside}
              >
                <CardNameSearchField
                  value={search}
                  onValueChange={handleCardSearchChange}
                  onClear={() => {
                    setSearch("")
                    setIsCardSearchOpen(false)
                  }}
                  onFocus={() => setIsCardSearchOpen(searchDraftTerm.length > 1)}
                  onSuggestionSelect={handleCardSuggestionSelect}
                  aria-label="Search for a card"
                  placeholder="Search for a card"
                  suggestionLimit={8}
                />
                {showCardSearchResults ? (
                  <div className="max-h-64 overflow-y-auto rounded-box border border-base-300 bg-base-100">
                    {cardSearchQuery.isFetching || searchTerm !== searchDraftTerm ? (
                      <p className="px-3 py-2 text-sm text-base-content/55">Searching...</p>
                    ) : null}
                    {!cardSearchQuery.isFetching &&
                    searchTerm === searchDraftTerm &&
                    cardSearchQuery.data?.cards.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-base-content/55">No cards found.</p>
                    ) : null}
                    {searchTerm === searchDraftTerm
                      ? cardSearchQuery.data?.cards.map((card) => (
                          <div
                            key={card.oracleId}
                            className="border-t border-base-300 p-2 first:border-t-0"
                          >
                            <div className="mb-1.5">
                              <p className="font-bold leading-tight">{card.name}</p>
                              {card.typeLine ? (
                                <p className="text-xs text-base-content/55">{card.typeLine}</p>
                              ) : null}
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
                              {card.printings
                                ?.filter(present)
                                .slice(0, 8)
                                .map((printing) => (
                                  <button
                                    key={printing.scryfallId}
                                    type="button"
                                    className="group rounded-lg border border-base-300 bg-base-200/40 p-1.5 text-left transition hover:border-primary hover:bg-base-200"
                                    onClick={() => selectPrinting(card, printing)}
                                  >
                                    <div className="aspect-[5/7] overflow-hidden rounded bg-base-300">
                                      {printing.imageUrl ? (
                                        <img
                                          src={printing.imageUrl}
                                          alt={`${card.name} ${printing.setCode || "printing"}`}
                                          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <div className="flex h-full items-center justify-center px-2 text-center text-xs text-base-content/50">
                                          No image
                                        </div>
                                      )}
                                    </div>
                                    <p className="mt-1.5 truncate text-xs font-bold uppercase">
                                      {printing.setCode || "Unknown set"}
                                    </p>
                                    <p className="truncate text-xs text-base-content/60">
                                      #{printing.collectorNumber || "-"}
                                    </p>
                                  </button>
                                ))}
                            </div>
                          </div>
                        ))
                      : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CollectionQuantityField value={quantity} onChange={setQuantity} />

            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Condition
              </span>
              <select
                className="select select-bordered h-9 min-h-9 w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={condition}
                onChange={(event) => setCondition(collectionConditionValue(event.target.value))}
              >
                {COLLECTION_CONDITIONS.map((condition) => (
                  <option key={condition} value={condition}>
                    {titleize(condition)}
                  </option>
                ))}
              </select>
            </label>

            <CollectionFinishField options={finishOptions} value={finish} onChange={setFinish} />

            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Language
              </span>
              <Input
                className="h-9 min-h-9"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="en"
              />
            </label>

            <label className="block space-y-1.5 lg:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Purchase price
              </span>
              <Input
                className="h-9 min-h-9"
                inputMode="decimal"
                value={purchasePrice}
                onChange={(event) => setPurchasePrice(event.target.value)}
                placeholder="Current market price"
              />
              <span className="block text-xs leading-tight text-base-content/55">
                Leave blank to use the current market price.
              </span>
            </label>

            <label className="block space-y-1.5 lg:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Location
              </span>
              <select
                className="select select-bordered h-9 min-h-9 w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">Unfiled</option>
                {optionsQuery.data?.locations
                  .filter((location) => !isUnfiledLocation(location))
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} ({titleize(location.kind)})
                    </option>
                  ))}
              </select>
            </label>

            <label className="block space-y-1.5 sm:col-span-2 lg:col-span-4">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Notes
              </span>
              <textarea
                className="textarea textarea-bordered min-h-16 w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional notes"
              />
            </label>
          </div>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => close()}
              disabled={createItem.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createItem.isPending}>
              <Plus className="h-4 w-4" />
              {createItem.isPending ? "Adding card..." : "Add card"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
