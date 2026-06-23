import { Dices, RotateCcw, Sparkles } from "lucide-react"
import { useState } from "react"
import type { PlaytestCard, PlaytestZone } from "../../lib/deck-playtest"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { CardThumb } from "./card-thumb"
import { PEEK_LIBRARY_ACTIONS } from "./constants"
import type { PeekMode, TokenFormValues } from "./types"

export function OpeningHandOverlay({
  hand,
  mulligans,
  onCardHover,
  onCardLeave,
  onKeep,
  onMulligan,
  onNewHand,
}: {
  hand: PlaytestCard[]
  mulligans: number
  onCardHover: (cardId: string, zone: PlaytestZone) => void
  onCardLeave: (cardId: string) => void
  onKeep: () => void
  onMulligan: () => void
  onNewHand: () => void
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm">
      <section className="w-full max-w-6xl rounded-box border border-base-300 bg-base-100/95 p-5 shadow-2xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black">Opening Hand</h2>
            <p className="text-sm text-base-content/55">
              Press <kbd className="kbd kbd-xs">Enter</kbd> to keep ·{" "}
              <kbd className="kbd kbd-xs">M</kbd> to mulligan
            </p>
          </div>
          <Badge tone={mulligans > 0 ? "warning" : "neutral"}>
            {mulligans
              ? `${mulligans} mulligan${mulligans === 1 ? "" : "s"}`
              : "Free mulligan available"}
          </Badge>
        </div>
        <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
          {hand.map((card) => (
            <div
              key={card.id}
              className="w-36 shrink-0 overflow-hidden rounded-lg border border-base-300 bg-base-200 shadow-xl"
              onMouseEnter={() => onCardHover(card.id, "hand")}
              onMouseLeave={() => onCardLeave(card.id)}
              onFocus={() => onCardHover(card.id, "hand")}
              onBlur={() => onCardLeave(card.id)}
            >
              <CardThumb card={card} />
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" variant="outline" onClick={onMulligan}>
            <Dices className="h-4 w-4" />
            Mulligan
          </Button>
          <Button type="button" onClick={onKeep}>
            <Sparkles className="h-4 w-4" />
            Keep Hand
          </Button>
          <Button type="button" variant="ghost" onClick={onNewHand}>
            <RotateCcw className="h-4 w-4" />
            New Hand
          </Button>
        </div>
      </section>
    </div>
  )
}

export function HoverCardPreview({ card }: { card: PlaytestCard }) {
  return (
    <aside className="pointer-events-none fixed bottom-44 right-4 z-40 w-56 rounded-box border border-primary/40 bg-base-100/95 p-2 shadow-2xl shadow-black/45 backdrop-blur lg:right-60 lg:w-64">
      <div className="overflow-hidden rounded-lg border border-base-300 bg-base-200">
        <CardThumb card={card} />
      </div>
      <div className="px-1 pb-1 pt-2">
        <p className="line-clamp-2 text-sm font-black leading-tight">{card.name}</p>
        {card.typeLine ? (
          <p className="mt-1 line-clamp-2 text-xs text-base-content/60">{card.typeLine}</p>
        ) : null}
      </div>
    </aside>
  )
}

export function CreateTokenDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (values: TokenFormValues) => void
}) {
  const [name, setName] = useState("Token")
  const [typeLine, setTypeLine] = useState("Token Creature")
  const [power, setPower] = useState("")
  const [toughness, setToughness] = useState("")

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <form
        aria-labelledby="create-token-title"
        aria-modal="true"
        className="w-full max-w-sm rounded-box border border-base-300 bg-base-100 p-4 shadow-2xl"
        role="dialog"
        onSubmit={(event) => {
          event.preventDefault()
          onCreate({
            name: name.trim() || "Token",
            power: power.trim(),
            toughness: toughness.trim(),
            typeLine: typeLine.trim() || "Token Creature",
          })
        }}
      >
        <h2 id="create-token-title" className="text-lg font-black">
          Create Token
        </h2>
        <div className="mt-4 space-y-3">
          <label className="form-control">
            <span className="label-text">Name</span>
            <input
              className="input input-bordered input-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </label>
          <label className="form-control">
            <span className="label-text">Type line</span>
            <input
              className="input input-bordered input-sm"
              value={typeLine}
              onChange={(event) => setTypeLine(event.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="form-control">
              <span className="label-text">Power</span>
              <input
                className="input input-bordered input-sm"
                value={power}
                onChange={(event) => setPower(event.target.value)}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Toughness</span>
              <input
                className="input input-bordered input-sm"
                value={toughness}
                onChange={(event) => setToughness(event.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Create
          </Button>
        </div>
      </form>
    </div>
  )
}

export function PeekOverlay({
  cards,
  mode,
  onCardHover,
  onCardLeave,
  onClose,
  onMoveCard,
}: {
  cards: PlaytestCard[]
  mode: PeekMode
  onCardHover?: (cardId: string, zone: PlaytestZone) => void
  onCardLeave?: (cardId: string) => void
  onClose: () => void
  onMoveCard: (cardId: string, to: PlaytestZone, placement?: "top" | "bottom") => void
}) {
  const isActionMode = mode === "Scry" || mode === "Surveil"
  const hasDestinationActions = mode === "Library" || mode === "Look"
  const cardListClassName = isActionMode
    ? "mt-5 flex gap-3 overflow-x-auto pb-2"
    : "mt-5 grid max-h-[70vh] grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 overflow-y-auto pr-1"
  const cardFrameClassName = isActionMode
    ? "w-36 shrink-0 overflow-hidden rounded-lg border border-base-300 bg-base-200 shadow-xl"
    : "min-w-0 overflow-hidden rounded-lg border border-base-300 bg-base-200 shadow-xl"
  const summary =
    mode === "Library"
      ? `${cards.length} card${cards.length === 1 ? "" : "s"} in library`
      : cards.length
        ? `Top ${cards.length} card${cards.length === 1 ? "" : "s"} of library`
        : "Library is empty"
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-5 backdrop-blur-sm">
      <section className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-box border border-base-300 bg-base-100/95 p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">{mode === "Library" ? "Library" : mode}</h2>
            <p className="text-sm text-base-content/55">{summary}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className={cardListClassName}>
          {cards.map((card) => (
            <div
              key={card.id}
              className={cardFrameClassName}
              onBlur={() => onCardLeave?.(card.id)}
              onFocus={() => onCardHover?.(card.id, "library")}
              onMouseEnter={() => onCardHover?.(card.id, "library")}
              onMouseLeave={() => onCardLeave?.(card.id)}
            >
              <CardThumb card={card} />
              {mode === "Scry" ? (
                <div className="grid grid-cols-2 gap-1 p-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onMoveCard(card.id, "library", "bottom")}
                  >
                    Bottom
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                    Keep
                  </Button>
                </div>
              ) : null}
              {mode === "Surveil" ? (
                <div className="grid grid-cols-2 gap-1 p-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onMoveCard(card.id, "graveyard")}
                  >
                    Grave
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                    Keep
                  </Button>
                </div>
              ) : null}
              {hasDestinationActions ? (
                <div className="grid grid-cols-2 gap-1 p-2">
                  {PEEK_LIBRARY_ACTIONS.map((action) => {
                    const Icon = action.icon

                    return (
                      <button
                        key={action.to}
                        type="button"
                        className="btn btn-xs btn-ghost min-h-7 justify-start gap-1.5 px-2 text-[0.65rem] font-black"
                        onClick={() => {
                          onCardLeave?.(card.id)
                          onMoveCard(card.id, action.to)
                        }}
                        aria-label={`${action.title} ${card.name}`}
                        title={action.title}
                      >
                        <Icon className="h-3 w-3 shrink-0 text-base-content/50" />
                        <span className="min-w-0 flex-1 truncate text-left">{action.label}</span>
                        <kbd className="kbd kbd-xs hidden px-1 sm:inline-flex">
                          {action.shortcut}
                        </kbd>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
