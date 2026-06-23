import { createFileRoute } from "@tanstack/react-router"
import { CardDetailPage } from "../../pages/cards"
import { decodeCollectionFilters, encodeCollectionFilters } from "../../lib/collection-filters"


type CardSearch = {
  q?: string
  filters?: string
}

export const Route = createFileRoute("/cards/$id")({
  validateSearch: (search: Record<string, unknown>): CardSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    filters: encodeCollectionFilters(decodeCollectionFilters(search.filters)),
  }),
  component: CardRoute,
})

function CardRoute() {
  const { id } = Route.useParams()
  const search = Route.useSearch()
  return <CardDetailPage id={id} query={search.q || ""} filterSearch={search.filters} />
}
