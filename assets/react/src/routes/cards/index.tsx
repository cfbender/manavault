import { createFileRoute } from "@tanstack/react-router"
import { CardsPage } from "../../pages/cards"
import { decodeCollectionFilters, encodeCollectionFilters } from "../../lib/collection-filters"


type CardsSearch = {
  q?: string
  filters?: string
}

export const Route = createFileRoute("/cards/")({
  validateSearch: (search: Record<string, unknown>): CardsSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    filters: encodeCollectionFilters(decodeCollectionFilters(search.filters)),
  }),
  component: CardsRoute,
})

function CardsRoute() {
  const search = Route.useSearch()
  return <CardsPage query={search.q || ""} filterSearch={search.filters} />
}
