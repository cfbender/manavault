import { useQuery } from "@apollo/client/react"
import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useMemo } from "react"
import { EmptyState } from "../../components/card-image"
import { usePageTitle } from "../../lib/page-title"
import { ManaVaultDeckPlaytester } from "./deck-playtester"
import { flattenDeck } from "./deck-types"
import { DeckDocument } from "./deck-detail-documents"

export function DeckPlaytestPage({ id }: { id: string }) {
  const { data, loading: isLoading } = useQuery(DeckDocument, {
    variables: { id },
  })
  const deck = useMemo(() => flattenDeck(data?.deck), [data?.deck])
  const deckCards = useMemo(() => deck?.deckCards || [], [deck?.deckCards])
  usePageTitle(deck?.name ? `${deck.name} Playtest` : isLoading ? "Playtest" : "Deck not found")

  if (isLoading) return <EmptyState title="Loading playtest..." />
  if (!deck) return <EmptyState title="Deck not found" />

  return (
    <ManaVaultDeckPlaytester
      closeSlot={
        <Link
          to="/decks/$id"
          params={{ id: deck.id }}
          className="btn btn-ghost btn-sm btn-square shrink-0"
          aria-label="Back to deck"
          title="Back to deck"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
      }
      deckCards={deckCards}
      deckId={deck.id}
      deckName={deck.name}
    />
  )
}
