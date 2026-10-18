import { Flame, Heart, Skull, Sparkles, X, type LucideIcon } from "lucide-react"
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AppearanceContext } from "./appearance"
import { defaultBattlefieldPosition } from "./battlefield-helpers"
import { CardStatusChips } from "./battlefield-view"
import { defaultCardStatus } from "./card-status"
import { CardThumb, SleeveBack } from "./card-thumb"
import {
  BATTLEFIELD_CARD_ASPECT_HEIGHT,
  BATTLEFIELD_CARD_WIDTH_REM,
  ZONE_LABELS,
} from "./constants"
import type { PlaytestCard, PlaytestZone } from "./engine"
import {
  isHiddenCard,
  type PublicPlaytestCard,
  type PublicPlaytestSnapshot,
} from "./public-snapshot"
import type { CardStatus, PlayerCounterKind, PlaytestAppearance } from "./types"
import { cn } from "./ui"

export type PlaytestSpectatorBoardProps = PlaytestAppearance & {
  className?: string
  /** Called when a viewer taps a face-up card, so the host can show it large. */
  onCardPreview?: (card: PlaytestCard, zone: PlaytestZone) => void
  /** Show life, turn, and player counters. Turn it off when the host already shows them. */
  showPlayerStats?: boolean
  snapshot: PublicPlaytestSnapshot
  /** Shown above the board, e.g. the player's name. */
  title?: ReactNode
}

// Battlefield positions are in the owner's CSS pixels; cards render at the default zoom.
const CARD_WIDTH = BATTLEFIELD_CARD_WIDTH_REM * 16
const CARD_HEIGHT = CARD_WIDTH * BATTLEFIELD_CARD_ASPECT_HEIGHT
const BOARD_PADDING = 12
const COUNTER_LABELS: Record<PlayerCounterKind, string> = {
  energy: "Energy",
  experience: "Experience",
  poison: "Poison",
}

type ViewedZone = "graveyard" | "exile" | "command"

/**
 * A read-only view of another player's board, built from a public snapshot. The battlefield scales
 * to fit its container, so it works in a small table tile or on a phone.
 */
export function PlaytestSpectatorBoard({
  className,
  manaSymbolUrl,
  onCardPreview,
  showPlayerStats = true,
  sleeveImageUrl,
  snapshot,
  title,
}: PlaytestSpectatorBoardProps) {
  const appearance = useMemo(
    () => ({ manaSymbolUrl, sleeveImageUrl }),
    [manaSymbolUrl, sleeveImageUrl],
  )
  const [viewedZone, setViewedZone] = useState<ViewedZone | null>(null)
  const activeCounters = (Object.keys(COUNTER_LABELS) as PlayerCounterKind[]).filter(
    (kind) => snapshot.playerCounters[kind] > 0,
  )

  return (
    <AppearanceContext.Provider value={appearance}>
      <section
        aria-label="Spectator board"
        className={cn(
          "relative flex h-full min-h-0 flex-col overflow-hidden bg-base-100 text-base-content",
          className,
        )}
      >
        {title || showPlayerStats || snapshot.openingHand ? (
          <header className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-base-300 px-3 py-1.5 text-xs">
            {title ? (
              <div className="min-w-0 flex-1 truncate text-sm font-black">{title}</div>
            ) : null}
            {snapshot.openingHand ? (
              <span className="badge badge-sm badge-outline">
                Choosing opening hand
                {snapshot.mulligans ? ` · ${snapshot.mulligans} mulligan` : ""}
                {snapshot.mulligans > 1 ? "s" : ""}
              </span>
            ) : null}
            {showPlayerStats ? (
              <div className="ml-auto flex items-center gap-3 font-bold text-base-content/70">
                <span className="flex items-center gap-1" aria-label={`${snapshot.lifeTotal} life`}>
                  <Heart className="h-3.5 w-3.5 fill-current text-primary" aria-hidden="true" />
                  <span
                    className={cn(
                      "font-mono text-sm font-black tabular-nums text-base-content",
                      snapshot.lifeTotal <= 10 && "text-error",
                    )}
                  >
                    {snapshot.lifeTotal}
                  </span>
                </span>
                <span>
                  Turn{" "}
                  <span className="font-mono text-sm font-black text-base-content">
                    {snapshot.turn}
                  </span>
                </span>
                {activeCounters.map((kind) => (
                  <span key={kind} className="badge badge-sm badge-outline font-mono">
                    {COUNTER_LABELS[kind]} {snapshot.playerCounters[kind]}
                  </span>
                ))}
              </div>
            ) : null}
          </header>
        ) : null}

        <SpectatorBattlefield snapshot={snapshot} onCardPreview={onCardPreview} />

        <footer className="grid grid-cols-5 items-end gap-1 border-t border-base-300 px-2 py-2 sm:gap-3 sm:px-3">
          <HandCount count={snapshot.handCount} />
          <PileSlot count={snapshot.libraryCount} title="Library">
            {snapshot.libraryCount ? (
              <span className="absolute inset-0 overflow-hidden rounded-md border border-black/30 shadow-md">
                <SleeveBack />
              </span>
            ) : null}
          </PileSlot>
          <VisiblePileButton
            cards={snapshot.graveyard}
            emptyIcon={Skull}
            onView={() => setViewedZone("graveyard")}
            title="Graveyard"
          />
          <VisiblePileButton
            cards={snapshot.exile}
            emptyIcon={Flame}
            onView={() => setViewedZone("exile")}
            title="Exile"
          />
          <VisiblePileButton
            cards={snapshot.command}
            emptyIcon={Sparkles}
            onView={() => setViewedZone("command")}
            title="Command"
          />
        </footer>

        {viewedZone ? (
          <ZoneSheet
            cards={snapshot[viewedZone]}
            onCardPreview={onCardPreview && ((card) => onCardPreview(card, viewedZone))}
            onClose={() => setViewedZone(null)}
            title={ZONE_LABELS[viewedZone]}
          />
        ) : null}
      </section>
    </AppearanceContext.Provider>
  )
}

function SpectatorBattlefield({
  onCardPreview,
  snapshot,
}: {
  onCardPreview?: (card: PlaytestCard, zone: PlaytestZone) => void
  snapshot: PublicPlaytestSnapshot
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [container, setContainer] = useState({ height: 0, width: 0 })
  const tapped = useMemo(() => new Set(snapshot.tappedCardIds), [snapshot.tappedCardIds])
  const placed = snapshot.battlefield.map((card, index) => ({
    card,
    position: snapshot.battlefieldCardPositions[card.id] || defaultBattlefieldPosition(index),
  }))

  // Fit the occupied part of the board. Tapped cards turn about their centre, so every card gets
  // room for its sideways footprint.
  const overhang = (CARD_HEIGHT - CARD_WIDTH) / 2
  const xs = placed.map(({ position }) => position.x)
  const ys = placed.map(({ position }) => position.y)
  const left = placed.length ? Math.min(...xs) - overhang - BOARD_PADDING : 0
  const top = placed.length ? Math.min(...ys) - BOARD_PADDING : 0
  const width = placed.length ? Math.max(...xs) + CARD_WIDTH + overhang + BOARD_PADDING - left : 0
  const height = placed.length ? Math.max(...ys) + CARD_HEIGHT + BOARD_PADDING - top : 0
  const scale =
    width && height && container.width && container.height
      ? Math.min(1, container.width / width, container.height / height)
      : 1

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    const measure = () => setContainer({ height: element.clientHeight, width: element.clientWidth })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      aria-label={`Battlefield, ${snapshot.battlefield.length} cards`}
      className="relative min-h-40 flex-1 overflow-hidden bg-base-200 bg-[radial-gradient(ellipse_at_50%_35%,color-mix(in_oklch,var(--color-base-100),transparent_45%),transparent_70%)] shadow-[inset_0_2px_10px_rgb(0_0_0/0.12)]"
      role="region"
    >
      {placed.length ? (
        <ul
          className="absolute left-1/2 top-1/2 origin-center"
          style={{
            height,
            transform: `translate(-50%, -50%) scale(${scale})`,
            width,
          }}
        >
          {/* Newest cards sit at the front of the zone; render them last so they stack on top. */}
          {[...placed].reverse().map(({ card, position }) => (
            <li
              key={card.id}
              className="absolute"
              style={{ left: position.x - left, top: position.y - top, width: CARD_WIDTH }}
            >
              <SpectatorCard
                card={card}
                onPreview={onCardPreview && ((visible) => onCardPreview(visible, "battlefield"))}
                status={snapshot.cardStatuses[card.id] || defaultCardStatus()}
                tapped={tapped.has(card.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-base-content/50">
          No permanents yet.
        </p>
      )}
    </div>
  )
}

function SpectatorCard({
  card,
  onPreview,
  status,
  tapped,
}: {
  card: PublicPlaytestCard
  onPreview?: (card: PlaytestCard) => void
  status: CardStatus
  tapped: boolean
}) {
  const hidden = isHiddenCard(card)
  const label = hidden ? "Face-down card" : card.name
  const face = (
    <>
      <span
        className={cn(
          "relative block overflow-hidden rounded-lg border border-black/30 bg-base-300",
          tapped && "brightness-[0.82]",
        )}
      >
        {hidden ? (
          <span className="block aspect-[5/7]">
            <SleeveBack />
          </span>
        ) : (
          <CardThumb card={card} faceDown={status.faceDown} />
        )}
      </span>
      <CardStatusChips status={status} />
    </>
  )
  const className = cn(
    "relative block w-full rounded-lg shadow-[0_3px_8px_rgb(0_0_0/0.28)] transition-transform duration-150 ease-out",
    tapped && "rotate-90",
  )

  if (hidden || !onPreview) {
    return (
      <span className={className} aria-label={`${label}${tapped ? ", tapped" : ""}`} role="img">
        {face}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={cn(
        className,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      )}
      aria-label={`Preview ${label}${tapped ? ", tapped" : ""}`}
      onClick={() => onPreview(card)}
    >
      {face}
    </button>
  )
}

const PILE_CARD = "relative aspect-[5/7] w-10 sm:w-14"

function PileSlot({
  children,
  count,
  title,
}: {
  children?: ReactNode
  count: number
  title: string
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <div
        className={cn(
          PILE_CARD,
          !count && "rounded-md border border-dashed border-base-content/20",
        )}
      >
        {children}
      </div>
      <ZoneCount count={count} title={title} />
    </div>
  )
}

function ZoneCount({ count, title }: { count: number; title: string }) {
  return (
    <span className="flex min-w-0 max-w-full flex-col items-center text-[0.7rem] font-bold leading-tight sm:flex-row sm:gap-1 sm:text-xs">
      <span className="max-w-full truncate text-base-content/70">{title}</span>
      <span className="font-mono font-black tabular-nums">{count}</span>
    </span>
  )
}

function HandCount({ count }: { count: number }) {
  const shown = Math.min(count, 5)

  return (
    <div className="flex min-w-0 flex-col items-center gap-1" aria-label={`Hand, ${count} cards`}>
      <div className={cn(PILE_CARD, "flex justify-center")}>
        {Array.from({ length: shown }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden rounded-md border border-black/30 shadow-sm"
            style={{
              transform: `rotate(${(index - (shown - 1) / 2) * 8}deg)`,
              transformOrigin: "50% 120%",
            }}
          >
            <SleeveBack />
          </span>
        ))}
        {count === 0 ? (
          <span className="absolute inset-0 rounded-md border border-dashed border-base-content/20" />
        ) : null}
      </div>
      <ZoneCount count={count} title="Hand" />
    </div>
  )
}

function VisiblePileButton({
  cards,
  emptyIcon: EmptyIcon,
  onView,
  title,
}: {
  cards: PublicPlaytestCard[]
  emptyIcon: LucideIcon
  onView: () => void
  title: string
}) {
  const top = cards[0]

  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      {top ? (
        <button
          type="button"
          className={cn(
            PILE_CARD,
            "overflow-hidden rounded-md border border-black/25 bg-base-200 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
          aria-label={`${title}, ${cards.length} cards. View all`}
          onClick={onView}
        >
          {isHiddenCard(top) ? <SleeveBack /> : <CardThumb card={top} />}
        </button>
      ) : (
        <div
          className={cn(
            PILE_CARD,
            "flex items-center justify-center rounded-md border border-dashed border-base-content/20 text-base-content/35",
          )}
          aria-label={`${title} is empty`}
        >
          <EmptyIcon className="h-4 w-4" />
        </div>
      )}
      <ZoneCount count={cards.length} title={title} />
    </div>
  )
}

function ZoneSheet({
  cards,
  onCardPreview,
  onClose,
  title,
}: {
  cards: PublicPlaytestCard[]
  onCardPreview?: (card: PlaytestCard) => void
  onClose: () => void
  title: string
}) {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col bg-base-100 motion-safe:animate-[playtest-fade_120ms_ease-out]"
      role="dialog"
      aria-label={`${title}, ${cards.length} cards`}
    >
      <header className="flex items-center gap-2 border-b border-base-300 px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-black">
          {title} <span className="font-mono text-base-content/60">{cards.length}</span>
        </h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-square"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <ol className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] content-start gap-2 overflow-y-auto p-3">
        {cards.map((card) => (
          <li key={card.id}>
            {isHiddenCard(card) || !onCardPreview ? (
              <span className="block overflow-hidden rounded-md border border-black/25 shadow-sm">
                {isHiddenCard(card) ? (
                  <span className="block aspect-[5/7]">
                    <SleeveBack />
                  </span>
                ) : (
                  <CardThumb card={card} />
                )}
              </span>
            ) : (
              <button
                type="button"
                className="block w-full overflow-hidden rounded-md border border-black/25 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Preview ${card.name}`}
                onClick={() => onCardPreview(card)}
              >
                <CardThumb card={card} />
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
