import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { Plus } from "lucide-react"
import type * as React from "react"
import { useEffect, useMemo, useState } from "react"
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
import { useToast } from "../../components/ui/toast"
import { refetchActiveQueries } from "../../lib/apollo"
import { present, titleize } from "../../lib/utils"
import { LOCATION_KINDS, MODAL_SEARCH_DEBOUNCE_MS } from "./constants"
import { CreateLocationDocument, LocationCoverCardSearchDocument } from "./documents"
import { locationKindValue, printingSetLabel, useDebouncedValue } from "./form-helpers"
import type { LocationCoverCard, LocationCoverPrinting, LocationCoverSelection } from "./types"

export function AddLocationDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const client = useApolloClient()
  const { showToast } = useToast()
  const [name, setName] = useState("")
  const [kind, setKind] = useState<(typeof LOCATION_KINDS)[number]>("box")
  const [description, setDescription] = useState("")
  const [coverSearch, setCoverSearch] = useState("")
  const [selectedCover, setSelectedCover] = useState<LocationCoverSelection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debouncedCoverSearch = useDebouncedValue(coverSearch, MODAL_SEARCH_DEBOUNCE_MS)
  const coverSearchTerm = debouncedCoverSearch.trim()
  const coverSearchDraftTerm = coverSearch.trim()

  const coverSearchQuery = useQuery(LocationCoverCardSearchDocument, {
    variables: { q: coverSearchTerm, first: 8 },
    skip: !(open && coverSearchTerm.length > 1),
  })
  const coverSearchCards = useMemo(
    () =>
      coverSearchQuery.data?.cards?.edges
        ?.map((edge) => edge?.node)
        .filter(present)
        .map((card) => ({
          ...card,
          printings: card.printings?.edges?.map((edge) => edge?.node).filter(present) || [],
        })) || [],
    [coverSearchQuery.data],
  )
  const [createLocationMutation, createLocation] = useMutation(CreateLocationDocument)

  useEffect(() => {
    if (!open) return
    reset()
  }, [open])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("Location name is required")
      return
    }

    void createLocationMutation({
      variables: {
        input: {
          name: name.trim(),
          kind,
          description: description.trim() || null,
          coverScryfallId: selectedCover?.id ?? null,
        },
      },
      onCompleted: () => {
        void refetchActiveQueries(client)
        showToast(`Created location ${name.trim()}`)
        reset()
        onOpenChange(false)
      },
      onError: (error) =>
        setError(error instanceof Error ? error.message : "Could not create location"),
    })
  }

  function close() {
    if (createLocation.loading) return
    setError(null)
    onOpenChange(false)
  }

  function reset() {
    setName("")
    setKind("box")
    setDescription("")
    setCoverSearch("")
    setSelectedCover(null)
    setError(null)
  }

  function selectCover(card: LocationCoverCard, printing: LocationCoverPrinting) {
    setSelectedCover({
      cardName: card.name,
      collectorNumber: printing.collectorNumber,
      id: printing.id,
      imageUrl: printing.artCropUrl || printing.imageUrl,
      rarity: printing.rarity,
      scryfallId: printing.scryfallId,
      setCode: printing.setCode,
      setName: printing.setName,
    })
    setCoverSearch("")
  }

  function clearCover() {
    setSelectedCover(null)
    setCoverSearch("")
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent
        className="max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_2rem)] max-w-3xl overflow-y-auto sm:max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_4rem)]"
        labelledBy="add-location-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="add-location-title">Add location</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Create a box, binder, list, or other place for collection items.
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-5 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Location name"
              autoFocus
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Kind</span>
            <select
              className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={kind}
              onChange={(event) => setKind(locationKindValue(event.target.value))}
            >
              {LOCATION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {titleize(kind)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Description
            </span>
            <textarea
              className="textarea textarea-bordered min-h-24 w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional notes"
            />
          </label>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  Cover image
                </span>
                <p className="mt-1 text-xs text-base-content/55">
                  Search for a card, then choose the printing to use as this location's cover.
                </p>
              </div>
              {selectedCover ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearCover}>
                  Remove cover
                </Button>
              ) : null}
            </div>

            {selectedCover ? (
              <div className="flex gap-3 rounded-box border border-base-300 bg-base-200/40 p-3">
                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-base-300">
                  {selectedCover.imageUrl ? (
                    <img
                      src={selectedCover.imageUrl}
                      alt={selectedCover.cardName || "Selected cover"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center text-xs text-base-content/50">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0 py-1">
                  <p className="font-bold">{selectedCover.cardName || "Selected printing"}</p>
                  <p className="text-sm text-base-content/65">{printingSetLabel(selectedCover)}</p>
                  <p className="mt-2 text-xs text-base-content/45">Cover selected</p>
                </div>
              </div>
            ) : null}

            <CardNameSearchField
              value={coverSearch}
              onValueChange={setCoverSearch}
              onClear={() => setCoverSearch("")}
              onSuggestionSelect={setCoverSearch}
              placeholder="Search for a cover card"
              suggestionLimit={8}
            />

            {coverSearchDraftTerm.length > 1 ? (
              <div className="max-h-80 overflow-y-auto rounded-box border border-base-300 bg-base-100">
                {coverSearchQuery.loading || coverSearchTerm !== coverSearchDraftTerm ? (
                  <p className="px-3 py-2 text-sm text-base-content/55">Searching...</p>
                ) : null}
                {!coverSearchQuery.loading &&
                coverSearchTerm === coverSearchDraftTerm &&
                coverSearchCards.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-base-content/55">No cards found.</p>
                ) : null}
                {coverSearchTerm === coverSearchDraftTerm
                  ? coverSearchCards.map((card) => (
                      <div key={card.id} className="border-t border-base-300 p-3 first:border-t-0">
                        <div className="mb-2">
                          <p className="font-bold">{card.name}</p>
                          {card.typeLine ? (
                            <p className="text-xs text-base-content/55">{card.typeLine}</p>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {card.printings.slice(0, 8).map((printing) => (
                            <button
                              key={printing.id}
                              type="button"
                              className="group rounded-lg border border-base-300 bg-base-200/40 p-2 text-left transition hover:border-primary hover:bg-base-200"
                              onClick={() => selectCover(card, printing)}
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
                              <p className="mt-2 truncate text-xs font-bold uppercase">
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
          </section>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={close} disabled={createLocation.loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={createLocation.loading}>
              <Plus className="h-4 w-4" />
              {createLocation.loading ? "Creating..." : "Create location"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
