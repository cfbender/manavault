import { createFileRoute } from "@tanstack/react-router"
import { TradePage, type TradeTab } from "../../pages/trade"

type TradeSearch = {
  tab: TradeTab
}

const TRADE_TABS: TradeTab[] = ["binder", "wants", "matches"]

export const Route = createFileRoute("/trade/")({
  staticData: { title: "Trade" },
  validateSearch: (search: Record<string, unknown>): TradeSearch => ({
    tab:
      typeof search.tab === "string" && TRADE_TABS.includes(search.tab as TradeTab)
        ? (search.tab as TradeTab)
        : "binder",
  }),
  component: TradeRoute,
})

function TradeRoute() {
  const search = Route.useSearch()
  return <TradePage tab={search.tab} />
}
