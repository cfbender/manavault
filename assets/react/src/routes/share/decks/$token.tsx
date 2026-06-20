import { createFileRoute } from "@tanstack/react-router"
import { DeckDetailPage } from "../../../pages/decks"

export const Route = createFileRoute("/share/decks/$token")({
  component: SharedDeckRoute,
})

function SharedDeckRoute() {
  const { token } = Route.useParams()
  return <DeckDetailPage id={token} shareMode />
}
