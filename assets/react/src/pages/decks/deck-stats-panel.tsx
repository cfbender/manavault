import { ChevronDown, Sparkles, TrendingUp, type LucideIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { buildDeckStats, type DeckStats } from "../../lib/deck-stats"
import { buildDeckTokens, type DeckTokenSummary } from "../../lib/deck-tokens"
import type { DeckCardEntry } from "./deck-types"

import {
  MANA_CURVE_PERMANENT_COLOR,
  MANA_CURVE_SPELL_COLOR,
  ManaBalanceComparison,
  formatManaValue,
  type HighlightDeckCards,
} from "./mana-balance"

export type DeferredDeckAnalysis = {
  stats: DeckStats
  tokens: readonly DeckTokenSummary[]
}

export type DeferredDeckAnalysisState = DeferredDeckAnalysis & {
  deckCards: DeckCardEntry[]
}

export function useDeferredDeckAnalysis(deckCards: DeckCardEntry[]) {
  const [analysis, setAnalysis] = useState<DeferredDeckAnalysisState | null>(null)

  useEffect(() => {
    let cancelled = false

    setAnalysis(null)

    const cancel = scheduleDeferredWork(() => {
      if (cancelled) return

      const nextAnalysis = {
        deckCards,
        stats: buildDeckStats(deckCards),
        tokens: buildDeckTokens(deckCards),
      }

      if (!cancelled) setAnalysis(nextAnalysis)
    })

    return () => {
      cancelled = true
      cancel()
    }
  }, [deckCards])

  return analysis?.deckCards === deckCards ? analysis : null
}

export function scheduleDeferredWork(callback: () => void) {
  if (typeof window === "undefined") return () => {}

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
    cancelIdleCallback?: (handle: number) => void
  }
  let idleHandle: number | null = null
  let timeoutHandle: number | null = null

  const frameHandle = window.requestAnimationFrame(() => {
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(callback, { timeout: 500 })
    } else {
      timeoutHandle = window.setTimeout(callback, 0)
    }
  })

  return () => {
    window.cancelAnimationFrame(frameHandle)

    if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle)
    if (timeoutHandle !== null) window.clearTimeout(timeoutHandle)
  }
}

export function DeferredDeckSection({
  detail,
  icon: Icon,
  title,
}: {
  detail: string
  icon: LucideIcon
  title: string
}) {
  return (
    <div
      className="rounded-box border border-base-300 bg-base-100 px-4 py-3 shadow-sm"
      role="status"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <span className="font-black tracking-normal">{title}</span>
        <span className="hidden truncate text-xs font-semibold text-base-content/50 sm:inline">
          {detail}
        </span>
      </span>
    </div>
  )
}

export function DeckTokensSection({ tokens }: { tokens: readonly DeckTokenSummary[] | null }) {
  if (tokens === null) {
    return (
      <DeferredDeckSection
        detail="Checking token makers after cards load"
        icon={Sparkles}
        title="Tokens this deck can create"
      />
    )
  }

  if (!tokens.length) return null

  return (
    <details className="group rounded-box border border-base-300 bg-base-100 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-black tracking-normal">Tokens this deck can create</span>
          <span className="hidden truncate text-xs font-semibold text-base-content/50 sm:inline">
            {tokens.length} {tokens.length === 1 ? "token" : "tokens"} found in Oracle text
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-base-content/50 transition group-open:rotate-180" />
      </summary>

      <div className="border-t border-base-300 p-4">
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-200/45">
          <table className="table table-zebra table-sm">
            <caption className="sr-only">Tokens this deck can create</caption>
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">Description</th>
                <th scope="col">Created by</th>
                <th scope="col">Per event</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr key={token.key} className="align-top">
                  <th scope="row" className="min-w-36 font-black">
                    {token.name}
                  </th>
                  <td className="min-w-64 text-base-content/75">{token.description}</td>
                  <td className="min-w-48">
                    <ul className="space-y-1">
                      {token.producers.map((producer) => (
                        <li key={producer.id}>
                          {producer.quantity > 1 ? `${producer.quantity}× ` : ""}
                          {producer.name}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="min-w-24">
                    <ul className="space-y-1">
                      {token.producers.map((producer) => (
                        <li key={producer.id}>{producer.amount}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  )
}

export function DeckStatsSection({
  onHighlightDeckCards,
  stats,
}: {
  onHighlightDeckCards?: HighlightDeckCards
  stats: DeckStats | null
}) {
  if (!stats) {
    return (
      <DeferredDeckSection
        detail="Calculating mana curve, costs, and production"
        icon={TrendingUp}
        title="Deck stats"
      />
    )
  }

  const maxCurveQuantity = Math.max(1, ...stats.manaCurve.map((bucket) => bucket.quantity))

  return (
    <details className="group rounded-box border border-base-300 bg-base-100 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-black tracking-normal">Deck stats</span>
          <span className="hidden truncate text-xs font-semibold text-base-content/50 sm:inline">
            Mana curve, costs, and production
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-base-content/50 transition group-open:rotate-180" />
      </summary>

      <div className="grid gap-5 border-t border-base-300 p-4">
        <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
          <DeckStatsMetric
            label="Nonland average MV"
            value={formatManaValue(stats.averageManaValue)}
          />
          <DeckStatsMetric label="Nonlands" value={stats.nonlandCards} />
          <DeckStatsMetric label="Lands" value={stats.landCards} />
          <DeckStatsMetric label="Median MV" value={formatManaValue(stats.medianManaValue)} />
          <DeckStatsMetric label="Total MV" value={stats.totalManaValue} />
        </dl>

        <section aria-labelledby="deck-stats-mana-curve" className="border-t border-base-300 pt-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3
                id="deck-stats-mana-curve"
                className="text-xs font-black uppercase tracking-[0.16em] text-base-content/55"
              >
                Mana curve
              </h3>
              <p className="mt-1 text-sm text-base-content/60">Nonland cards by mana value</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-base-content/60">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: MANA_CURVE_PERMANENT_COLOR }}
                />
                Permanents
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: MANA_CURVE_SPELL_COLOR }}
                />
                Spells
              </span>
            </div>
          </div>

          <div className="grid grid-cols-8 items-end gap-2 sm:gap-3">
            {stats.manaCurve.map((bucket) => (
              <ManaCurveBar key={bucket.bucket} bucket={bucket} maxQuantity={maxCurveQuantity} />
            ))}
          </div>
        </section>

        <ManaBalanceComparison stats={stats} onHighlightDeckCards={onHighlightDeckCards} />
      </div>
    </details>
  )
}

export function DeckStatsMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border-t border-base-300 pt-3 first:border-t-0 first:pt-0">
      <dt className="text-xs font-semibold text-base-content/60">{label}</dt>
      <dd className="mt-1 font-mono text-2xl font-black leading-none text-base-content">{value}</dd>
    </div>
  )
}

export function ManaCurveBar({
  bucket,
  maxQuantity,
}: {
  bucket: DeckStats["manaCurve"][number]
  maxQuantity: number
}) {
  const barHeight =
    bucket.quantity === 0 ? "0%" : `${Math.max(8, (bucket.quantity / maxQuantity) * 100)}%`
  const permanents = bucket.permanents
  const spells = bucket.spells
  const permanentHeight = bucket.quantity === 0 ? 0 : (permanents / bucket.quantity) * 100
  const spellHeight = bucket.quantity === 0 ? 0 : (spells / bucket.quantity) * 100

  return (
    <div className="grid min-w-0 gap-1.5 text-center">
      <span className="font-mono text-xs font-black text-base-content/70">{bucket.quantity}</span>
      <div className="flex h-36 items-end justify-center rounded-box bg-base-100/70 px-1.5 py-2 ring-1 ring-base-300/70">
        <div
          className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-lg bg-base-200 shadow-inner"
          style={{ height: barHeight }}
          role="img"
          aria-label={`Mana value ${bucket.bucket}: ${bucket.quantity} cards, ${permanents} permanents and ${spells} spells`}
        >
          {permanents > 0 ? (
            <div
              className="min-h-[0.25rem]"
              style={{ height: `${permanentHeight}%`, backgroundColor: MANA_CURVE_PERMANENT_COLOR }}
            />
          ) : null}
          {spells > 0 ? (
            <div
              className="min-h-[0.25rem]"
              style={{ height: `${spellHeight}%`, backgroundColor: MANA_CURVE_SPELL_COLOR }}
            />
          ) : null}
        </div>
      </div>
      <span className="font-mono text-xs font-black text-base-content/70">{bucket.bucket}</span>
    </div>
  )
}
