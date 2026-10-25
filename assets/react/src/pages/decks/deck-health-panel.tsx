import { useQuery } from "@apollo/client/react"
import { ChevronDown, HeartPulse, Infinity as InfinityIcon, RotateCw } from "lucide-react"
import { useMemo, useState } from "react"
import {
  withCombos,
  type DeckBracketFloor,
  type DeckHealth,
  type DeckHealthCard,
  type DeckHealthCheck,
  type DeckHealthCombos,
  type DeckHealthPower,
  type DeckHealthQuality,
  type DeckHealthSignal,
  type DeckQualityBucket,
} from "../../lib/deck-health"
import { cn } from "../../lib/utils"
import type { HighlightDeckCards } from "./mana-balance-model"
import { DeckCombosDocument } from "./deck-recommendation-documents"
import { DeferredDeckSection } from "./deck-stats-panel"

const BRACKET_GUIDANCE_URL = "https://magic.wizards.com/en/formats/commander"

type HighlightKey = `check:${string}` | `signal:${string}` | `bucket:${string}`

export function DeckHealthSection({
  deckCards,
  deckId,
  health,
  onHighlightDeckCards,
  onOpenCombos,
  shareMode = false,
}: {
  deckCards: readonly DeckHealthCard[]
  deckId: string
  health: DeckHealth | null
  onHighlightDeckCards?: HighlightDeckCards
  onOpenCombos?: () => void
  shareMode?: boolean
}) {
  const [highlighted, setHighlighted] = useState<HighlightKey | null>(null)
  const [open, setOpen] = useState(false)
  // Commander Spellbook is a network call, so only ask once the section is
  // open, and never on share pages, which have no combo query.
  const checksCombos = !shareMode && Boolean(health?.power)
  const comboQuery = useQuery(DeckCombosDocument, {
    variables: { id: deckId },
    skip: !open || !checksCombos,
  })
  const combos = comboQuery.data?.deckCombos ?? null
  const report = useMemo(
    () => (health ? withCombos(health, combos, deckCards) : null),
    [health, combos, deckCards],
  )

  if (!report) {
    return (
      <DeferredDeckSection
        detail="Checking card quality, mana, and bracket signals"
        icon={HeartPulse}
        title="Deck health"
      />
    )
  }

  if (report.countedCards === 0) return null

  function toggleHighlight(key: HighlightKey, cardIds: string[]) {
    if (highlighted === key) {
      setHighlighted(null)
      onHighlightDeckCards?.(null)
      return
    }
    setHighlighted(key)
    onHighlightDeckCards?.(new Set(cardIds))
  }

  const bracket = report.power?.bracketFloor
  const dials = 2 + (report.quality ? 1 : 0) + (bracket ? 1 : 0)
  const combosState: ComboTileState | null = !checksCombos
    ? null
    : comboQuery.error
      ? { kind: "error", retry: () => void comboQuery.refetch() }
      : report.power?.combos
        ? { kind: "loaded", combos: report.power.combos }
        : { kind: "loading" }

  return (
    <details
      className="group rounded-box border border-base-300 bg-base-100 shadow-sm"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <HeartPulse className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-black tracking-normal">Deck health</span>
          <span className="hidden truncate text-xs font-semibold text-base-content/50 sm:inline">
            {deckHealthDetail(report)}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-base-content/50 transition group-open:rotate-180" />
      </summary>

      <div className="grid gap-5 border-t border-base-300 p-4">
        <div
          className={cn("grid gap-3", dials === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2")}
        >
          <ScoreDial label="Overall" score={report.overall} />
          {report.quality ? <ScoreDial label="Card quality" score={report.quality.score} /> : null}
          <ScoreDial label="Mana" score={report.mana.score} />
          {bracket ? <BracketTile bracket={bracket} /> : null}
        </div>

        {report.quality ? (
          <QualityBuckets
            highlighted={highlighted}
            onToggleHighlight={onHighlightDeckCards ? toggleHighlight : undefined}
            quality={report.quality}
          />
        ) : null}

        <HealthChecks
          checks={report.mana.checks}
          highlighted={highlighted}
          id="deck-health-mana"
          intro="Land count follows the curve; coverage compares colored costs with what the deck produces."
          onToggleHighlight={onHighlightDeckCards ? toggleHighlight : undefined}
          title="Mana"
        />

        {report.power ? (
          <PowerSignals
            combos={combosState}
            highlighted={highlighted}
            onOpenCombos={onOpenCombos}
            onToggleHighlight={onHighlightDeckCards ? toggleHighlight : undefined}
            power={report.power}
          />
        ) : null}

        <p className="max-w-[72ch] text-xs text-base-content/60">
          Rules-based, not AI: card quality follows EDHREC's play rank, Game Changers come from the
          official list, combos from Commander Spellbook, and mana from the deck's own costs and
          production. Rank rewards the popular pick over the right one for your plan, so treat a low
          score as a prompt to look, not a verdict.
        </p>
      </div>
    </details>
  )
}

function deckHealthDetail(health: DeckHealth) {
  const parts = [`Overall ${health.overall}`]
  if (health.quality) parts.push(`Quality ${health.quality.score}`)
  parts.push(`Mana ${health.mana.score}`)
  if (health.power) parts.push(bracketLabel(health.power.bracketFloor.bracket))
  return parts.join(" · ")
}

function bracketLabel(bracket: 2 | 3 | 4) {
  return bracket === 2 ? "Fits bracket 2" : `Bracket ${bracket}+`
}

function scoreTone(score: number) {
  if (score >= 80) return "success"
  if (score >= 50) return "warning"
  return "error"
}

const TONE_TEXT = {
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
} as const

const TONE_STROKE = {
  success: "stroke-success",
  warning: "stroke-warning",
  error: "stroke-error",
} as const

const TONE_FILL = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
} as const

export function ScoreDial({ label, score }: { label: string; score: number }) {
  const tone = scoreTone(score)
  const clamped = Math.min(100, Math.max(0, score))

  return (
    <div
      className="grid justify-items-center gap-1 rounded-box border border-base-300 bg-base-200/45 px-3 pb-3 pt-4"
      role="img"
      aria-label={`${label} score ${clamped} out of 100`}
    >
      <svg viewBox="0 0 100 58" className="w-24" aria-hidden="true">
        <path
          d="M 10 52 A 40 40 0 0 1 90 52"
          pathLength={100}
          className="fill-none stroke-base-300"
          strokeWidth={9}
          strokeLinecap="round"
        />
        <path
          d="M 10 52 A 40 40 0 0 1 90 52"
          pathLength={100}
          className={cn("fill-none transition-[stroke-dasharray] duration-300", TONE_STROKE[tone])}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${clamped} 100`}
        />
        <text
          x="50"
          y="50"
          textAnchor="middle"
          className="fill-current font-mono text-2xl font-black tabular-nums text-base-content"
        >
          {clamped}
        </text>
      </svg>
      <span className="text-xs font-bold text-base-content/60">{label}</span>
    </div>
  )
}

function BracketTile({ bracket }: { bracket: DeckBracketFloor }) {
  return (
    <div className="grid content-start justify-items-center gap-1 rounded-box border border-base-300 bg-base-200/45 px-3 pb-3 pt-4 text-center">
      <span className="font-mono text-2xl font-black leading-none tabular-nums text-base-content">
        {bracket.bracket}
        {bracket.bracket === 2 ? "" : "+"}
      </span>
      <span className="text-xs font-bold text-base-content/60">Bracket floor</span>
      <span className="text-xs text-base-content/55">{bracket.reasons[0]}</span>
    </div>
  )
}

const BUCKET_FILL: Record<DeckQualityBucket["key"], string> = {
  staples: "bg-primary",
  played: "bg-primary/45",
  fringe: "bg-base-300",
}

function QualityBuckets({
  highlighted,
  onToggleHighlight,
  quality,
}: {
  highlighted: HighlightKey | null
  onToggleHighlight?: (key: HighlightKey, cardIds: string[]) => void
  quality: DeckHealthQuality
}) {
  return (
    <section aria-labelledby="deck-health-quality" className="border-t border-base-300 pt-4">
      <h3
        id="deck-health-quality"
        className="text-xs font-black uppercase tracking-[0.16em] text-base-content/55"
      >
        Card quality
      </h3>
      <p className="mt-1 max-w-[65ch] text-sm text-base-content/60">
        How widely EDHREC players run the {quality.nonlandCards} nonland cards. Staples count in
        full and played cards half.
      </p>
      <div
        className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-base-200"
        role="img"
        aria-label={quality.buckets.map((bucket) => `${bucket.label} ${bucket.share}%`).join(", ")}
      >
        {quality.buckets.map((bucket) => (
          <div
            key={bucket.key}
            className={cn("h-full transition-[width] duration-300", BUCKET_FILL[bucket.key])}
            style={{ width: `${bucket.share}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {quality.buckets.map((bucket) => (
          <li
            key={bucket.key}
            className={cn(
              "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-box border bg-base-100 px-3 py-3 transition",
              highlighted === `bucket:${bucket.key}` ? "border-primary/50" : "border-base-300",
            )}
            aria-label={`${bucket.label}: ${bucket.count} cards, ${bucket.share}%`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="flex items-center gap-1.5 text-sm font-black text-base-content">
                  <span
                    aria-hidden="true"
                    className={cn("h-2.5 w-2.5 shrink-0 rounded-full", BUCKET_FILL[bucket.key])}
                  />
                  {bucket.label}
                </h4>
                <p className="text-xs font-semibold text-base-content/55">{bucket.description}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="font-mono text-xl font-black leading-none tabular-nums text-base-content">
                  {bucket.count}
                </span>
                <span className="block font-mono text-xs font-bold tabular-nums text-base-content/50">
                  {bucket.share}%
                </span>
              </div>
            </div>
            {onToggleHighlight && bucket.cards.length > 0 ? (
              <div className="flex justify-end">
                <HighlightButton
                  active={highlighted === `bucket:${bucket.key}`}
                  onClick={() =>
                    onToggleHighlight(
                      `bucket:${bucket.key}`,
                      bucket.cards.map((card) => card.id),
                    )
                  }
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function HealthChecks({
  checks,
  highlighted,
  id,
  intro,
  onToggleHighlight,
  title,
}: {
  checks: DeckHealthCheck[]
  highlighted: HighlightKey | null
  id: string
  intro: string
  onToggleHighlight?: (key: HighlightKey, cardIds: string[]) => void
  title: string
}) {
  return (
    <section aria-labelledby={id} className="border-t border-base-300 pt-4">
      <h3 id={id} className="text-xs font-black uppercase tracking-[0.16em] text-base-content/55">
        {title}
      </h3>
      <p className="mt-1 max-w-[65ch] text-sm text-base-content/60">{intro}</p>
      <ul className="mt-3 grid gap-2 lg:grid-cols-2">
        {checks.map((check) => (
          <HealthCheckRow
            key={check.key}
            check={check}
            highlighted={highlighted === `check:${check.key}`}
            onToggleHighlight={
              onToggleHighlight && check.cards.length > 0
                ? () =>
                    onToggleHighlight(
                      `check:${check.key}`,
                      check.cards.map((card) => card.id),
                    )
                : undefined
            }
          />
        ))}
      </ul>
    </section>
  )
}

function HealthCheckRow({
  check,
  highlighted,
  onToggleHighlight,
}: {
  check: DeckHealthCheck
  highlighted: boolean
  onToggleHighlight?: () => void
}) {
  const tone = check.status === "ok" ? "success" : "warning"
  const countText = check.key === "colorCoverage" ? `${check.count}%` : String(check.count)
  const targetText = check.target ? `${check.target[0]}–${check.target[1]}` : null

  return (
    <li
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-box border bg-base-100 px-3 py-3 transition",
        highlighted ? "border-primary/50" : "border-base-300",
      )}
      aria-label={`${check.label}: ${countText}${targetText ? `, target ${targetText}` : ""}, ${check.note.toLowerCase()}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-black text-base-content">{check.label}</h4>
          <p className="text-xs font-semibold text-base-content/55">{check.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="font-mono text-xl font-black leading-none tabular-nums text-base-content">
            {countText}
          </span>
          {targetText ? (
            <span className="block font-mono text-xs font-bold tabular-nums text-base-content/50">
              target {targetText}
            </span>
          ) : null}
        </div>
      </div>

      {check.target ? (
        <TargetBand count={check.count} target={check.target} tone={tone} />
      ) : (
        <ScoreBar score={check.score} />
      )}

      <div className="flex items-center justify-between gap-3">
        <span className={cn("text-xs font-black", TONE_TEXT[tone])}>{check.note}</span>
        {onToggleHighlight ? (
          <HighlightButton active={highlighted} onClick={onToggleHighlight} />
        ) : null}
      </div>
    </li>
  )
}

/** A track with the target band shaded and a marker where the count sits. */
function TargetBand({
  count,
  target,
  tone,
}: {
  count: number
  target: readonly [number, number]
  tone: "success" | "warning"
}) {
  const [min, max] = target
  const scale = Math.max(max + Math.max(4, Math.round(max * 0.5)), count + 1)
  const percent = (value: number) => `${Math.min(100, (value / scale) * 100)}%`

  return (
    <div className="relative h-2.5 w-full rounded-full bg-base-200" aria-hidden="true">
      <div
        className="absolute inset-y-0 rounded-full bg-success/25"
        style={{ left: percent(min), width: `calc(${percent(max)} - ${percent(min)})` }}
      />
      <div
        className={cn(
          "absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-base-100",
          TONE_FILL[tone],
        )}
        style={{ left: percent(count) }}
      />
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const tone = scoreTone(score)

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-base-200" aria-hidden="true">
      <div
        className={cn("h-full rounded-full", TONE_FILL[tone])}
        style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
      />
    </div>
  )
}

type ComboTileState =
  | { kind: "loading" }
  | { kind: "error"; retry: () => void }
  | { kind: "loaded"; combos: DeckHealthCombos }

function PowerSignals({
  combos,
  highlighted,
  onOpenCombos,
  onToggleHighlight,
  power,
}: {
  combos: ComboTileState | null
  highlighted: HighlightKey | null
  onOpenCombos?: () => void
  onToggleHighlight?: (key: HighlightKey, cardIds: string[]) => void
  power: DeckHealthPower
}) {
  return (
    <section aria-labelledby="deck-health-power" className="border-t border-base-300 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="deck-health-power"
            className="text-xs font-black uppercase tracking-[0.16em] text-base-content/55"
          >
            Bracket signals
          </h3>
          <p className="mt-1 max-w-[65ch] text-sm text-base-content/60">
            {bracketLabel(power.bracketFloor.bracket)} by the{" "}
            <a
              href={BRACKET_GUIDANCE_URL}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary"
            >
              official checklist
            </a>
            : {power.bracketFloor.reasons.join("; ")}.{" "}
            {power.combos ? "Intent decides the rest." : "Combos and intent decide the rest."}
          </p>
        </div>
        {power.saltSum !== null ? (
          <span className="whitespace-nowrap rounded-full border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-black text-base-content/70 shadow-sm">
            Salt sum{" "}
            <span className="font-mono tabular-nums text-base-content">
              {power.saltSum.toFixed(2)}
            </span>
          </span>
        ) : null}
      </div>

      <ul
        className={cn(
          "mt-3 grid gap-2 sm:grid-cols-2",
          combos ? "lg:grid-cols-3" : "lg:grid-cols-4",
        )}
      >
        {combos ? (
          <ComboTile
            highlighted={highlighted === "signal:combos"}
            onOpenCombos={onOpenCombos}
            onToggleHighlight={
              onToggleHighlight && combos.kind === "loaded" && combos.combos.cards.length > 0
                ? () =>
                    onToggleHighlight(
                      "signal:combos",
                      combos.combos.cards.map((card) => card.id),
                    )
                : undefined
            }
            state={combos}
          />
        ) : null}
        {power.signals.map((signal) => (
          <SignalRow
            key={signal.key}
            highlighted={highlighted === `signal:${signal.key}`}
            onToggleHighlight={
              onToggleHighlight && signal.cards.length > 0
                ? () =>
                    onToggleHighlight(
                      `signal:${signal.key}`,
                      signal.cards.map((card) => card.id),
                    )
                : undefined
            }
            signal={signal}
          />
        ))}
      </ul>
    </section>
  )
}

function SignalRow({
  highlighted,
  onToggleHighlight,
  signal,
}: {
  highlighted: boolean
  onToggleHighlight?: () => void
  signal: DeckHealthSignal
}) {
  const limitHit =
    (signal.key === "gameChangers" && signal.count > 0) ||
    (signal.key === "massLandDenial" && signal.count > 0) ||
    (signal.key === "extraTurns" && signal.count > 1)

  return (
    <li
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-box border bg-base-100 px-3 py-3 transition",
        highlighted ? "border-primary/50" : "border-base-300",
      )}
      aria-label={`${signal.label}: ${signal.count}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-black text-base-content">{signal.label}</h4>
          <p className="text-xs font-semibold text-base-content/55">{signal.description}</p>
        </div>
        <span
          className={cn(
            "shrink-0 font-mono text-xl font-black leading-none tabular-nums",
            limitHit ? "text-warning" : "text-base-content",
          )}
        >
          {signal.count}
        </span>
      </div>
      {signal.cards.length > 0 ? (
        <div className="flex min-w-0 items-end justify-between gap-3">
          <p className="min-w-0 truncate text-xs text-base-content/60">
            {signal.cards.map((card) => card.name).join(", ")}
          </p>
          {onToggleHighlight ? (
            <HighlightButton active={highlighted} onClick={onToggleHighlight} />
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function ComboTile({
  highlighted,
  onOpenCombos,
  onToggleHighlight,
  state,
}: {
  highlighted: boolean
  onOpenCombos?: () => void
  onToggleHighlight?: () => void
  state: ComboTileState
}) {
  const loaded = state.kind === "loaded" ? state.combos : null

  return (
    <li
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-box border bg-base-100 px-3 py-3 transition",
        highlighted ? "border-primary/50" : "border-base-300",
      )}
      aria-label={
        loaded
          ? `Infinite combos: ${loaded.count}, ${loaded.twoCard} two-card`
          : state.kind === "error"
            ? "Infinite combos: Commander Spellbook unavailable"
            : "Infinite combos: checking Commander Spellbook"
      }
      aria-busy={state.kind === "loading"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 text-sm font-black text-base-content">
            <InfinityIcon aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
            Infinite combos
          </h4>
          <p className="text-xs font-semibold text-base-content/55">
            {loaded
              ? loaded.count === 0
                ? "Brackets 1–2 allow no two-card combos"
                : `${loaded.twoCard} two-card; brackets 1–2 allow none`
              : "Complete combos found by Commander Spellbook"}
          </p>
        </div>
        {loaded ? (
          <span
            className={cn(
              "shrink-0 font-mono text-xl font-black leading-none tabular-nums",
              loaded.twoCard > 0 ? "text-warning" : "text-base-content",
            )}
          >
            {loaded.count}
          </span>
        ) : (
          <span className="shrink-0 font-mono text-xl font-black leading-none text-base-content/30">
            –
          </span>
        )}
      </div>

      {state.kind === "loading" ? (
        <p className="text-xs text-base-content/60">Checking Commander Spellbook…</p>
      ) : null}

      {state.kind === "error" ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black text-error">Spellbook did not answer</p>
          <button
            type="button"
            onClick={state.retry}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border border-base-300 bg-base-100 px-2.5 py-1 text-xs font-black text-base-content/70 shadow-sm transition hover:border-primary/50 hover:text-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <RotateCw aria-hidden="true" className="h-3 w-3" />
            Retry
          </button>
        </div>
      ) : null}

      {loaded ? (
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-3 gap-y-2">
          <p className="min-w-[10rem] flex-1 truncate text-xs text-base-content/60">
            {loaded.cards.length > 0
              ? loaded.cards.map((card) => card.name).join(", ")
              : "None in the commander and mainboard"}
          </p>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {onToggleHighlight ? (
              <HighlightButton active={highlighted} onClick={onToggleHighlight} />
            ) : null}
            {onOpenCombos && loaded.count > 0 ? (
              <button
                type="button"
                onClick={onOpenCombos}
                className="shrink-0 cursor-pointer whitespace-nowrap rounded-full border border-primary/50 bg-primary px-2.5 py-1 text-xs font-black text-primary-content shadow-sm transition hover:bg-primary/90 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                View combos
              </button>
            ) : null}
          </span>
        </div>
      ) : null}
    </li>
  )
}

function HighlightButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-black shadow-sm transition focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-base-300 bg-base-100 text-base-content/70 hover:border-primary/50 hover:text-primary",
      )}
    >
      {active ? "Clear" : "Show cards"}
    </button>
  )
}
