import { createFileRoute } from "@tanstack/react-router"
import { CardDetailPage } from "../../pages/cards"

type CardSearch = {
  q?: string
}

export const Route = createFileRoute("/cards/$id")({
  validateSearch: (search: Record<string, unknown>): CardSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: CardRoute,
})

function CardRoute() {
  const { id } = Route.useParams()
  const search = Route.useSearch()
  return <CardDetailPage id={id} query={search.q || ""} />
}
