import { type ReactNode } from "react"
import { ColorIdentitySymbols } from "../../components/ui/mana-symbols"
import { present } from "../../lib/utils"
import { colorOrder } from "./deck-card-model"
import type { DeckSummary } from "./deck-types"
import { DECK_FORMATS } from "./deck-types"

export function groupDecksByFormat(decks: DeckSummary[]) {
  const grouped = new Map<string, DeckSummary[]>()
  for (const deck of decks) {
    const group = grouped.get(deck.format) || []
    group.push(deck)
    grouped.set(deck.format, group)
  }

  return [...grouped.entries()].sort(
    ([left], [right]) =>
      formatSortValue(left) - formatSortValue(right) || left.localeCompare(right),
  )
}

export function formatSortValue(format: string) {
  const index = DECK_FORMATS.indexOf(format as (typeof DECK_FORMATS)[number])
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

export function DeckNameWithCommanderIdentity({
  colors,
  name,
}: {
  colors?: Array<string | null> | null
  name: ReactNode
}) {
  const displayColors = colors?.filter(present) || []

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
      <span className="min-w-0">{name}</span>
      {displayColors.length ? (
        <ColorIdentitySymbols colors={displayColors} className="text-[0.82em]" />
      ) : null}
    </span>
  )
}

export function commanderColorIdentity(
  deckCards:
    | Array<{
        card?: { colorIdentity?: Array<string | null> | null } | null
        zone?: string | null
      } | null>
    | null
    | undefined,
) {
  const commanders = (deckCards || []).filter(
    (deckCard) => deckCard?.zone === "commander" && deckCard.card,
  )

  if (!commanders.length) return null

  const colors = new Set<string>()

  for (const commander of commanders) {
    for (const color of commander?.card?.colorIdentity || []) {
      if (color) colors.add(color.toUpperCase())
    }
  }

  return colors.size
    ? Array.from(colors).sort((left, right) => colorOrder(left) - colorOrder(right))
    : ["C"]
}
