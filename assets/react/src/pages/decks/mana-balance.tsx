import { useState } from "react"
import { ManaSymbol } from "../../components/ui/mana-symbols"
import { MANA_STAT_COLORS, type DeckStats } from "../../lib/deck-stats"
import { cn } from "../../lib/utils"
import {
  MANA_BALANCE_COLORS,
  MANA_COLOR_LABELS,
  canSpendFlexibleManaOn,
  formatCardCount,
  manaBalanceSelectionDetail,
  manaContributorIdSet,
  manaContributorList,
  manaContributorQuantity,
  mergeManaContributors,
  practicalManaProduction,
  sameManaBalanceSelection,
  type HighlightDeckCards,
  type ManaBalanceSelection,
  type ManaStatColor,
} from "./mana-balance-model"
import { ManaContributorPanel } from "./mana-contributor-panel"
export {
  MANA_COLOR_LABELS,
  MANA_CURVE_PERMANENT_COLOR,
  MANA_CURVE_SPELL_COLOR,
  filterHighlightedDeckCardIds,
  formatManaValue,
  type HighlightDeckCards,
} from "./mana-balance-model"
export { ManaContributorPanel } from "./mana-contributor-panel"

export function ManaBalanceComparison({
  onHighlightDeckCards,
  stats,
}: {
  onHighlightDeckCards?: HighlightDeckCards
  stats: DeckStats
}) {
  const [selection, setSelection] = useState<ManaBalanceSelection | null>(null)
  const statsWithContributors = stats
  const manaProduction = statsWithContributors.manaProduction
  const productionCards = manaProduction.cards
  const productionContributors = manaProduction.contributors
  const costContributors = statsWithContributors.costContributors
  const anyProduction = manaProduction.any
  const anySourceCardCount = productionCards ? (productionCards.any ?? 0) : undefined
  const anyContributors = manaContributorList(productionContributors, "any")
  const sourceCardsAvailable = Boolean(productionCards || productionContributors)
  const rows = MANA_STAT_COLORS.map((color) => {
    const explicitProduction = manaProduction[color]
    const includesFlexibleProduction = canSpendFlexibleManaOn(color) && anyProduction > 0
    const production = practicalManaProduction(color, explicitProduction, anyProduction)
    const explicitSourceCardCount = productionCards ? (productionCards[color] ?? 0) : undefined
    const productionContributorList = mergeManaContributors([
      manaContributorList(productionContributors, color),
      includesFlexibleProduction ? anyContributors : [],
    ])
    const fallbackSourceCardCount =
      productionCards && typeof explicitSourceCardCount === "number"
        ? explicitSourceCardCount + (includesFlexibleProduction ? (productionCards.any ?? 0) : 0)
        : undefined
    const sourceCardCount =
      productionContributorList.length > 0
        ? manaContributorQuantity(productionContributorList)
        : fallbackSourceCardCount

    return {
      color,
      label: MANA_COLOR_LABELS[color],
      cost: stats.manaCost[color],
      costContributors: manaContributorList(costContributors, color),
      explicitProduction,
      production,
      productionContributors: productionContributorList,
      sourceCardCount,
      includesFlexibleProduction,
    }
  })
  const costTotal = rows.reduce((total, row) => total + row.cost, 0)
  const coveredCost = rows.reduce((total, row) => total + Math.min(row.cost, row.production), 0)
  const remainingShortage = rows.reduce(
    (total, row) => total + Math.max(0, row.cost - row.production),
    0,
  )
  const coveragePercent =
    costTotal === 0 ? 0 : Math.min(100, Math.round((coveredCost / costTotal) * 100))
  const maxRowValue = Math.max(1, ...rows.flatMap((row) => [row.cost, row.production]))
  const selectedDetail = manaBalanceSelectionDetail(selection, rows, anyProduction, anyContributors)

  function selectManaBalance(nextSelection: ManaBalanceSelection) {
    if (sameManaBalanceSelection(selection, nextSelection)) {
      clearManaBalanceSelection()
      return
    }

    const nextDetail = manaBalanceSelectionDetail(
      nextSelection,
      rows,
      anyProduction,
      anyContributors,
    )

    setSelection(nextSelection)
    onHighlightDeckCards?.(manaContributorIdSet(nextDetail?.contributors))
  }

  function clearManaBalanceSelection() {
    setSelection(null)
    onHighlightDeckCards?.(null)
  }

  return (
    <section className="border-t border-base-300 pt-4" aria-labelledby="deck-stats-mana-balance">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h3
          id="deck-stats-mana-balance"
          className="text-xs font-black uppercase tracking-[0.16em] text-base-content/55"
        >
          Mana cost vs production
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-black shadow-sm",
              remainingShortage > 0
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-success/30 bg-success/10 text-success",
            )}
          >
            {coveragePercent}% covered
          </div>
          {anyProduction > 0 ? (
            <button
              type="button"
              className={cn(
                "cursor-pointer whitespace-nowrap rounded-full border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-black text-base-content/70 shadow-sm transition hover:border-primary/50 hover:text-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                selection?.mode === "production" &&
                  selection.color === "any" &&
                  "border-primary/50 bg-primary/10 text-primary",
              )}
              aria-label={`Show flexible any-color production contributors, ${anyProduction} mana`}
              aria-pressed={selection?.mode === "production" && selection.color === "any"}
              onClick={() => selectManaBalance({ mode: "production", color: "any" })}
            >
              Flexible: {anyProduction} mana
              {typeof anySourceCardCount === "number"
                ? ` from ${formatCardCount(anySourceCardCount)}`
                : ""}
            </button>
          ) : null}
        </div>
      </div>

      <div className={cn("grid gap-4", selectedDetail && "xl:grid-cols-[minmax(0,1fr)_22rem]")}>
        <div className="min-w-0">
          <div className="grid gap-2 lg:grid-cols-2">
            {rows.map((row) => (
              <ManaBalanceRow
                key={row.color}
                anyProduction={anyProduction}
                color={row.color}
                cost={row.cost}
                costActive={selection?.mode === "cost" && selection.color === row.color}
                label={row.label}
                onSelectCost={
                  row.cost > 0
                    ? () => selectManaBalance({ mode: "cost", color: row.color })
                    : undefined
                }
                onSelectProduction={
                  row.production > 0
                    ? () => selectManaBalance({ mode: "production", color: row.color })
                    : undefined
                }
                production={row.production}
                productionActive={selection?.mode === "production" && selection.color === row.color}
                scale={maxRowValue}
                sourceCardCount={row.sourceCardCount}
                sourceCardsAvailable={sourceCardsAvailable}
                usesFlexibleProduction={row.includesFlexibleProduction}
              />
            ))}
          </div>
        </div>

        {selectedDetail ? (
          <ManaContributorPanel detail={selectedDetail} onClose={clearManaBalanceSelection} />
        ) : null}
      </div>
    </section>
  )
}

export function ManaBalanceRow({
  anyProduction,
  color,
  cost,
  costActive,
  label,
  onSelectCost,
  onSelectProduction,
  production,
  productionActive,
  scale,
  sourceCardCount,
  sourceCardsAvailable,
  usesFlexibleProduction,
}: {
  anyProduction: number
  color: ManaStatColor
  cost: number
  costActive: boolean
  label: string
  onSelectCost?: () => void
  onSelectProduction?: () => void
  production: number
  productionActive: boolean
  scale: number
  sourceCardCount: number | undefined
  sourceCardsAvailable: boolean
  usesFlexibleProduction: boolean
}) {
  const shortage = Math.max(0, cost - production)
  const surplus = Math.max(0, production - cost)
  const coverageText =
    cost === 0 && production === 0
      ? "No cost or production"
      : shortage > 0
        ? `Short ${shortage}`
        : surplus > 0
          ? `Surplus ${surplus}`
          : "Covered"
  const sourceText =
    sourceCardsAvailable && typeof sourceCardCount === "number"
      ? `Sources: ${formatCardCount(sourceCardCount)}${usesFlexibleProduction ? " incl. flexible" : ""}`
      : usesFlexibleProduction
        ? `Includes ${anyProduction} flexible mana`
        : "Sources pending"
  const ariaSourceText =
    sourceCardsAvailable && typeof sourceCardCount === "number"
      ? ` from ${sourceCardCount} source ${sourceCardCount === 1 ? "card" : "cards"}`
      : ""
  const practicalProductionText = usesFlexibleProduction
    ? `${production} practical produced mana including ${anyProduction} flexible`
    : `${production} produced mana`

  return (
    <article
      className="border-t border-base-300 py-3"
      role="group"
      aria-label={`${label}: ${cost} cost pips, ${practicalProductionText}${ariaSourceText}, ${coverageText.toLowerCase()}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ManaSymbol symbol={color} className="h-6 w-6 shrink-0" />
          <div className="min-w-0">
            <h4 className="truncate text-sm font-black text-base-content">{label}</h4>
            <p className="text-xs font-semibold text-base-content/55">{sourceText}</p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-xs font-black",
            shortage > 0
              ? "bg-warning/15 text-warning"
              : surplus > 0
                ? "bg-success/15 text-success"
                : "bg-base-200 text-base-content/65",
          )}
        >
          {coverageText}
        </span>
      </div>

      <div className="mt-3 grid gap-1.5">
        <ManaBalanceMeter
          label="Cost"
          value={cost}
          scale={scale}
          color={MANA_BALANCE_COLORS[color]}
          active={costActive}
          ariaLabel={`Show ${label} cost contributors, ${cost} pips`}
          onSelect={onSelectCost}
        />
        <ManaBalanceMeter
          label="Prod"
          value={production}
          scale={scale}
          color={MANA_BALANCE_COLORS[color]}
          subdued={production < cost}
          active={productionActive}
          ariaLabel={`Show ${label} production contributors${
            usesFlexibleProduction ? ", including flexible sources" : ""
          }, ${production} mana`}
          onSelect={onSelectProduction}
          title={
            usesFlexibleProduction
              ? `${label} practical production includes ${anyProduction} flexible mana`
              : undefined
          }
        />
      </div>
    </article>
  )
}

export function ManaBalanceMeter({
  active = false,
  ariaLabel,
  color,
  label,
  onSelect,
  scale,
  subdued = false,
  title,
  value,
}: {
  active?: boolean
  ariaLabel?: string
  color: string
  label: string
  onSelect?: () => void
  scale: number
  subdued?: boolean
  title?: string
  value: number
}) {
  const meter = (
    <>
      <span className="font-black uppercase tracking-[0.12em] text-base-content/45">{label}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-base-200 shadow-inner">
        {value > 0 ? (
          <span
            className={cn("block h-full rounded-full", subdued && "opacity-70")}
            style={{
              width: `${Math.max(4, (value / scale) * 100)}%`,
              backgroundColor: color,
            }}
          />
        ) : null}
      </div>
      <span className="text-right font-mono font-black text-base-content/70">{value}</span>
    </>
  )

  if (onSelect && value > 0) {
    return (
      <button
        type="button"
        className={cn(
          "grid cursor-pointer grid-cols-[3.25rem_minmax(0,1fr)_2rem] items-center gap-2 rounded-md text-left text-xs transition hover:bg-base-200/70 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          active && "bg-primary/10 outline outline-2 outline-offset-1 outline-primary",
        )}
        aria-label={ariaLabel}
        aria-pressed={active}
        onClick={onSelect}
        title={title}
      >
        {meter}
      </button>
    )
  }

  return (
    <div
      className="grid grid-cols-[3.25rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs"
      title={title}
    >
      {meter}
    </div>
  )
}
