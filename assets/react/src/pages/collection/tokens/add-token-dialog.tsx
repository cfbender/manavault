import { useMutation, useQuery } from "@apollo/client/react"
import { Plus } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { SearchField } from "../../../components/search-field"
import {
  TokenBackFaceOptions,
  useTokenBackOptions,
} from "../../../components/token-back-face-options"
import {
  TokenPrintingGrid,
  type TokenPrintingOption,
} from "../../../components/token-printing-grid"
import { Button } from "../../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { useToast } from "../../../components/ui/toast"
import { cn, pluralize, present } from "../../../lib/utils"
import { MODAL_SEARCH_DEBOUNCE_MS } from "../constants"
import { collectionFinishValue } from "../form-helpers"
import {
  CollectionFinishField,
  CollectionQuantityField,
  type CollectionFinishOption,
} from "../item-form-fields"
import type { TokenPrinting } from "../types"
import { AddTokenItemDocument, TokenPrintingSearchDocument } from "./documents"

const MIN_SEARCH_LENGTH = 2

/**
 * Add an owned token by picking its printing from search results. A token can carry a
 * second token on its back (Commander precons print them that way), so the tokens known
 * to be printed with the picked printing, then its set-mates, are offered as the back face.
 */
export function AddTokenDialog({
  onAdded,
  onOpenChange,
  open,
}: {
  onAdded: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { showToast } = useToast()
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [printing, setPrinting] = useState<TokenPrinting | null>(null)
  const [back, setBack] = useState<TokenPrintingOption | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [finish, setFinish] = useState<CollectionFinishOption>("nonfoil")
  const [error, setError] = useState<string | null>(null)
  const [addTokenItem, addResult] = useMutation(AddTokenItemDocument)

  const searchTerm = debouncedSearch.trim()
  const searchQuery = useQuery(TokenPrintingSearchDocument, {
    variables: { q: searchTerm },
    skip: !open || searchTerm.length < MIN_SEARCH_LENGTH,
  })
  const results = searchQuery.data?.tokenPrintings ?? []
  const searchPending = search.trim() !== searchTerm || searchQuery.loading

  const finishOptions = (printing?.finishes?.filter(present) ?? []).map(collectionFinishValue)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), MODAL_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    if (!open) return
    setSearch("")
    setDebouncedSearch("")
    setPrinting(null)
    setBack(null)
    setQuantity(1)
    setFinish("nonfoil")
    setError(null)
  }, [open])

  useEffect(() => {
    if (finishOptions.length && !finishOptions.includes(finish)) setFinish(finishOptions[0])
  }, [finish, finishOptions])

  function choosePrinting(option: TokenPrintingOption) {
    const match = results.find((result) => result.scryfallId === option.scryfallId) ?? null
    setPrinting(match)
    setBack(null)
    setError(null)
  }

  function close() {
    if (addResult.loading) return
    onOpenChange(false)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!printing) return setError("Pick a token printing.")
    if (quantity < 1) return setError("Quantity must be at least 1")

    void addTokenItem({
      variables: {
        input: { scryfallId: printing.id, backScryfallId: back?.id ?? null, quantity, finish },
      },
      onCompleted: () => {
        showToast(`${pluralize(quantity, "token")} added`)
        onAdded()
        onOpenChange(false)
      },
      onError: (error) => setError(error.message || "Could not add token"),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent
        className="max-h-[calc(100dvh_-_var(--safe-top)_-_var(--safe-bottom)_-_2rem)] max-w-2xl overflow-y-auto sm:max-h-[calc(100dvh_-_var(--safe-top)_-_var(--safe-bottom)_-_4rem)]"
        labelledBy="add-token-dialog-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="add-token-dialog-title">Add token</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Tokens are tracked on their own; they are never allocated or valued.
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-4 p-5" onSubmit={submit}>
          <div className="form-control">
            <label htmlFor="add-token-search" className="label-text mb-1 text-sm font-semibold">
              Token
            </label>
            <SearchField
              id="add-token-search"
              autoFocus
              placeholder="Search token name"
              value={search}
              onValueChange={setSearch}
              disabled={addResult.loading}
            />
            <p className="mt-1 text-xs text-base-content/60">
              {printing
                ? `${printing.card?.name ?? "Token"} · ${printing.setCode?.toUpperCase()} #${printing.collectorNumber}${printing.setName ? ` · ${printing.setName}` : ""}`
                : search.trim().length < MIN_SEARCH_LENGTH
                  ? "Type a token name, then pick the exact printing below."
                  : searchPending
                    ? "Searching tokens..."
                    : results.length === 0
                      ? "No tokens in the catalog match that name."
                      : `${pluralize(results.length, "printing")}, newest first.`}
            </p>
          </div>

          {results.length > 0 ? (
            <TokenPrintingGrid
              className={cn(
                "max-h-72 overflow-y-auto rounded-box border border-base-300 bg-base-200/35 p-3",
                printing && "max-h-44",
              )}
              columnsClassName="grid-cols-3 sm:grid-cols-5"
              options={results}
              selectedScryfallId={printing?.scryfallId}
              onPick={choosePrinting}
            />
          ) : null}

          {printing ? (
            <>
              <BackFacePicker printing={printing} back={back} onPick={setBack} />
              <div className="grid gap-3 sm:grid-cols-2">
                <CollectionQuantityField value={quantity} onChange={setQuantity} />
                <CollectionFinishField
                  options={finishOptions}
                  value={finish}
                  onChange={setFinish}
                />
              </div>
            </>
          ) : null}

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={addResult.loading} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!printing || addResult.loading}>
              <Plus className="h-4 w-4" />
              {addResult.loading ? "Adding..." : "Add token"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BackFacePicker({
  back,
  onPick,
  printing,
}: {
  back: TokenPrintingOption | null
  onPick: (back: TokenPrintingOption | null) => void
  printing: TokenPrinting
}) {
  const { known, sameSet, loading, isEmpty } = useTokenBackOptions(printing.scryfallId)

  if (!loading && isEmpty) return null

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-black uppercase tracking-[0.18em] text-accent">
        Back face
      </legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-base-content/70">
          {back
            ? `${back.card?.name ?? "Token"} is on the back.`
            : "Single-sided. Pick a token below if another one is printed on the back."}
        </p>
        {back ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onPick(null)}>
            Single-sided
          </Button>
        ) : null}
      </div>
      {loading && isEmpty ? (
        <p className="text-sm text-base-content/60">
          Loading {printing.setCode?.toUpperCase()} tokens…
        </p>
      ) : (
        <TokenBackFaceOptions
          className="max-h-56 overflow-y-auto rounded-box border border-base-300 bg-base-200/35 p-3"
          columnsClassName="grid-cols-3 sm:grid-cols-5"
          known={known}
          sameSet={sameSet}
          setCode={printing.setCode ?? ""}
          selectedScryfallId={back?.scryfallId}
          onPick={(option) => onPick(back?.scryfallId === option.scryfallId ? null : option)}
        />
      )}
    </fieldset>
  )
}
