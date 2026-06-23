import { useState } from "react"
import { ManaSymbol } from "../../components/ui/mana-symbols"
import { MANA_STAT_COLORS, type DeckStats } from "../../lib/deck-stats"
import { cn } from "../../lib/utils"
import {
  MANA_ANY_PRODUCTION_COLOR,
  MANA_BALANCE_COLORS,
  MANA_COLOR_LABELS,
  MANA_EMPTY_BAR_COLOR,
  canSpendFlexibleManaOn,
  formatCardCount,
  manaBalanceSelectionDetail,
  manaContributorIdSet,
  manaContributorList,
  manaContributorQuantity,
  mergeManaContributors,
  practicalManaProduction,
  sameManaBalanceSelection,
  type DeckStatsWithContributors,
  type HighlightDeckCards,
  type ManaBalanceSegment,
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
  const statsWithContributors = stats as DeckStatsWithContributors
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
  const coloredProductionTotal = rows.reduce((total, row) => total + row.explicitProduction, 0)
  const productionTotal = coloredProductionTotal + anyProduction
  const coveredCost = rows.reduce((total, row) => total + Math.min(row.cost, row.production), 0)
  const remainingShortage = rows.reduce(
    (total, row) => total + Math.max(0, row.cost - row.production),
    0,
  )
  const coveragePercent =
    costTotal === 0 ? 0 : Math.min(100, Math.round((coveredCost / costTotal) * 100))
  const maxRowValue = Math.max(1, ...rows.flatMap((row) => [row.cost, row.production]))
  const costSegments = rows
    .filter((row) => row.cost > 0)
    .map((row) => ({
      key: row.color,
      label: row.label,
      value: row.cost,
      color: MANA_BALANCE_COLORS[row.color],
      ariaLabel: `Show ${row.label} cost contributors, ${row.cost} pips`,
      isActive: selection?.mode === "cost" && selection.color === row.color,
      onSelect: () => selectManaBalance({ mode: "cost", color: row.color }),
    }))
  const productionSegments: ManaBalanceSegment[] = [
    ...rows
      .filter((row) => row.explicitProduction > 0)
      .map((row) => ({
        key: row.color,
        label: row.label,
        value: row.explicitProduction,
        color: MANA_BALANCE_COLORS[row.color],
        ariaLabel: `Show ${row.label} production contributors, including flexible sources where applicable`,
        isActive: selection?.mode === "production" && selection.color === row.color,
        onSelect: () => selectManaBalance({ mode: "production", color: row.color }),
      })),
    ...(anyProduction > 0
      ? [
          {
            key: "any",
            label: "Any",
            value: anyProduction,
            color: MANA_ANY_PRODUCTION_COLOR,
            ariaLabel: `Show flexible any-color production contributors, ${anyProduction} mana`,
            isActive: selection?.mode === "production" && selection.color === "any",
            onSelect: () => selectManaBalance({ mode: "production", color: "any" }),
          },
        ]
      : []),
  ]
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
    <section
      className="rounded-box border border-base-300 bg-base-200/45 p-4"
      aria-labelledby="deck-stats-mana-balance"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="deck-stats-mana-balance"
            className="text-xs font-black uppercase tracking-[0.16em] text-base-content/55"
          >
            Mana cost vs production
          </h3>
          <p className="mt-1 text-sm text-base-content/60">
            Compare colored pips against practical production; flexible sources count for W/U/B/R/G
            coverage
          </p>
        </div>
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
          <div className="grid gap-3 rounded-box bg-base-100/70 p-3 shadow-sm">
            <ManaSegmentedBar label="Cost" total={costTotal} segments={costSegments} />
            <ManaSegmentedBar
              label="Production"
              total={productionTotal}
              segments={productionSegments}
            />
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-2">
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

          {anyProduction > 0 ? (
            <p className="mt-3 rounded-box border border-base-300 bg-base-100 px-3 py-2 text-sm text-base-content/65">
              Flexible production remains a distinct Any segment above, but counts toward each
              W/U/B/R/G row's practical coverage.
            </p>
          ) : null}
        </div>

        {selectedDetail ? (
          <ManaContributorPanel detail={selectedDetail} onClose={clearManaBalanceSelection} />
        ) : null}
      </div>
    </section>
  )
}

export function ManaSegmentedBar({
  label,
  segments,
  total,
}: {
  label: string
  segments: ManaBalanceSegment[]
  total: number
}) {
  const segmentSummary =
    segments.length === 0
      ? "no mana"
      : segments.map((segment) => `${segment.label} ${segment.value}`).join(", ")

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.12em] text-base-content/55">
        <span>{label}</span>
        <span className="font-mono text-base-content/75">{total}</span>
      </div>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-base-300 shadow-inner"
        role="group"
        aria-label={`${label}: ${total} total, ${segmentSummary}`}
      >
        {total > 0 ? (
          segments.map((segment) =>
            segment.onSelect ? (
              <button
                key={segment.key}
                type="button"
                className={cn(
                  "h-full min-w-0 cursor-pointer transition hover:brightness-110 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  segment.isActive && "brightness-125 saturate-125",
                )}
                style={{
                  flexBasis: `${(segment.value / total) * 100}%`,
                  backgroundColor: segment.color,
                }}
                title={`${segment.label}: ${segment.value}`}
                aria-label={segment.ariaLabel ?? `${label} ${segment.label}: ${segment.value}`}
                aria-pressed={segment.isActive}
                onClick={segment.onSelect}
              />
            ) : (
              <span
                key={segment.key}
                className="h-full"
                style={{
                  flexBasis: `${(segment.value / total) * 100}%`,
                  backgroundColor: segment.color,
                }}
                title={`${segment.label}: ${segment.value}`}
              />
            ),
          )
        ) : (
          <span className="h-full w-full" style={{ backgroundColor: MANA_EMPTY_BAR_COLOR }} />
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 text-[0.68rem] font-bold text-base-content/55">
        {segments.length > 0 ? (
          segments.map((segment) =>
            segment.onSelect ? (
              <button
                key={segment.key}
                type="button"
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-base-200 px-2 py-0.5 transition hover:bg-base-300 hover:text-base-content focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  segment.isActive && "bg-base-300 text-base-content shadow-inner",
                )}
                aria-label={segment.ariaLabel ?? `${label} ${segment.label}: ${segment.value}`}
                aria-pressed={segment.isActive}
                onClick={segment.onSelect}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden="true"
                />
                {segment.label} {segment.value}
              </button>
            ) : (
              <span
                key={segment.key}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-base-200 px-2 py-0.5"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden="true"
                />
                {segment.label} {segment.value}
              </span>
            ),
          )
        ) : (
          <span className="rounded-full bg-base-200 px-2 py-0.5">No mana</span>
        )}
      </div>
    </div>
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
      className="rounded-box border border-base-300 bg-base-100 p-3 shadow-sm"
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
