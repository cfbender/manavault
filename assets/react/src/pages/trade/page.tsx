import { useNavigate } from "@tanstack/react-router"
import { PageHeader } from "../../components/app-shell"
import { cn } from "../../lib/utils"
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

      <div
        className="mb-7 flex flex-wrap gap-2 border-b border-base-300"
        role="tablist"
        aria-label="Trade view"
      >
        {TRADE_TAB_ITEMS.map(({ tab: value, label }) => (
          <TradeTabButton
            key={value}
            active={tab === value}
            label={label}
            onClick={() => selectTab(value)}
          />
        ))}
      </div>

      {tab === "binder" ? <BinderTab /> : null}
      {tab === "wants" ? <WantsTab /> : null}
      {tab === "matches" ? <MatchTab /> : null}
    </>
  )
}

function TradeTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "relative px-4 pb-3 pt-1 text-sm font-bold transition-colors",
        active ? "text-primary" : "text-base-content/60 hover:text-base-content",
      )}
      onClick={onClick}
    >
      {label}
      {active ? (
        <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-primary" />
      ) : null}
    </button>
  )
}
