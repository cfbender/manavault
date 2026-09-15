import { useQuery } from "@apollo/client/react"
import { ExternalLink, Infinity as InfinityIcon, RotateCw } from "lucide-react"

import { CardImage, EmptyState } from "../../components/card-image"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import type { DeckCombosQuery } from "../../gql/graphql"
import { ManaText } from "../cards/card-text"
import { DeckCombosDocument } from "./queries"

type Combo = DeckCombosQuery["deckCombos"][number]
type ComboDeck = { id: string; name: string }

export function DeckCombosDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: ComboDeck | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const comboQuery = useQuery(DeckCombosDocument, {
    variables: { id: deck?.id || "" },
    skip: !open || !deck?.id,
    fetchPolicy: "network-only",
  })
  const combos = comboQuery.data?.deckCombos || []
  const isLoading = comboQuery.loading && !comboQuery.data

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl" labelledBy="deck-combos-title">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle id="deck-combos-title" className="flex items-center gap-2">
              <InfinityIcon aria-hidden="true" className="h-5 w-5 text-primary" />
              Infinite combos
            </DialogTitle>
            <p className="mt-1 truncate text-sm text-base-content/60">{deck?.name}</p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {isLoading ? <ComboLoadingState /> : null}

          {comboQuery.error ? (
            <div
              className="rounded-box border border-error/30 bg-error/10 p-4 text-sm text-error"
              role="alert"
            >
              <p className="font-bold">Commander Spellbook could not check this deck.</p>
              <p className="mt-1 text-error/85">Try the request again in a moment.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void comboQuery.refetch()}
              >
                <RotateCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : null}

          {!isLoading && !comboQuery.error && combos.length === 0 ? (
            <EmptyState
              title="No infinite combos found"
              description="Commander Spellbook did not find a complete combo among this deck's commander and mainboard cards."
              action={<CommanderSpellbookLink />}
            />
          ) : null}

          {combos.length > 0 ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-4">
                <p className="text-sm text-base-content/70">
                  <span className="font-mono font-black tabular-nums text-base-content">
                    {combos.length}
                  </span>{" "}
                  {combos.length === 1 ? "combo" : "combos"} found in the current decklist
                </p>
                <CommanderSpellbookLink />
              </div>
              <div className="divide-y divide-base-300">
                {combos.map((combo) => (
                  <ComboResult key={combo.id} combo={combo} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ComboLoadingState() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Checking Commander Spellbook"
      role="status"
    >
      <p className="text-sm font-bold text-base-content/70">Checking the current decklist…</p>
      {[0, 1].map((index) => (
        <div key={index} className="space-y-3 border-t border-base-300 pt-5 first:border-t-0">
          <div className="flex gap-3">
            <div className="h-20 w-14 animate-pulse rounded-box bg-base-200" />
            <div className="h-20 w-14 animate-pulse rounded-box bg-base-200" />
          </div>
          <div className="h-5 w-64 max-w-full animate-pulse rounded bg-base-200" />
          <div className="h-4 w-full animate-pulse rounded bg-base-200" />
        </div>
      ))}
    </div>
  )
}

function ComboResult({ combo }: { combo: Combo }) {
  const steps = combo.description
    .split(/\r?\n/u)
    .map((step) => step.trim())
    .filter(Boolean)

  return (
    <article className="py-5 first:pt-4 last:pb-0">
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <ul className="flex flex-wrap gap-3" aria-label="Combo cards">
            {combo.cards.map((card, index) => (
              <li key={`${combo.id}-${card.name}-${index}`} className="flex items-center gap-3">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-lg font-black text-base-content/35">
                    +
                  </span>
                ) : null}
                <div className="flex items-center gap-2">
                  <CardImage
                    printing={{ imageUrl: card.imageUrl, card: { name: card.name } }}
                    className="h-20 w-14 shrink-0 rounded-box"
                  />
                  <span className="max-w-36 text-sm font-bold leading-snug">
                    {card.quantity > 1 ? `${card.quantity}× ` : ""}
                    {card.name}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div>
            <h3 className="text-xs font-bold uppercase text-base-content/55">Produces</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {combo.produces.map((result) => (
                <Badge key={result} tone="success">
                  {result}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-black">How it works</h3>
            <Button asChild variant="outline" size="sm">
              <a href={combo.url} target="_blank" rel="noreferrer">
                Open combo
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>

          {steps.length ? (
            <ol className="space-y-2 text-sm leading-6 text-base-content/80">
              {steps.map((step, index) => (
                <li key={`${combo.id}-step-${index}`} className="flex items-baseline gap-3">
                  <span className="w-5 shrink-0 text-right font-mono text-xs font-black leading-6 tabular-nums text-primary">
                    {index + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : null}

          {combo.manaNeeded || combo.prerequisites.length > 0 || combo.notes ? (
            <dl className="grid gap-3 border-t border-base-300 pt-4 text-sm sm:grid-cols-2">
              {combo.manaNeeded ? (
                <div>
                  <dt className="font-bold text-base-content/60">Mana needed</dt>
                  <dd className="mt-1 font-medium">
                    <ManaText text={combo.manaNeeded} />
                  </dd>
                </div>
              ) : null}
              {combo.prerequisites.length > 0 ? (
                <div className={combo.manaNeeded ? undefined : "sm:col-span-2"}>
                  <dt className="font-bold text-base-content/60">Prerequisites</dt>
                  <dd className="mt-1">
                    <ul className="space-y-1">
                      {combo.prerequisites.map((prerequisite) => (
                        <li key={prerequisite}>• {prerequisite}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
              {combo.notes ? (
                <div className="sm:col-span-2">
                  <dt className="font-bold text-base-content/60">Notes</dt>
                  <dd className="mt-1 text-base-content/75">{combo.notes}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function CommanderSpellbookLink() {
  return (
    <a
      href="https://commanderspellbook.com/"
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
    >
      Commander Spellbook
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  )
}
