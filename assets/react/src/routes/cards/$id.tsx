import { createFileRoute } from "@tanstack/react-router"
import { CardDetailPage } from "../../pages/cards"
import { decodeCollectionFilters, encodeCollectionFilters } from "../../lib/collection-filters"


type CardReturnEdhrecTab = "recs" | "cuts" | "commander"

type CardSearch = {
  q?: string
  filters?: string
  deckId?: string
  edhrec?: CardReturnEdhrecTab
  edhrecExcludeLands?: boolean
  returnCollection?: boolean
  returnLocationId?: string
}

const EDHREC_TABS: CardReturnEdhrecTab[] = ["recs", "cuts", "commander"]

export const Route = createFileRoute("/cards/$id")({
  validateSearch: (search: Record<string, unknown>): CardSearch => {
    const returnLocationId =
      typeof search.returnLocationId === "string" && !search.returnLocationId.includes("/")
        ? search.returnLocationId.trim()
        : ""

    return {
      q: typeof search.q === "string" ? search.q : undefined,
      filters: encodeCollectionFilters(decodeCollectionFilters(search.filters)),
      deckId: typeof search.deckId === "string" ? search.deckId : undefined,
      edhrec:
        typeof search.edhrec === "string" && EDHREC_TABS.includes(search.edhrec as CardReturnEdhrecTab)
          ? (search.edhrec as CardReturnEdhrecTab)
          : undefined,
      edhrecExcludeLands:
        search.edhrecExcludeLands === true ||
        search.edhrecExcludeLands === "true" ||
        search.edhrecExcludeLands === "1"
          ? true
          : undefined,
      returnCollection:
        search.returnCollection === true ||
        search.returnCollection === "true" ||
        search.returnCollection === "1"
          ? true
          : undefined,
      returnLocationId: returnLocationId || undefined,
    }
  },
  component: CardRoute,
})

function CardRoute() {
  const { id } = Route.useParams()
  const search = Route.useSearch()
  return (
    <CardDetailPage
      filterSearch={search.filters}
      id={id}
      query={search.q || ""}
      returnDeckId={search.deckId}
      returnEdhrecExcludeLands={Boolean(search.edhrecExcludeLands)}
      returnEdhrecTab={search.edhrec}
      returnCollection={Boolean(search.returnCollection)}
      returnLocationId={search.returnLocationId}
    />
  )
}
