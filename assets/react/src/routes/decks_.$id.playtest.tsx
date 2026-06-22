import { createFileRoute } from "@tanstack/react-router"
import { DeckPlaytestPage } from "../pages/decks"

export const Route = createFileRoute("/decks_/$id/playtest")({
  component: DeckPlaytestRoute,
})

function DeckPlaytestRoute() {
  const { id } = Route.useParams()
  return <DeckPlaytestPage id={id} />
}
