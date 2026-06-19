import { createFileRoute } from "@tanstack/react-router"
import { CardsPage } from "../../pages/cards"

type CardsSearch = {
  q?: string
}

export const Route = createFileRoute("/cards/")({
  validateSearch: (search: Record<string, unknown>): CardsSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: CardsRoute,
})

function CardsRoute() {
  const search = Route.useSearch()
  return <CardsPage query={search.q || ""} />
}
