import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { useNavigate } from "@tanstack/react-router"
import { ArrowLeft, ExternalLink, PackageOpen, Search } from "lucide-react"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Button } from "../../components/ui/button"
import { ColorIdentitySymbols } from "../../components/ui/mana-symbols"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Switch } from "../../components/ui/switch"
import { useToast } from "../../components/ui/toast"
import { refetchActiveQueries } from "../../lib/apollo"
import { pluralize, present } from "../../lib/utils"
import { LocationPicker, UNFILED_PICK } from "../collection/location-picker"
import { LocationPickerDocument } from "../collection/locations/documents"
import { CommanderPreconsDocument, ImportCommanderPreconDocument } from "./deck-list-documents"

type CommanderPrecon = {
  id: string
  name: string
  product?: string | null
  releaseDate?: string | null
  url?: string | null
  colorIdentity?: string[] | null
}

function searchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

/** Precons whose name or product contains every word of the query. */
function filterPrecons(precons: readonly CommanderPrecon[], query: string) {
  const words = searchText(query).split(/\s+/).filter(Boolean)
  if (!words.length) return [...precons]

  return precons.filter((precon) => {
    const text = searchText(`${precon.name} ${precon.product || ""}`)
    return words.every((word) => text.includes(word))
  })
}

/**
 * Imports a Commander precon from MTGJSON's decklists: pick one from a
 * searchable list, then name the new deck and
 * optionally add its cards to the collection, allocated to the deck.
 */
export function PreconImportDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const client = useApolloClient()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<CommanderPrecon | null>(null)
  const [deckName, setDeckName] = useState("")
  const [addToCollection, setAddToCollection] = useState(false)
  const [locationId, setLocationId] = useState(UNFILED_PICK)
  const [error, setError] = useState<string | null>(null)

  const preconsQuery = useQuery(CommanderPreconsDocument, { skip: !open })
  const precons = preconsQuery.data?.commanderPrecons ?? []
  const matches = useMemo(() => filterPrecons(precons, query), [precons, query])
  const locationsQuery = useQuery(LocationPickerDocument, {
    skip: !open || !addToCollection,
    fetchPolicy: "cache-and-network",
  })
  // Allocated cards leave their location, so a list (wanted cards) can't hold them.
  const storageLocations = (
    locationsQuery.data?.locations?.edges?.map((edge) => edge?.node).filter(present) ?? []
  ).filter((location) => location.kind !== "list")

  const [importPrecon, importResult] = useMutation(ImportCommanderPreconDocument)
  const isImporting = importResult.loading

  useEffect(() => {
    if (open) return
    setQuery("")
    setSelected(null)
    setDeckName("")
    setAddToCollection(false)
    setLocationId(UNFILED_PICK)
    setError(null)
  }, [open])

  function choose(precon: CommanderPrecon) {
    setSelected(precon)
    setDeckName(precon.name)
    setError(null)
  }

  function close() {
    if (isImporting) return
    onOpenChange(false)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    setError(null)

    const name = deckName.trim() || selected.name
    void importPrecon({
      variables: {
        input: {
          preconId: selected.id,
          name,
          addToCollection,
          locationId: addToCollection && locationId ? locationId : null,
        },
      },
      onCompleted: (data) => {
        const result = data.importCommanderPrecon
        void refetchActiveQueries(client)
        const added = result?.addedToCollection ?? 0
        showToast(
          added > 0
            ? `Imported ${name} and added ${pluralize(added, "card")} to your collection`
            : `Imported ${name}`,
        )
        const unresolved = result?.unresolved ?? []
        if (unresolved.length) {
          showToast(
            `${pluralize(unresolved.length, "card")} not in the catalog: ${unresolved.join(", ")}`,
            { tone: "info" },
          )
        }
        onOpenChange(false)
        if (result?.deck?.id) navigate({ to: "/decks/$id", params: { id: result.deck.id } })
      },
      onError: (error) =>
        setError(error instanceof Error ? error.message : "Could not import the precon"),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent
        className="flex max-h-[calc(100dvh-3rem)] max-w-2xl flex-col"
        labelledBy="precon-import-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="precon-import-title">Import a precon</DialogTitle>
            <p className="mt-1 text-sm text-base-content/75">
              Commander precon decklists from MTGJSON.
            </p>
          </div>
          <DialogClose className="h-11 w-11" onClose={close} />
        </DialogHeader>

        {selected ? (
          <form className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5" onSubmit={submit}>
            <div className="flex items-start justify-between gap-4 rounded-box border border-base-300 bg-base-200/40 p-4">
              <div className="min-w-0">
                <div className="text-lg font-black leading-tight">{selected.name}</div>
                <div className="mt-1 text-sm text-base-content/70">
                  {[selected.product, selected.releaseDate].filter(Boolean).join(" · ")}
                </div>
              </div>
              {selected.url ? (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-bold text-base-content/75 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  Decklist
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              ) : null}
            </div>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-base-content/80">
                Deck name
              </span>
              <Input
                className="min-h-11"
                value={deckName}
                onChange={(event) => setDeckName(event.target.value)}
                placeholder={selected.name}
                disabled={isImporting}
              />
            </label>

            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-bold">Add the cards to my collection</span>
                <span id="precon-collection-help" className="block text-sm text-base-content/75">
                  Each card is added in the precon's printing and allocated to the new deck. Basic
                  lands are skipped.
                </span>
              </span>
              <Switch
                aria-label="Add the cards to my collection"
                aria-describedby="precon-collection-help"
                checked={addToCollection}
                onCheckedChange={setAddToCollection}
                disabled={isImporting}
                className="shrink-0"
              />
            </label>

            {addToCollection ? (
              // min-w-0: a fieldset otherwise grows to its content, so the
              // location row would overflow the dialog instead of scrolling.
              <fieldset className="min-w-0">
                <legend className="text-sm font-bold">Store them in</legend>
                <p className="text-sm text-base-content/75">
                  Cards return here when they leave the deck.
                </p>
                <LocationPicker
                  disabled={isImporting}
                  locations={storageLocations}
                  value={locationId}
                  onChange={setLocationId}
                />
              </fieldset>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-between gap-2 border-t border-base-300 pt-4">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => setSelected(null)}
                disabled={isImporting}
              >
                <ArrowLeft className="h-4 w-4" />
                All precons
              </Button>
              <Button type="submit" className="min-h-11" disabled={isImporting}>
                <PackageOpen className="h-4 w-4" />
                {isImporting ? "Importing..." : "Import deck"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-2 border-b border-base-300 p-5">
              <label className="relative block">
                <span className="sr-only">Search precons</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/60"
                  aria-hidden
                />
                <Input
                  className="min-h-11 pl-9"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by deck or product"
                  autoFocus
                />
              </label>
              {precons.length ? (
                <p className="text-sm text-base-content/70" aria-live="polite">
                  {query.trim()
                    ? `${matches.length} of ${pluralize(precons.length, "precon")}`
                    : pluralize(precons.length, "precon")}
                </p>
              ) : null}
            </div>

            {/* A fixed height on wider screens keeps the dialog still while the list filters. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:h-[28rem] sm:flex-none">
              {preconsQuery.error && !precons.length ? (
                <div role="alert" className="space-y-3 p-3 text-sm">
                  <p className="text-error">{preconsQuery.error.message}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void preconsQuery.refetch()}
                  >
                    Retry
                  </Button>
                </div>
              ) : preconsQuery.loading && !precons.length ? (
                <div role="status" aria-busy="true" className="space-y-1">
                  <span className="sr-only">Loading precons</span>
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <div key={index} className="space-y-1.5 px-3 py-2.5">
                      <div className="skeleton h-4 w-1/2 rounded" />
                      <div className="skeleton h-3 w-1/3 rounded" />
                    </div>
                  ))}
                </div>
              ) : matches.length ? (
                <ul aria-label="Commander precons" className="space-y-0.5">
                  {matches.map((precon) => (
                    <li key={precon.id}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-box px-3 py-2 text-left transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        onClick={() => choose(precon)}
                      >
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-bold">{precon.name}</span>
                            <ColorIdentitySymbols colors={precon.colorIdentity ?? []} />
                          </span>
                          {precon.product ? (
                            <span className="block truncate text-sm text-base-content/70">
                              {precon.product}
                            </span>
                          ) : null}
                        </span>
                        {precon.releaseDate ? (
                          <span className="shrink-0 font-mono text-sm text-base-content/70">
                            {precon.releaseDate.slice(0, 4)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : precons.length ? (
                <p className="p-3 text-sm text-base-content/70">
                  No precons match "{query.trim()}".
                </p>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
