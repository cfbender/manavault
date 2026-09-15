import { useMutation, useQuery } from "@apollo/client/react"
import { Share2, X } from "lucide-react"
import { type FormEvent, useState } from "react"
import { EmptyState } from "../../components/card-image"
import { CardNameSearchField } from "../../components/card-name-search-field"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/toast"
import { present } from "../../lib/utils"
import {
  CreateTradeWantDocument,
  DeleteTradeWantDocument,
  TradeWantPrintingsDocument,
  TradeWantsDocument,
  UpdateTradeWantDocument,
} from "./documents"
import type { TradeWant } from "./types"
import { WantRow } from "./want-row"
import { WantsShareDialog } from "./wants-share-dialog"

export function WantsTab() {
  const { showToast } = useToast()
  const [search, setSearch] = useState("")
  const [pendingWantIds, setPendingWantIds] = useState<Set<string>>(new Set())
  const [printingPickerEnabled, setPrintingPickerEnabled] = useState(false)
  const [printingPickerCardName, setPrintingPickerCardName] = useState<string | null>(null)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const wantsQuery = useQuery(TradeWantsDocument, { fetchPolicy: "cache-and-network" })
  const wants = wantsQuery.data?.tradeWants ?? []

  function setWantPending(id: string, pending: boolean) {
    setPendingWantIds((current) => {
      const next = new Set(current)
      if (pending) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const [createTradeWant, createState] = useMutation(CreateTradeWantDocument, {
    update(cache, { data }) {
      const created = data?.createTradeWant?.tradeWant
      if (!created) return

      cache.updateQuery({ query: TradeWantsDocument }, (existing) => {
        const others = (existing?.tradeWants ?? []).filter((want) => want.id !== created.id)
        return { tradeWants: [...others, created] }
      })
    },
    onError: (error) => showToast(error.message || "Could not add card to wants", { tone: "info" }),
  })

  const [updateTradeWant] = useMutation(UpdateTradeWantDocument, {
    onError: (error) => showToast(error.message || "Could not update quantity", { tone: "info" }),
  })

  const [deleteTradeWant] = useMutation(DeleteTradeWantDocument, {
    onError: (error) => showToast(error.message || "Could not remove want", { tone: "info" }),
  })

  function closePrintingPicker() {
    setPrintingPickerCardName(null)
    setPrintingPickerEnabled(false)
  }

  function addWant(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return

    setSearch("")
    closePrintingPicker()
    void createTradeWant({ variables: { name: trimmed, quantity: 1 } })
  }

  function addPrintingWant(scryfallId: string) {
    void createTradeWant({ variables: { scryfallId, quantity: 1 } })
      .then(() => {
        setSearch("")
        closePrintingPicker()
      })
      .catch(() => {})
  }

  function pickName(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return

    if (printingPickerEnabled) setPrintingPickerCardName(trimmed)
    else addWant(trimmed)
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    pickName(search)
  }

  function changeQuantity(want: TradeWant, quantity: number) {
    if (quantity < 1) return

    setWantPending(want.id, true)
    // Not inlined: __typename isn't part of the generated mutation result
    // type (Apollo injects it over the wire, codegen omits it), and only a
    // non-literal value skips the excess-property check.
    const optimisticTradeWant = {
      __typename: "UpdateTradeWantPayload" as const,
      tradeWant: { __typename: "TradeWant" as const, id: want.id, quantity },
    }
    void updateTradeWant({
      variables: { id: want.id, quantity },
      optimisticResponse: { updateTradeWant: optimisticTradeWant },
    }).finally(() => setWantPending(want.id, false))
  }

  function removeWant(want: TradeWant) {
    setWantPending(want.id, true)
    const optimisticDeletion = {
      __typename: "DeleteTradeWantPayload" as const,
      deletedId: want.id,
    }
    void deleteTradeWant({
      variables: { id: want.id },
      optimisticResponse: { deleteTradeWant: optimisticDeletion },
      update(cache, { data }) {
        const deletedId = data?.deleteTradeWant?.deletedId
        if (!deletedId) return

        cache.evict({ id: cache.identify({ __typename: "TradeWant", id: deletedId }) })
        cache.gc()
      },
    }).finally(() => setWantPending(want.id, false))
  }

  const isInitialLoading = wantsQuery.loading && !wantsQuery.data

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <form className="max-w-md" onSubmit={submitSearch}>
            <CardNameSearchField
              aria-label="Search for a card to add to your want list"
              disabled={createState.loading}
              placeholder="Search for a card to want"
              recordSubmitAsSearch={false}
              selectFirstSuggestionOnEnter
              value={search}
              onSuggestionSelect={pickName}
              onValueChange={setSearch}
            />
          </form>
          <label className="label cursor-pointer justify-start gap-2 rounded-btn border border-base-300 px-3 py-2">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-primary"
              checked={printingPickerEnabled}
              onChange={(event) => setPrintingPickerEnabled(event.target.checked)}
            />
            <span className="label-text text-sm">Choose printing</span>
          </label>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setIsShareOpen(true)}>
          <Share2 className="h-4 w-4" />
          Share wants
        </Button>
      </div>

      {printingPickerCardName ? (
        <PrintingPicker
          cardName={printingPickerCardName}
          isBusy={createState.loading}
          onAddAnyPrinting={() => addWant(printingPickerCardName)}
          onAddPrinting={addPrintingWant}
          onClose={closePrintingPicker}
        />
      ) : null}

      {wantsQuery.error ? (
        <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          {wantsQuery.error.message || "Could not load your wants"}
        </p>
      ) : isInitialLoading ? (
        <EmptyState title="Loading wants..." />
      ) : wants.length === 0 ? (
        <EmptyState
          title="No wants yet"
          description="Search for a card above to start building your want list for trades."
        />
      ) : (
        <div className="space-y-2">
          {wants.map((want) => (
            <WantRow
              key={want.id}
              isRemoving={pendingWantIds.has(want.id)}
              isUpdating={pendingWantIds.has(want.id)}
              want={want}
              onChangeQuantity={(quantity) => changeQuantity(want, quantity)}
              onRemove={() => removeWant(want)}
            />
          ))}
        </div>
      )}

      <WantsShareDialog open={isShareOpen} onOpenChange={setIsShareOpen} />
    </div>
  )
}

function PrintingPicker({
  cardName,
  isBusy,
  onAddAnyPrinting,
  onAddPrinting,
  onClose,
}: {
  cardName: string
  isBusy: boolean
  onAddAnyPrinting: () => void
  onAddPrinting: (scryfallId: string) => void
  onClose: () => void
}) {
  const { data, error, loading } = useQuery(TradeWantPrintingsDocument, {
    variables: { name: cardName },
    fetchPolicy: "cache-first",
  })
  const matchedCard = (data?.cards?.edges ?? [])
    .map((edge) => edge?.node)
    .filter(present)
    .find((card) => card.name.toLowerCase() === cardName.toLowerCase())
  const printings = (matchedCard?.printings?.edges ?? []).map((edge) => edge?.node).filter(present)

  return (
    <div className="max-w-md space-y-3 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-accent">
            Choose a printing
          </p>
          <p className="truncate text-sm font-bold">{cardName}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cancel printing choice"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        disabled={isBusy}
        onClick={onAddAnyPrinting}
      >
        Add any printing
      </Button>

      {error ? (
        <p className="text-sm text-error">{error.message || "Could not load printings"}</p>
      ) : loading ? (
        <p className="text-sm text-base-content/60">Loading printings...</p>
      ) : printings.length === 0 ? (
        <p className="text-sm text-base-content/60">No printings found for this card.</p>
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {printings.map((printing) => (
            <button
              key={printing.id}
              type="button"
              disabled={isBusy}
              className="flex w-full items-center gap-3 rounded-lg border border-base-300 px-3 py-2 text-left text-sm transition-colors hover:bg-base-200 disabled:opacity-50"
              onClick={() => onAddPrinting(printing.scryfallId)}
            >
              <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-base-200">
                {printing.imageUrl ? (
                  <img
                    src={printing.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <span className="min-w-0 flex-1 truncate">
                {printing.setName || printing.setCode?.toUpperCase()}
              </span>
              <span className="badge badge-sm badge-outline shrink-0">
                {printing.setCode?.toUpperCase()}
                {printing.collectorNumber ? ` #${printing.collectorNumber}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
