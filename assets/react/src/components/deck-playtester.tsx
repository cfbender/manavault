import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Dices,
  EyeOff,
  Flame,
  Hand,
  RotateCcw,
  Shuffle,
  Skull,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  drawCards,
  exileFromLibrary,
  millCards,
  movePlaytestCard,
  mulliganPlaytest,
  shuffleLibrary,
  type PlaytestCard,
  type PlaytestState,
  type PlaytestZone,
} from "../lib/deck-playtest"
import { compactNumber } from "../lib/utils"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"

type DeckPlaytesterProps = {
  deckName: string
  initialState: PlaytestState
}

type CardAction = {
  label: string
  to: PlaytestZone
  icon?: LucideIcon
  placement?: "top" | "bottom"
}

const ZONE_LABELS: Record<PlaytestZone, string> = {
  battlefield: "Battlefield",
  command: "Command",
  exile: "Exile",
  graveyard: "Graveyard",
  hand: "Hand",
  library: "Library",
}

const ZONE_ACTIONS: Partial<Record<PlaytestZone, CardAction[]>> = {
  battlefield: [
    { icon: Hand, label: "Hand", to: "hand" },
    { icon: Skull, label: "Graveyard", to: "graveyard" },
    { icon: Flame, label: "Exile", to: "exile" },
  ],
  command: [
    { icon: Sparkles, label: "Cast", to: "battlefield" },
    { icon: Hand, label: "Hand", to: "hand" },
  ],
  exile: [
    { icon: Hand, label: "Hand", to: "hand" },
    { icon: Skull, label: "Graveyard", to: "graveyard" },
  ],
  graveyard: [
    { icon: Hand, label: "Hand", to: "hand" },
    { icon: Sparkles, label: "Battlefield", to: "battlefield" },
    { icon: Flame, label: "Exile", to: "exile" },
  ],
  hand: [
    { icon: Sparkles, label: "Play", to: "battlefield" },
    { icon: Skull, label: "Discard", to: "graveyard" },
    { icon: Flame, label: "Exile", to: "exile" },
    { icon: ArrowUpFromLine, label: "Top", placement: "top", to: "library" },
    { icon: ArrowDownToLine, label: "Bottom", placement: "bottom", to: "library" },
  ],
}

export function DeckPlaytester({ deckName, initialState }: DeckPlaytesterProps) {
  const [state, setState] = useState(initialState)

  useEffect(() => {
    setState(initialState)
  }, [initialState])
  const totalCards = useMemo(
    () =>
      state.library.length +
      state.hand.length +
      state.battlefield.length +
      state.graveyard.length +
      state.exile.length +
      state.command.length,
    [state],
  )

  function resetGame() {
    setState(initialState)
  }

  function moveCard(
    from: PlaytestZone,
    to: PlaytestZone,
    cardId: string,
    placement?: "top" | "bottom",
  ) {
    setState((current) => movePlaytestCard(current, from, to, cardId, placement))
  }

  return (
    <div className="space-y-5">
      <section className="rounded-box border border-base-300 bg-base-200 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Playtest</p>
            <h1 className="mt-1 text-3xl font-black tracking-normal">{deckName}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="primary">{compactNumber(totalCards)} cards</Badge>
              <Badge tone="neutral">Hand {state.hand.length}</Badge>
              <Badge tone="neutral">Library {state.library.length}</Badge>
              {state.mulligans > 0 ? (
                <Badge tone="warning">{state.mulligans} mulligans</Badge>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              onClick={() => setState((current) => drawCards(current, 1))}
              disabled={state.library.length === 0}
            >
              <Hand className="h-4 w-4" />
              Draw
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setState((current) => drawCards(current, 7))}
              disabled={state.library.length === 0}
            >
              Draw 7
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setState((current) => mulliganPlaytest(current))}
              disabled={totalCards === state.command.length}
            >
              <Dices className="h-4 w-4" />
              Mulligan
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setState((current) => shuffleLibrary(current))}
              disabled={state.library.length < 2}
            >
              <Shuffle className="h-4 w-4" />
              Shuffle
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setState((current) => millCards(current, 1))}
              disabled={state.library.length === 0}
            >
              Mill 1
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setState((current) => exileFromLibrary(current, 1))}
              disabled={state.library.length === 0}
            >
              Exile top
            </Button>
            <Button type="button" variant="ghost" onClick={resetGame}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="space-y-5">
          <PlaytestZonePanel cards={state.hand} from="hand" title="Hand" onMove={moveCard} />
          <PlaytestZonePanel
            cards={state.battlefield}
            from="battlefield"
            title="Battlefield"
            onMove={moveCard}
          />
        </main>
        <aside className="space-y-5">
          <HiddenLibraryPanel count={state.library.length} />
          <PlaytestZonePanel
            cards={state.command}
            compact
            from="command"
            title="Command"
            onMove={moveCard}
          />
          <PlaytestZonePanel
            cards={state.graveyard}
            compact
            from="graveyard"
            title="Graveyard"
            onMove={moveCard}
          />
          <PlaytestZonePanel
            cards={state.exile}
            compact
            from="exile"
            title="Exile"
            onMove={moveCard}
          />
        </aside>
      </div>
    </div>
  )
}

function HiddenLibraryPanel({ count }: { count: number }) {
  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Library</h2>
          <p className="text-sm text-base-content/60">Hidden zone</p>
        </div>
        <div className="flex h-16 w-12 items-center justify-center rounded-lg border border-base-300 bg-base-200 text-base-content/50 shadow-inner">
          <EyeOff className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-black">{count}</p>
    </section>
  )
}

function PlaytestZonePanel({
  cards,
  compact = false,
  from,
  onMove,
  title,
}: {
  cards: PlaytestCard[]
  compact?: boolean
  from: PlaytestZone
  onMove: (
    from: PlaytestZone,
    to: PlaytestZone,
    cardId: string,
    placement?: "top" | "bottom",
  ) => void
  title: string
}) {
  const actions = ZONE_ACTIONS[from] || []

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black">{title}</h2>
        <Badge tone={cards.length ? "primary" : "neutral"}>{cards.length}</Badge>
      </div>
      {cards.length ? (
        <div
          className={
            compact
              ? "grid gap-3"
              : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
          }
        >
          {cards.map((card) => (
            <PlaytestCardView
              key={card.id}
              actions={actions}
              card={card}
              compact={compact}
              from={from}
              onMove={onMove}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-6 text-center text-sm text-base-content/60">
          No cards in {title.toLowerCase()}.
        </div>
      )}
    </section>
  )
}

function PlaytestCardView({
  actions,
  card,
  compact,
  from,
  onMove,
}: {
  actions: CardAction[]
  card: PlaytestCard
  compact?: boolean
  from: PlaytestZone
  onMove: (
    from: PlaytestZone,
    to: PlaytestZone,
    cardId: string,
    placement?: "top" | "bottom",
  ) => void
}) {
  if (compact) {
    return (
      <div className="rounded-box border border-base-300 bg-base-200/45 p-3">
        <div className="flex gap-3">
          <CardThumb card={card} compact />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight">{card.name}</p>
            {card.typeLine ? (
              <p className="mt-1 line-clamp-2 text-xs text-base-content/60">{card.typeLine}</p>
            ) : null}
          </div>
        </div>
        <CardActionRow actions={actions} card={card} from={from} onMove={onMove} />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-box border border-base-300 bg-base-200/45 shadow-sm">
      <CardThumb card={card} />
      <div className="space-y-2 p-3">
        <div>
          <p className="line-clamp-2 font-bold leading-tight">{card.name}</p>
          {card.typeLine ? (
            <p className="mt-1 line-clamp-2 text-xs text-base-content/60">{card.typeLine}</p>
          ) : null}
        </div>
        <CardActionRow actions={actions} card={card} from={from} onMove={onMove} />
      </div>
    </div>
  )
}

function CardThumb({ card, compact = false }: { card: PlaytestCard; compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "h-20 w-14 shrink-0 overflow-hidden rounded-md bg-base-300"
          : "aspect-[5/7] overflow-hidden bg-base-300"
      }
    >
      {card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-base-content/50">
          {card.name}
        </div>
      )}
    </div>
  )
}

function CardActionRow({
  actions,
  card,
  from,
  onMove,
}: {
  actions: CardAction[]
  card: PlaytestCard
  from: PlaytestZone
  onMove: (
    from: PlaytestZone,
    to: PlaytestZone,
    cardId: string,
    placement?: "top" | "bottom",
  ) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={`${action.to}-${action.label}`}
            type="button"
            className="btn btn-outline btn-xs min-h-8 flex-1 px-2 text-[0.68rem]"
            title={`Move ${card.name} to ${ZONE_LABELS[action.to].toLowerCase()}`}
            onClick={() => onMove(from, action.to, card.id, action.placement)}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {action.label}
          </button>
        )
      })}
    </div>
  )
}
