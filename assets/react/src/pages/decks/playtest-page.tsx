import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { EmptyState } from "../../components/card-image"
import { DeckPlaytester } from "../../components/deck-playtester"
import { createPlaytestState } from "../../lib/deck-playtest"
import { request } from "../../lib/graphql"
import { deckPlaytestCards } from "./deck-card-model"
import { flattenDeck } from "./deck-types"
import { DeckDocument } from "./queries"

export function DeckPlaytestPage({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["deck", id],
    queryFn: () => request(DeckDocument, { id }),
  })
  const deck = useMemo(() => flattenDeck(data?.deck), [data?.deck])
  const deckCards = useMemo(() => deck?.deckCards || [], [deck?.deckCards])
  const playtestCards = useMemo(() => deckPlaytestCards(deckCards), [deckCards])
  const initialState = useMemo(
    () => createPlaytestState(playtestCards.library, playtestCards.command),
    [playtestCards],
  )

  if (isLoading) return <EmptyState title="Loading playtest..." />
  if (!deck) return <EmptyState title="Deck not found" />

  return <DeckPlaytester deckId={deck.id} deckName={deck.name} initialState={initialState} />
}
