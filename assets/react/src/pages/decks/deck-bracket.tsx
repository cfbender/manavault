import { Badge } from "../../components/ui/badge"

type BracketDeck = {
  commanderBracket?: number | null
  commanderBracketEstimate?: number | null
}

function commanderBracketLabel(deck: BracketDeck) {
  const official = deck.commanderBracket
  const practical = deck.commanderBracketEstimate

  if (!official || official < 1 || official > 5) return null
  if (practical && practical >= 1 && practical <= 5 && practical !== official) {
    return `Bracket ${official} · Pace ${practical}`
  }

  return `Bracket ${official}`
}

export function DeckBracketBadge({ deck }: { deck: BracketDeck }) {
  const label = commanderBracketLabel(deck)
  if (!label) return null

  const practicalLabel =
    deck.commanderBracketEstimate && deck.commanderBracketEstimate !== deck.commanderBracket
      ? `Official Bracket ${deck.commanderBracket}; estimated to play like Bracket ${deck.commanderBracketEstimate}`
      : undefined

  return (
    <Badge
      tone="warning"
      className="h-auto min-h-5 whitespace-normal py-0.5 leading-tight"
      aria-label={practicalLabel}
      title={practicalLabel}
    >
      {label}
    </Badge>
  )
}
