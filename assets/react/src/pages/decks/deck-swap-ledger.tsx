import { ArrowRightLeft, Box, Minus, Plus, Search, X } from "lucide-react"
import type { ReactNode } from "react"

import { cn, pluralize } from "../../lib/utils"
import type { DeckCardEntry } from "./deck-types"
import { hasCommander } from "./deck-types"
import {
  releasedCopyCount,
  swapAddKey,
  type DeckSwap,
  type DeckSwapAction,
  type SwapAdd,
  type SwapCut,
} from "./deck-swap-model"
import { SwapLegalityPanel, type SwapLegalityState } from "./deck-swap-legality"

type Dispatch = (action: DeckSwapAction) => void

export type SwapSummary = {
  addQuantity: number
  currentCount: number
  cutQuantity: number
  releasedCopies: number
  resultCount: number
  stagedCount: number
}

function QuantityStepper({
  label,
  max,
  onChange,
  value,
}: {
  label: string
  max?: number
  onChange: (value: number) => void
  value: number
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex h-7 items-center rounded-field border border-base-300 bg-base-100"
    >
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        className="grid h-full w-7 place-items-center text-base-content/60 transition-colors hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onChange(value - 1)}
      >
        <Minus className="h-3 w-3" aria-hidden="true" />
      </button>
      <span className="min-w-6 text-center font-mono text-xs font-black tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        className="grid h-full w-7 place-items-center text-base-content/60 transition-colors hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  )
}

function StagedRow({
  children,
  kind,
  name,
  onRemove,
}: {
  children?: ReactNode
  kind: "cut" | "add"
  name: string
  onRemove: () => void
}) {
  return (
    <li className="group flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-xs font-black",
            kind === "cut" ? "bg-error/15 text-error" : "bg-success/15 text-success",
          )}
        >
          {kind === "cut" ? "−" : "+"}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{name}</span>
        <button
          type="button"
          aria-label={`Unstage ${name}`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-base-content/40 transition-colors hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2 pl-7 text-xs">{children}</div>
      ) : null}
    </li>
  )
}

function CutDestinationToggle({
  cut,
  dispatch,
  name,
}: {
  cut: SwapCut
  dispatch: Dispatch
  name: string
}) {
  const options = [
    { value: "remove", label: "Remove" },
    { value: "considering", label: "To Considering" },
  ] as const

  return (
    <div
      role="radiogroup"
      aria-label={`Where ${name} goes`}
      className="inline-flex h-7 items-center gap-0.5 rounded-full border border-base-300 bg-base-100 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={cut.destination === option.value}
          className={cn(
            "h-6 rounded-full px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            cut.destination === option.value
              ? "bg-base-content text-base-100"
              : "text-base-content/60 hover:text-base-content",
          )}
          onClick={() =>
            dispatch({
              type: "set-cut-destination",
              deckCardId: cut.deckCardId,
              destination: option.value,
            })
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function StagedCut({
  cut,
  deckCard,
  dispatch,
}: {
  cut: SwapCut
  deckCard: DeckCardEntry
  dispatch: Dispatch
}) {
  const name = deckCard.card?.name || "Unknown card"
  const released = releasedCopyCount(deckCard, cut.quantity)

  return (
    <StagedRow
      kind="cut"
      name={name}
      onRemove={() => dispatch({ type: "toggle-cut", deckCardId: cut.deckCardId })}
    >
      {deckCard.quantity > 1 ? (
        <QuantityStepper
          label={`${name} copies to cut`}
          max={deckCard.quantity}
          value={cut.quantity}
          onChange={(quantity) =>
            dispatch({ type: "set-cut-quantity", deckCardId: cut.deckCardId, quantity })
          }
        />
      ) : null}
      <CutDestinationToggle cut={cut} dispatch={dispatch} name={name} />
      {released > 0 ? (
        <span className="text-base-content/60">
          Releases {pluralize(released, "copy", "copies")} to storage
        </span>
      ) : null}
    </StagedRow>
  )
}

function StagedAdd({
  add,
  deckCard,
  dispatch,
}: {
  add: SwapAdd
  deckCard: DeckCardEntry | undefined
  dispatch: Dispatch
}) {
  const key = swapAddKey(add)
  const name = add.source === "search" ? add.name : deckCard?.card?.name || "Unknown card"
  const max = add.source === "considering" ? deckCard?.quantity : undefined
  const SourceIcon = add.source === "considering" ? Box : Search

  return (
    <StagedRow kind="add" name={name} onRemove={() => dispatch({ type: "remove-add", key })}>
      {add.source === "search" || (max ?? 1) > 1 ? (
        <QuantityStepper
          label={`${name} copies to add`}
          max={max}
          value={add.quantity}
          onChange={(quantity) => dispatch({ type: "set-add-quantity", key, quantity })}
        />
      ) : null}
      <span className="inline-flex items-center gap-1 text-base-content/60">
        <SourceIcon className="h-3 w-3" aria-hidden="true" />
        {add.source === "considering" ? "From Considering" : "New card"}
      </span>
    </StagedRow>
  )
}

function CountMeter({ format, summary }: { format: string; summary: SwapSummary }) {
  const target = hasCommander(format) ? 100 : null
  const offTarget = target !== null && summary.resultCount !== target

  return (
    <div className="grid grid-cols-3 divide-x divide-base-300 border-b border-base-300">
      <div className="px-3 py-3">
        <div className="text-[0.6875rem] font-black uppercase tracking-[0.16em] text-base-content/50">
          Out
        </div>
        <div
          className={cn(
            "font-mono text-2xl font-black tabular-nums",
            summary.cutQuantity ? "text-error" : "text-base-content/30",
          )}
        >
          −{summary.cutQuantity}
        </div>
      </div>
      <div className="px-3 py-3">
        <div className="text-[0.6875rem] font-black uppercase tracking-[0.16em] text-base-content/50">
          In
        </div>
        <div
          className={cn(
            "font-mono text-2xl font-black tabular-nums",
            summary.addQuantity ? "text-success" : "text-base-content/30",
          )}
        >
          +{summary.addQuantity}
        </div>
      </div>
      <div className="px-3 py-3">
        <div className="text-[0.6875rem] font-black uppercase tracking-[0.16em] text-base-content/50">
          Deck
        </div>
        <div
          className={cn(
            "font-mono text-2xl font-black tabular-nums",
            offTarget ? "text-warning" : "text-base-content",
          )}
          aria-label={
            target
              ? `${summary.resultCount} of ${target} cards after swap`
              : `${summary.resultCount} cards after swap`
          }
        >
          {summary.resultCount}
          {target ? (
            <span className="text-sm font-bold text-base-content/45">/{target}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function DeckSwapLedger({
  deckCardsById,
  dispatch,
  format,
  legality,
  swap,
  summary,
}: {
  deckCardsById: Map<string, DeckCardEntry>
  dispatch: Dispatch
  format: string
  legality: SwapLegalityState
  swap: DeckSwap
  summary: SwapSummary
}) {
  const stagedCuts = swap.cuts.flatMap((cut) => {
    const deckCard = deckCardsById.get(cut.deckCardId)
    return deckCard ? [{ cut, deckCard }] : []
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CountMeter format={format} summary={summary} />
      <SwapLegalityPanel legality={legality} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {summary.stagedCount === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <ArrowRightLeft className="h-6 w-6 text-base-content/30" aria-hidden="true" />
            <p className="text-sm font-bold">Nothing staged yet</p>
            <p className="max-w-60 text-xs text-base-content/60">
              Pick cards to cut and cards to bring in. The deck stays untouched until you apply.
            </p>
          </div>
        ) : (
          <>
            {stagedCuts.length ? (
              <section aria-label="Staged cuts">
                <h3 className="px-3 pt-3 text-[0.6875rem] font-black uppercase tracking-[0.16em] text-error/80">
                  Cutting
                </h3>
                <ul className="divide-y divide-base-300/70">
                  {stagedCuts.map(({ cut, deckCard }) => (
                    <StagedCut
                      key={cut.deckCardId}
                      cut={cut}
                      deckCard={deckCard}
                      dispatch={dispatch}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
            {swap.adds.length ? (
              <section aria-label="Staged adds">
                <h3 className="px-3 pt-3 text-[0.6875rem] font-black uppercase tracking-[0.16em] text-success/90">
                  Adding
                </h3>
                <ul className="divide-y divide-base-300/70">
                  {swap.adds.map((add) => (
                    <StagedAdd
                      key={swapAddKey(add)}
                      add={add}
                      deckCard={
                        add.source === "considering" ? deckCardsById.get(add.deckCardId) : undefined
                      }
                      dispatch={dispatch}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
