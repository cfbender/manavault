import { Badge } from "../../components/ui/badge"
import type { DeckBoxFieldsFragment } from "../../gql/graphql"
import { compactNumber, titleize } from "../../lib/utils"
import { DeckBox } from "./deck-box"

export function DeckDetailLoadingState({ deck }: { deck?: DeckBoxFieldsFragment | null }) {
  return (
    <div className="space-y-7">
      <div className="h-8 w-32 animate-pulse rounded-btn bg-base-300" />
      {deck ? (
        // The deck the gallery already loaded: its box stands in place, so the
        // gallery's box carries straight into the page.
        <div className="items-center gap-6 md:grid md:grid-cols-[minmax(0,30rem)_1fr]">
          <DeckBox deck={deck} className="w-full" />
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{titleize(deck.format)}</Badge>
              <span className="font-mono text-sm font-bold text-base-content/70">
                {compactNumber(deck.cardCount || 0)} cards
              </span>
            </div>
            <h1 className="line-clamp-2 min-w-0 text-4xl font-black tracking-normal sm:text-5xl">
              {deck.name}
            </h1>
            <div className="h-5 w-56 animate-pulse rounded-full bg-base-300" />
          </div>
        </div>
      ) : (
        <section className="min-h-52 rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
          <div className="flex h-full flex-col justify-between gap-8">
            <div className="flex gap-2">
              <div className="h-6 w-24 animate-pulse rounded-full bg-base-300" />
              <div className="h-6 w-20 animate-pulse rounded-full bg-base-300" />
            </div>
            <div className="space-y-3">
              <div className="h-8 max-w-lg animate-pulse rounded-btn bg-base-300" />
              <div className="h-4 max-w-sm animate-pulse rounded-btn bg-base-300" />
            </div>
          </div>
        </section>
      )}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="aspect-[5/7] animate-pulse rounded-xl bg-base-300" />
        ))}
      </div>
    </div>
  )
}
