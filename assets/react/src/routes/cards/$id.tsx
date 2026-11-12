import { createFileRoute } from "@tanstack/react-router"
import { CardDetailPage } from "../../pages/cards"
import { decodeCollectionFilters, encodeCollectionFilters } from "../../lib/collection-filters"
import { deserializeCatalogSort, serializeCatalogSort } from "../../pages/cards/sort"
import type { TradeTab } from "../../pages/trade"

type CardReturnEdhrecTab = "recs" | "cuts" | "commander"

type CardSearch = {
  q?: string
  filters?: string
  sort?: string
  deckId?: string
  edhrec?: CardReturnEdhrecTab
  edhrecExcludeLands?: boolean
  returnCollection?: boolean
  returnLocationId?: string
  returnTradeTab?: TradeTab
}

const EDHREC_TABS: CardReturnEdhrecTab[] = ["recs", "cuts", "commander"]
const TRADE_TABS: TradeTab[] = ["binder", "wants", "matches"]

export const Route = createFileRoute("/cards/$id")({
  staticData: { title: "Card" },
  validateSearch: (search: Record<string, unknown>): CardSearch => {
    const returnLocationId =
      typeof search.returnLocationId === "string" && !search.returnLocationId.includes("/")
        ? search.returnLocationId.trim()
        : ""

    return {
      q: typeof search.q === "string" ? search.q : undefined,
      filters: encodeCollectionFilters(decodeCollectionFilters(search.filters)),
      sort: serializeCatalogSort(deserializeCatalogSort(search.sort)),
      deckId: typeof search.deckId === "string" ? search.deckId : undefined,
      edhrec:
        typeof search.edhrec === "string" &&
        EDHREC_TABS.includes(search.edhrec as CardReturnEdhrecTab)
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
      returnTradeTab:
        typeof search.returnTradeTab === "string" &&
        TRADE_TABS.includes(search.returnTradeTab as TradeTab)
          ? (search.returnTradeTab as TradeTab)
          : undefined,
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
      sortSearch={search.sort}
      returnDeckId={search.deckId}
      returnEdhrecExcludeLands={Boolean(search.edhrecExcludeLands)}
      returnEdhrecTab={search.edhrec}
      returnCollection={Boolean(search.returnCollection)}
      returnLocationId={search.returnLocationId}
      returnTradeTab={search.returnTradeTab}
    />
  )
}
