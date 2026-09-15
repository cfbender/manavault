import { useNavigate } from "@tanstack/react-router"
import { PageHeader } from "../../components/app-shell"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { BinderTab } from "./binder-tab"
import { MatchTab } from "./match-tab"
import type { TradeTab } from "./types"
import { WantsTab } from "./wants-tab"

export type { TradeTab } from "./types"

const TRADE_TAB_ITEMS: { tab: TradeTab; label: string }[] = [
  { tab: "binder", label: "Binder" },
  { tab: "wants", label: "Wants" },
  { tab: "matches", label: "Matches" },
]

export function TradePage({ tab }: { tab: TradeTab }) {
  const navigate = useNavigate()

  function selectTab(nextTab: TradeTab) {
    void navigate({ to: "/trade", search: { tab: nextTab } })
  }

  return (
    <>
      <PageHeader
        title="Trade"
        description="Mark cards you're willing to trade away, track what you're hunting for, and match them against a partner's binder or want list."
      />

      <Tabs value={tab} onValueChange={(nextTab) => selectTab(nextTab as TradeTab)}>
        <TabsList aria-label="Trade view">
          {TRADE_TAB_ITEMS.map(({ tab: value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="binder">
          <BinderTab />
        </TabsContent>
        <TabsContent value="wants">
          <WantsTab />
        </TabsContent>
        <TabsContent value="matches">
          <MatchTab />
        </TabsContent>
      </Tabs>
    </>
  )
}
