import { useMutation, useQuery } from "@apollo/client/react"
import { Link } from "@tanstack/react-router"
import { CircleDollarSign, Pencil, TrendingDown, TrendingUp } from "lucide-react"
import type { FormEvent } from "react"
import { useEffect, useState } from "react"
import { EmptyState } from "../../components/card-image"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "../../components/ui/popover"
import { useToast } from "../../components/ui/toast"
import { cn, pluralize } from "../../lib/utils"
import { BulkUpdateCollectionItemsDocument, CollectionValueDashboardDocument } from "./documents"
import { centsToCurrencyInput, parseCurrencyInputCents } from "./form-helpers"
import type { CollectionValueDashboardData, CollectionValuePosition } from "./types"
import { collectionValueGainClass } from "./value-summary"

export function CollectionValueDashboard() {
  const { data, error, loading, refetch } = useQuery(CollectionValueDashboardDocument, {
    fetchPolicy: "network-only",
  })
  const dashboard = data?.collectionValueDashboard

  if (loading && !dashboard) return <CollectionValueDashboardSkeleton />

  if (error || !dashboard) {
    return (
      <EmptyState
        title="Could not load collection value"
        description="Your collection is safe. Try opening the Value tab again."
      />
    )
  }

  if (dashboard.itemCount === 0) {
    return (
      <EmptyState
        title="No collection value yet"
        description="Add cards to your collection to track market value, purchase basis, gains, and losses."
      />
    )
  }

  return (
    <div className="space-y-5">
      <ValueOverview
        dashboard={dashboard}
        priceSource={priceSourceLabel(data?.pricingSettings.source)}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <PositionRanking
          description="Positions adding the most value at current market prices."
          emptyDescription="No positions are currently above their purchase basis."
          icon={TrendingUp}
          onBasisUpdated={() => void refetch()}
          positions={dashboard.biggestGains}
          title="Biggest gains"
          tone="gain"
        />
        <PositionRanking
          description="Positions furthest below their purchase basis."
          emptyDescription="No positions are currently below their purchase basis."
          icon={TrendingDown}
          onBasisUpdated={() => void refetch()}
          positions={dashboard.biggestLosses}
          title="Biggest losses"
          tone="loss"
        />
      </div>
    </div>
  )
}

function ValueOverview({
  dashboard,
  priceSource,
}: {
  dashboard: CollectionValueDashboardData
  priceSource: string
}) {
  const { summary } = dashboard

  return (
    <section
      aria-labelledby="collection-value-overview"
      className="rounded-box border border-base-300 bg-base-100 shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-base-300 px-4 py-4 sm:px-5">
        <div>
          <h2 id="collection-value-overview" className="flex items-center gap-2 text-lg font-black">
            <CircleDollarSign className="h-5 w-5 text-primary" />
            Collection value
          </h2>
          <p className="mt-1 text-sm text-base-content/65">
            {pluralize(dashboard.itemCount, "owned card")} across{" "}
            {pluralize(dashboard.positionCount, "printing")}
          </p>
        </div>
        <span className="badge badge-outline h-auto py-1.5 font-bold">{priceSource} market</span>
      </header>

      <dl className="grid border-b border-base-300 sm:grid-cols-3 sm:divide-x sm:divide-base-300">
        <ValueMetric label="Market value" value={summary.totalPriceText || "$0"} />
        <ValueMetric label="Purchase basis" value={summary.purchasePriceText || "$0"} />
        <ValueMetric
          label={summary.valueGainCents < 0 ? "Value loss" : "Value gain"}
          value={`${summary.valueGainText || "$0"}${summary.valueGainPercentText ? ` (${summary.valueGainPercentText})` : ""}`}
          valueClassName={collectionValueGainClass(summary.valueGainText)}
        />
      </dl>

      <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-2">
        <ValueComparison dashboard={dashboard} />
        <PositionDistribution dashboard={dashboard} />
      </div>
    </section>
  )
}

function ValueMetric({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="border-t border-base-300 px-4 py-4 first:border-t-0 sm:border-t-0 sm:px-5">
      <dt className="text-sm font-semibold text-base-content/65">{label}</dt>
      <dd className={cn("mt-1 font-mono text-2xl font-black tabular-nums", valueClassName)}>
        {value}
      </dd>
    </div>
  )
}

function ValueComparison({ dashboard }: { dashboard: CollectionValueDashboardData }) {
  const { summary } = dashboard
  const scale = Math.max(summary.totalPriceCents, summary.purchasePriceCents, 1)

  return (
    <section aria-labelledby="value-comparison-title">
      <h3 id="value-comparison-title" className="font-black">
        Market vs. basis
      </h3>
      <p className="mt-1 text-sm text-base-content/60">
        Current selected-source value compared with recorded purchase cost.
      </p>
      <div
        className="mt-4 space-y-3"
        role="img"
        aria-label="Market value compared with purchase basis"
      >
        <ComparisonBar
          label="Market"
          value={summary.totalPriceText || "$0"}
          width={(summary.totalPriceCents / scale) * 100}
          className="bg-primary"
        />
        <ComparisonBar
          label="Basis"
          value={summary.purchasePriceText || "$0"}
          width={(summary.purchasePriceCents / scale) * 100}
          className="bg-accent"
        />
      </div>
    </section>
  )
}

function ComparisonBar({
  className,
  label,
  value,
  width,
}: {
  className: string
  label: string
  value: string
  width: number
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
        <span className="font-bold">{label}</span>
        <span className="font-mono font-bold tabular-nums">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-base-200">
        <div className={cn("h-full rounded-full", className)} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function PositionDistribution({ dashboard }: { dashboard: CollectionValueDashboardData }) {
  const total = Math.max(dashboard.positionCount, 1)
  const segments = [
    {
      count: dashboard.gainPositionCount,
      label: "Above basis",
      className: "bg-success",
    },
    {
      count: dashboard.unchangedPositionCount,
      label: "At basis",
      className: "bg-base-content/25",
    },
    {
      count: dashboard.lossPositionCount,
      label: "Below basis",
      className: "bg-error",
    },
  ]

  return (
    <section aria-labelledby="position-distribution-title">
      <h3 id="position-distribution-title" className="font-black">
        Position performance
      </h3>
      <p className="mt-1 text-sm text-base-content/60">
        Printing positions relative to purchase basis.
      </p>
      <div
        className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-base-200"
        role="img"
        aria-label={`${dashboard.gainPositionCount} above basis, ${dashboard.unchangedPositionCount} at basis, ${dashboard.lossPositionCount} below basis`}
      >
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={segment.className}
            style={{ width: `${(segment.count / total) * 100}%` }}
          />
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {segments.map((segment) => (
          <div key={segment.label}>
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-base-content/60">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", segment.className)} />
              {segment.label}
            </dt>
            <dd className="mt-1 font-mono text-lg font-black tabular-nums">{segment.count}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function PositionRanking({
  description,
  emptyDescription,
  icon: Icon,
  onBasisUpdated,
  positions,
  title,
  tone,
}: {
  description: string
  emptyDescription: string
  icon: typeof TrendingUp
  onBasisUpdated: () => void
  positions: readonly CollectionValuePosition[]
  title: string
  tone: "gain" | "loss"
}) {
  return (
    <section
      aria-labelledby={`value-${tone}-title`}
      className="rounded-box border border-base-300 bg-base-100 shadow-sm"
    >
      <header className="border-b border-base-300 px-4 py-4 sm:px-5">
        <h2 id={`value-${tone}-title`} className="flex items-center gap-2 text-lg font-black">
          <Icon className={cn("h-5 w-5", tone === "gain" ? "text-success" : "text-error")} />
          {title}
        </h2>
        <p className="mt-1 text-sm text-base-content/60">{description}</p>
      </header>
      {positions.length ? (
        <ol className="divide-y divide-base-300">
          {positions.map((position) => (
            <li key={position.printing.scryfallId}>
              <ValuePositionRow onBasisUpdated={onBasisUpdated} position={position} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-base-content/60 sm:px-5">
          {emptyDescription}
        </p>
      )}
    </section>
  )
}

function ValuePositionRow({
  onBasisUpdated,
  position,
}: {
  onBasisUpdated: () => void
  position: CollectionValuePosition
}) {
  const cardName = position.printing.card?.name || "Unknown card"
  const setLabel = [position.printing.setCode?.toUpperCase(), position.printing.collectorNumber]
    .filter(Boolean)
    .join(" #")

  return (
    <article className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <div className="h-[4.5rem] w-[3.2rem] shrink-0 overflow-hidden rounded-md bg-base-200">
        {position.printing.imageUrl ? (
          <img
            src={position.printing.imageUrl}
            alt={cardName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full items-center justify-center px-1 text-center text-[0.6rem] text-base-content/50">
            No image
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-bold">
          {position.printing.card?.id ? (
            <Link
              to="/cards/$id"
              params={{ id: position.printing.card.id }}
              search={{ returnCollection: true }}
              className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            >
              {cardName}
            </Link>
          ) : (
            cardName
          )}
        </h3>
        <p className="mt-0.5 truncate text-xs text-base-content/60">
          {setLabel || position.printing.setName || "Unknown printing"} · ×{position.quantity}
        </p>
        <p className="mt-2 text-xs text-base-content/60 sm:hidden">
          Market <span className="font-mono font-bold">{position.totalPriceText}</span> · Basis{" "}
          <span className="font-mono font-bold">{position.purchasePriceText}</span>
        </p>
      </div>
      <dl className="hidden shrink-0 grid-cols-2 gap-x-5 text-right text-xs sm:grid">
        <div>
          <dt className="text-base-content/55">Market</dt>
          <dd className="mt-0.5 font-mono font-bold tabular-nums">{position.totalPriceText}</dd>
        </div>
        <div>
          <dt className="text-base-content/55">Basis</dt>
          <dd className="mt-0.5 font-mono font-bold tabular-nums">{position.purchasePriceText}</dd>
        </div>
      </dl>
      <div
        className={cn("w-20 shrink-0 text-right", collectionValueGainClass(position.valueGainText))}
      >
        <p className="font-mono font-black tabular-nums">{position.valueGainText}</p>
        {position.valueGainPercentText ? (
          <p className="mt-0.5 text-xs font-bold tabular-nums">{position.valueGainPercentText}</p>
        ) : null}
      </div>
      <PurchaseBasisQuickEdit position={position} onDone={onBasisUpdated} />
    </article>
  )
}

function PurchaseBasisQuickEdit({
  onDone,
  position,
}: {
  onDone: () => void
  position: CollectionValuePosition
}) {
  const { showToast } = useToast()
  const cardName = position.printing.card?.name || "card"
  const [open, setOpen] = useState(false)
  const [purchasePrice, setPurchasePrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [updateItems, updateState] = useMutation(BulkUpdateCollectionItemsDocument)

  useEffect(() => {
    if (!open) return

    const perCardBasis = position.quantity
      ? Math.round(position.purchasePriceCents / position.quantity)
      : 0
    setPurchasePrice(centsToCurrencyInput(perCardBasis))
    setError(null)
  }, [open, position.purchasePriceCents, position.quantity])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const purchasePriceCents = parseCurrencyInputCents(purchasePrice)
    if (purchasePriceCents === undefined) {
      setError("Enter a dollar amount, such as 12.34")
      return
    }

    void updateItems({
      variables: {
        selector: { ids: position.items.map((item) => item.id) },
        input: { purchasePriceCents },
      },
      onCompleted: () => {
        showToast(`Purchase basis updated for ${cardName}`)
        setOpen(false)
        onDone()
      },
      onError: (mutationError) =>
        setError(
          mutationError instanceof Error
            ? mutationError.message
            : "Could not update purchase basis",
        ),
    })
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => !updateState.loading && setOpen(nextOpen)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 min-h-9 w-9 shrink-0"
          aria-label={`Edit purchase basis for ${cardName}`}
          title="Edit purchase basis"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)]">
        <form className="space-y-3" onSubmit={submit}>
          <div>
            <h4 className="font-black">Edit purchase basis</h4>
            <p className="mt-0.5 truncate text-xs text-base-content/60">{cardName}</p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-base-content/70">Purchase price per card</span>
            <Input
              autoFocus
              className="h-9 min-h-9 font-mono"
              inputMode="decimal"
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
              placeholder="12.34"
            />
          </label>
          <p className="text-xs leading-relaxed text-base-content/60">
            Current basis {position.purchasePriceText} across {position.quantity}{" "}
            {position.quantity === 1 ? "copy" : "copies"}. This sets one per-card price for the
            entire printing position. Leave blank to use current market price.
          </p>
          {error ? (
            <p role="alert" className="text-xs font-semibold text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <PopoverClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={updateState.loading}>
                Cancel
              </Button>
            </PopoverClose>
            <Button type="submit" size="sm" disabled={updateState.loading}>
              {updateState.loading ? "Saving..." : "Save basis"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function CollectionValueDashboardSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading collection value">
      <div className="h-80 animate-pulse rounded-box bg-base-200" />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="h-96 animate-pulse rounded-box bg-base-200" />
        <div className="h-96 animate-pulse rounded-box bg-base-200" />
      </div>
    </div>
  )
}

function priceSourceLabel(source: string | null | undefined) {
  if (source === "tcgplayer") return "TCGplayer"
  if (source === "cardkingdom") return "Card Kingdom"
  if (source === "manapool") return "ManaPool"
  if (source === "scryfall") return "Scryfall"
  return "Current"
}
