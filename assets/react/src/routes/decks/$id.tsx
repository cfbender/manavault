import { createFileRoute } from "@tanstack/react-router"
import { DeckDetailPage } from "../../pages/decks"

export const Route = createFileRoute("/decks/$id")({
  component: DeckRoute,
})

function DeckRoute() {
  const { id } = Route.useParams()
  return <DeckDetailPage id={id} />
}
