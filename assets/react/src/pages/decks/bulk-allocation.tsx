import { useEffect, useRef, useState } from "react"
import { Sparkles } from "lucide-react"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import {
  deckPullListSelectionError,
  groupDeckPullListEntriesByLocation,
  selectedDeckPullListEntries,
  type DeckPullList,
  type DeckPullListChoice,
  type DeckPullListEntry,
  type DeckPullListMode,
} from "./deck-allocation-model"
import {
  collectionItemPrintingLabel,
  deckCardPrintingLabel,
  finishLabel,
  isFoilFinish,
} from "./printing-labels"

type AllocationCandidate = DeckPullListEntry["candidate"]

export function BulkAllocationMenu({
  disabled,
  onOpen,
}: {
  disabled: boolean
  onOpen: () => void
}) {
  return (
    <Button type="button" size="sm" disabled={disabled} onClick={onOpen}>
      <Sparkles className="h-4 w-4" />
      Allocation
    </Button>
  )
}

export function BulkAllocationPullListDialog({
  error,
  isPending,
  mode,
  onClose,
  onConfirm,
  onModeChange,
  onSelectChoice,
  open,
  pullList,
  selectedItemIds,
}: {
  error: string | null
  isPending: boolean
  mode: DeckPullListMode
  onClose: () => void
  onConfirm: () => void
  onModeChange: (mode: DeckPullListMode) => void
  onSelectChoice: (choiceId: string, itemId: string | null) => void
  open: boolean
  pullList: DeckPullList
  selectedItemIds: Record<string, string | null>
}) {
  const selectedEntries = selectedDeckPullListEntries(pullList)
  const skippedDeckCards = pullList.skippedDeckCards
  const locationGroups = groupDeckPullListEntriesByLocation(selectedEntries)
  const choicesById = new Map(
    pullList.choices.map((choice): [string, DeckPullListChoice] => [choice.id, choice]),
  )
  const unresolvedChoices = pullList.choices.filter(
    (choice) =>
      choice.candidates.length > 0 && selectedChoiceValue(choice, selectedItemIds) === null,
  )
  const selectionError = deckPullListSelectionError(pullList)
  const disableConfirm = isPending || selectedEntries.length === 0 || Boolean(selectionError)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl" labelledBy="bulk-allocation-title">
        <DialogHeader>
          <div>
            <DialogTitle id="bulk-allocation-title">Pull cards from collection</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Use this list to grab the physical collection copies and locations before allocating
              them to this deck.
            </p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="max-h-[min(68vh,42rem)] space-y-5 overflow-y-auto p-5">
          <div className="rounded-box border border-base-300 bg-base-100/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-base-content/60">
                  Printing match
                </p>
                <p className="mt-1 text-sm text-base-content/70">
                  {mode === "exact"
                    ? "Only select collection copies with the requested printing."
                    : "Prefer exact printings, then allow alternate collection copies."}
                </p>
              </div>
              <div className="join" role="group" aria-label="Printing match">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "exact" ? "default" : "outline"}
                  className="join-item"
                  aria-pressed={mode === "exact"}
                  onClick={() => {
                    if (mode !== "exact") onModeChange("exact")
                  }}
                >
                  Exact printing
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "any" ? "default" : "outline"}
                  className="join-item"
                  aria-pressed={mode === "any"}
                  onClick={() => {
                    if (mode !== "any") onModeChange("any")
                  }}
                >
                  Any printing
                </Button>
              </div>
            </div>
          </div>

          {locationGroups.length ? (
            <div className="space-y-4">
              {locationGroups.map((group) => (
                <LocationGroup
                  key={group.locationId}
                  group={group}
                  choicesById={choicesById}
                  onSelectChoice={onSelectChoice}
                  selectedItemIds={selectedItemIds}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4 text-sm text-base-content/70">
              {pullList.needed === 0
                ? "No eligible mainboard cards need collection copies."
                : "No collection copies are currently selected for allocation."}
            </p>
          )}

          {unresolvedChoices.length ? (
            <details
              open
              className="rounded-box border border-warning/30 bg-warning/5"
              aria-labelledby="bulk-allocation-unresolved-title"
            >
              <summary className="cursor-pointer px-4 py-3 marker:text-base-content/60">
                <div className="inline-flex w-[calc(100%-1.5rem)] flex-wrap items-start justify-between gap-3 align-top">
                  <div>
                    <h3
                      id="bulk-allocation-unresolved-title"
                      className="font-black tracking-normal"
                    >
                      Choose alternate copies
                    </h3>
                    <p className="text-xs text-base-content/60">
                      Pick the physical collection copy and source location to grab for each
                      alternate printing.
                    </p>
                  </div>
                  <span className="badge badge-outline shrink-0">
                    {unresolvedChoices.length} {unresolvedChoices.length === 1 ? "copy" : "copies"}
                  </span>
                </div>
              </summary>
              <ul className="divide-y divide-warning/20 border-t border-warning/20">
                {unresolvedChoices.map((choice) => (
                  <li key={choice.id} className="space-y-3 px-4 py-3">
                    <CardSummary deckCard={choice.deckCard} quantity={1} />
                    <ChoiceSelect
                      choice={choice}
                      value={selectedChoiceValue(choice, selectedItemIds)}
                      onSelectChoice={onSelectChoice}
                    />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {skippedDeckCards.length ? (
            <details
              className="rounded-box border border-base-300 bg-base-100/70"
              aria-labelledby="bulk-allocation-skipped-title"
            >
              <summary className="cursor-pointer px-4 py-3 marker:text-base-content/60">
                <div className="inline-flex w-[calc(100%-1.5rem)] flex-wrap items-start justify-between gap-3 align-top">
                  <div>
                    <h3 id="bulk-allocation-skipped-title" className="font-black tracking-normal">
                      Cards not in this pull list
                    </h3>
                    <p className="text-xs text-base-content/60">
                      Already allocated, basic lands, or cards without a selectable collection copy.
                    </p>
                  </div>
                  <span className="badge badge-outline shrink-0">
                    {skippedDeckCards.length} {skippedDeckCards.length === 1 ? "card" : "cards"}
                  </span>
                </div>
              </summary>
              <ul className="divide-y divide-base-300 border-t border-base-300">
                {skippedDeckCards.map((deckCard) => (
                  <li key={deckCard.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <CardNamePreview deckCard={deckCard} />
                      <span className="text-sm text-base-content/70">
                        Qty{" "}
                        {Math.max(
                          deckCard.allocationStatus.required - deckCard.allocationStatus.allocated,
                          0,
                        )}
                      </span>
                    </div>
                    <p className="text-sm text-base-content/60">
                      {skippedDeckCardReason(deckCard)}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {selectionError ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {selectionError}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={disableConfirm} onClick={onConfirm}>
              {isPending ? "Allocating..." : "Allocate selected"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LocationGroup({
  choicesById,
  group,
  onSelectChoice,
  selectedItemIds,
}: {
  choicesById: Map<string, DeckPullListChoice>
  group: ReturnType<typeof groupDeckPullListEntriesByLocation>[number]
  onSelectChoice: (choiceId: string, itemId: string | null) => void
  selectedItemIds: Record<string, string | null>
}) {
  const copyCount = group.entries.reduce((total, entry) => total + entry.quantity, 0)

  return (
    <details
      open
      className="rounded-box border border-base-300 bg-base-100/70"
      aria-labelledby={`bulk-allocation-location-${group.locationId}`}
    >
      <summary className="cursor-pointer px-4 py-3 marker:text-base-content/60">
        <div className="inline-flex w-[calc(100%-1.5rem)] flex-wrap items-start justify-between gap-3 align-top">
          <div>
            <h3
              id={`bulk-allocation-location-${group.locationId}`}
              className="font-black tracking-normal"
            >
              Grab from {group.locationName}
            </h3>
            <p className="text-xs text-base-content/60">Physical copies filed here</p>
          </div>
          <span className="badge badge-outline shrink-0">
            {copyCount} {copyCount === 1 ? "copy" : "copies"}
          </span>
        </div>
      </summary>
      <ul className="divide-y divide-base-300 border-t border-base-300">
        {group.entries.map((entry) => {
          const choice = entry.choiceId ? choicesById.get(entry.choiceId) : undefined

          return (
            <li key={entry.id} className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <CardSummary deckCard={entry.deckCard} quantity={entry.quantity} />
                <div className="flex flex-wrap items-center gap-2">
                  <FinishBadge finish={entry.candidate.item.finish} />
                  <Badge tone={entry.exact ? "success" : "warning"}>
                    {entry.exact ? "Exact" : "Alternate"}
                  </Badge>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)]">
                <div className="min-w-0 space-y-1">
                  <p
                    className="truncate font-semibold"
                    title={collectionItemPrintingLabel(entry.candidate.item)}
                  >
                    Collection copy: {collectionItemPrintingLabel(entry.candidate.item)}
                  </p>
                  <p className="text-sm text-base-content/70">
                    {finishLabel(entry.candidate.item.finish || "nonfoil")} finish · Located in{" "}
                    {sourceLocationName(entry.candidate)} · {entry.candidate.available} free
                  </p>
                </div>
                {choice ? (
                  <ChoiceSelect
                    choice={choice}
                    value={selectedChoiceValue(choice, selectedItemIds)}
                    onSelectChoice={onSelectChoice}
                  />
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function CardSummary({
  deckCard,
  quantity,
}: {
  deckCard: DeckPullListEntry["deckCard"]
  quantity: number
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <CardNamePreview deckCard={deckCard} />
        <span className="text-sm text-base-content/70">Qty {quantity}</span>
      </div>
      <p className="text-sm text-base-content/60">
        Deck card: {deckCardPrintingLabel(deckCard)} · {finishLabel(deckCard.finish || "nonfoil")}
      </p>
    </div>
  )
}

function ChoiceSelect({
  choice,
  onSelectChoice,
  value,
}: {
  choice: DeckPullListChoice
  onSelectChoice: (choiceId: string, itemId: string | null) => void
  value: string | null
}) {
  return (
    <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-base-content/60">
      <span>Collection copy</span>
      <select
        className="select select-bordered select-sm w-full normal-case text-base-content"
        value={value ?? ""}
        onChange={(event) => onSelectChoice(choice.id, event.target.value || null)}
      >
        <option value="">Choose a copy...</option>
        {choice.candidates.map((candidate) => (
          <option key={candidate.item.id} value={candidate.item.id}>
            {candidateOptionLabel(candidate)}
          </option>
        ))}
      </select>
    </label>
  )
}

type PreviewPosition = {
  left: number
  top: number
}

function CardNamePreview({ deckCard }: { deckCard: DeckPullListEntry["deckCard"] }) {
  const triggerRef = useRef<HTMLAnchorElement>(null)
  const hideTimeoutRef = useRef<number | null>(null)
  const [position, setPosition] = useState<PreviewPosition | null>(null)
  const cardName = deckCardName(deckCard)
  const cardHref = deckCard.card?.id ? `/cards/${encodeURIComponent(deckCard.card.id)}` : null
  const imageUrl =
    deckCard.preferredPrinting?.imageUrl || deckCard.fallbackPrinting?.imageUrl || null

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current === null) return

      window.clearTimeout(hideTimeoutRef.current)
    }
  }, [])

  if (!cardHref) {
    return <span className="font-bold">{cardName}</span>
  }

  if (!imageUrl) {
    return (
      <a
        href={cardHref}
        target="_blank"
        rel="noreferrer"
        className="font-bold text-accent underline decoration-accent/40 decoration-dotted underline-offset-4 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
      >
        {cardName}
      </a>
    )
  }

  function clearHidePreview() {
    if (hideTimeoutRef.current === null) return

    window.clearTimeout(hideTimeoutRef.current)
    hideTimeoutRef.current = null
  }

  function hidePreviewSoon() {
    clearHidePreview()
    hideTimeoutRef.current = window.setTimeout(() => {
      setPosition(null)
      hideTimeoutRef.current = null
    }, 120)
  }

  function showPreview() {
    clearHidePreview()
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return

    const previewWidth = 176
    setPosition({
      left: Math.min(Math.max(rect.left, 12), window.innerWidth - previewWidth - 12),
      top: rect.top - 6,
    })
  }

  return (
    <span className="relative inline-block">
      <a
        ref={triggerRef}
        href={cardHref}
        target="_blank"
        rel="noreferrer"
        className="cursor-pointer font-bold text-accent underline decoration-accent/40 decoration-dotted underline-offset-4 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
        onBlur={hidePreviewSoon}
        onFocus={showPreview}
        onPointerEnter={showPreview}
        onPointerLeave={hidePreviewSoon}
      >
        {cardName}
      </a>
      {position ? (
        <a
          href={cardHref}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${cardName} card details in a new tab`}
          className="fixed z-[9999] block w-44 -translate-y-full rounded-xl border border-base-300 bg-base-100 p-2 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          style={{ left: position.left, top: position.top }}
          onBlur={hidePreviewSoon}
          onFocus={showPreview}
          onPointerEnter={showPreview}
          onPointerLeave={hidePreviewSoon}
        >
          <img
            src={imageUrl}
            alt={cardName}
            className="aspect-[5/7] w-full rounded-lg object-cover"
          />
        </a>
      ) : null}
    </span>
  )
}

function FinishBadge({ finish }: { finish?: string | null }) {
  const label = finishLabel(finish || "nonfoil")
  const isFoil = isFoilFinish(finish)

  return (
    <span
      title={`${label} finish`}
      className={
        isFoil
          ? "badge badge-sm border-accent/40 bg-accent/15 text-accent"
          : "badge badge-sm badge-outline text-base-content/70"
      }
    >
      {label}
    </span>
  )
}

function selectedChoiceValue(
  choice: DeckPullListChoice,
  selectedItemIds: Record<string, string | null>,
) {
  if (Object.prototype.hasOwnProperty.call(selectedItemIds, choice.id)) {
    const selectedItemId = selectedItemIds[choice.id]

    if (selectedItemId == null) return null

    return choice.candidates.some((candidate) => candidate.item.id === selectedItemId)
      ? selectedItemId
      : choice.selectedItemId
  }

  return choice.selectedItemId
}

function candidateOptionLabel(candidate: AllocationCandidate) {
  return [
    collectionItemPrintingLabel(candidate.item),
    sourceLocationName(candidate),
    finishLabel(candidate.item.finish || "nonfoil"),
    `${candidate.available} free`,
  ].join(" · ")
}

function sourceLocationName(candidate: AllocationCandidate) {
  return candidate.item.location?.name || "Unfiled"
}

function deckCardName(deckCard: DeckPullListEntry["deckCard"]) {
  return deckCard.card?.name || "Unknown card"
}

function skippedDeckCardReason(deckCard: DeckPullListEntry["deckCard"]) {
  const status = deckCard.allocationStatus

  if (status.state === "basic_land") return "Basic lands do not need collection allocation."
  if (status.allocated >= status.required) return "Already fully allocated."
  if (status.candidates.length === 0) return "No matching collection copies are available."

  return "No selectable collection copy was chosen."
}
