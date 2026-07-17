import { createFileRoute } from "@tanstack/react-router"
import { CardsPage } from "../../pages/cards"
import { decodeCollectionFilters, encodeCollectionFilters } from "../../lib/collection-filters"
import { serializeCatalogSort, deserializeCatalogSort } from "../../pages/cards/sort"

type CardsSearch = {
  q?: string
  filters?: string
  sort?: string
}

export const Route = createFileRoute("/cards/")({
  staticData: { title: "Cards" },
  validateSearch: (search: Record<string, unknown>): CardsSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    filters: encodeCollectionFilters(decodeCollectionFilters(search.filters)),
    sort: serializeCatalogSort(deserializeCatalogSort(search.sort)),
  }),
  component: CardsRoute,
})

function CardsRoute() {
  const search = Route.useSearch()
  return (
    <CardsPage
      query={search.q || ""}
      filterSearch={search.filters}
      sort={deserializeCatalogSort(search.sort)}
    />
  )
}
