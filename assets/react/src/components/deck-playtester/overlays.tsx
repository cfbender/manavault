import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Flame,
  Hand,
  RotateCw,
  Search,
  Shuffle,
  Skull,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { LibraryTopDecision, PlaytestCard, PlaytestZone } from "../../lib/deck-playtest"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { isLandCard } from "./battlefield-helpers"
import { CardThumb } from "./card-thumb"
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
  const landCount = hand.filter(isLandCard).length
  const nextHandSize = Math.max(hand.length - (mulligans === 0 ? 0 : 1), 0)

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/55 p-3 sm:p-6">
      <section
        aria-labelledby="opening-hand-title"
        className="w-full max-w-5xl rounded-box border border-base-300 bg-base-100 p-4 shadow-2xl sm:p-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h2 id="opening-hand-title" className="text-xl font-black">
              Opening hand
            </h2>
            <p className="mt-1 text-sm text-base-content/70">
              <span className="font-mono font-bold text-base-content">{hand.length}</span> cards ·{" "}
              <span className="font-mono font-bold text-base-content">{landCount}</span>{" "}
              {landCount === 1 ? "land" : "lands"}
              {mulligans ? (
                <>
                  {" "}
                  · {mulligans} {mulligans === 1 ? "mulligan" : "mulligans"} taken
                </>
              ) : null}
            </p>
          </div>
          <p className="text-sm text-base-content/60">
            {mulligans === 0 ? "First mulligan is free." : `Next mulligan draws ${nextHandSize}.`}
          </p>
        </div>

        <ol className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3">
          {hand.map((card, index) => (
            <li
              key={card.id}
              className="overflow-hidden rounded-lg border border-black/25 bg-base-200 shadow-[0_4px_12px_rgb(0_0_0/0.25)] motion-safe:animate-[playtest-deal_260ms_ease-out_both]"
              style={{ animationDelay: `${index * 40}ms` }}
              data-playtest-card={card.id}
              onMouseEnter={() => onCardHover(card.id, "hand")}
              onMouseLeave={() => onCardLeave(card.id)}
            >
              <CardThumb card={card} />
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="ghost" onClick={onNewHand} className="sm:mr-auto">
            <RotateCw className="h-4 w-4" />
            Restart
          </Button>
          <Button type="button" variant="outline" onClick={onMulligan}>
            Mulligan
            <kbd className="kbd kbd-xs">M</kbd>
          </Button>
          <Button type="button" onClick={onKeep} autoFocus>
            Keep {hand.length}
            <kbd className="kbd kbd-xs border-primary-content/30 bg-transparent text-primary-content">
              Enter
            </kbd>
          </Button>
        </div>
      </section>
    </div>
  )
}

export function HoverCardPreview({ card, side }: { card: PlaytestCard; side: "left" | "right" }) {
  return (
    <aside
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-3 z-40 hidden w-60 overflow-hidden rounded-[0.85rem] border border-black/30 bg-base-300 shadow-[0_18px_40px_rgb(0_0_0/0.45)] motion-safe:animate-[playtest-fade_120ms_ease-out] md:block xl:w-64",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <CardThumb card={card} />
    </aside>
  )
}

const TOKEN_PRESETS: TokenFormValues[] = [
  { name: "Treasure", power: "", toughness: "", typeLine: "Token Artifact — Treasure" },
  { name: "Clue", power: "", toughness: "", typeLine: "Token Artifact — Clue" },
  { name: "Food", power: "", toughness: "", typeLine: "Token Artifact — Food" },
  { name: "Soldier", power: "1", toughness: "1", typeLine: "Token Creature — Soldier" },
  { name: "Zombie", power: "2", toughness: "2", typeLine: "Token Creature — Zombie" },
  { name: "Beast", power: "3", toughness: "3", typeLine: "Token Creature — Beast" },
]

export function CreateTokenDialog({
  deckTokens = [],
  onCancel,
  onCreate,
}: {
  deckTokens?: TokenFormValues[]
  onCancel: () => void
  onCreate: (values: TokenFormValues) => void
}) {
  const deckTokenNames = new Set(deckTokens.map((token) => token.name.toLowerCase()))
  const presets = TOKEN_PRESETS.filter((preset) => !deckTokenNames.has(preset.name.toLowerCase()))
  const [name, setName] = useState("Token")
  const [typeLine, setTypeLine] = useState("Token Creature")
  const [power, setPower] = useState("")
  const [toughness, setToughness] = useState("")

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4">
      <form
        aria-labelledby="create-token-title"
        aria-modal="true"
        className="w-full max-w-sm rounded-box border border-base-300 bg-base-100 p-5 shadow-2xl"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel()
        }}
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
          Create token
        </h2>
        {deckTokens.length ? (
          <section className="mt-3" aria-labelledby="deck-tokens-title">
            <h3 id="deck-tokens-title" className="text-xs font-bold text-base-content/70">
              Made by this deck
            </h3>
            <ul className="mt-1.5 grid max-h-64 grid-cols-4 gap-2 overflow-y-auto">
              {deckTokens.map((token) => (
                <li key={`${token.name}-${token.imageUrl || token.typeLine}`}>
                  <button
                    type="button"
                    className="group w-full text-left focus-visible:outline-none"
                    onClick={() => onCreate(token)}
                    title={`Create ${token.name}${token.typeLine ? ` (${token.typeLine})` : ""}`}
                  >
                    <span className="block overflow-hidden rounded-md border border-black/25 shadow-sm transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-primary">
                      <CardThumb
                        card={{
                          deckCardId: "playtest-token",
                          id: token.name,
                          imageUrl: token.imageUrl,
                          name: token.name,
                          typeLine: token.typeLine,
                        }}
                      />
                    </span>
                    <span className="mt-1 block truncate text-xs font-bold">
                      {token.name}
                      {token.power ? (
                        <span className="ml-1 font-mono text-base-content/60">
                          {token.power}/{token.toughness}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Common tokens">
          {presets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => onCreate(preset)}
            >
              {preset.name}
              {preset.power ? (
                <span className="font-mono text-base-content/60">
                  {preset.power}/{preset.toughness}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-3 border-t border-base-300 pt-4">
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
                className="input input-bordered input-sm font-mono"
                value={power}
                onChange={(event) => setPower(event.target.value)}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Toughness</span>
              <input
                className="input input-bordered input-sm font-mono"
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

type ViewerAction = {
  icon: LucideIcon
  label: string
  placement?: "top" | "bottom"
  to: PlaytestZone
}

const VIEWER_ACTIONS: ViewerAction[] = [
  { icon: Hand, label: "Hand", to: "hand" },
  { icon: Sparkles, label: "Battlefield", to: "battlefield" },
  { icon: Skull, label: "Graveyard", to: "graveyard" },
  { icon: Flame, label: "Exile", to: "exile" },
  { icon: ArrowUpFromLine, label: "Top of library", placement: "top", to: "library" },
  { icon: ArrowDownToLine, label: "Bottom of library", placement: "bottom", to: "library" },
]

const MODE_ZONE: Record<PeekMode, PlaytestZone> = {
  Exile: "exile",
  Graveyard: "graveyard",
  Library: "library",
  Look: "library",
  Scry: "library",
  Surveil: "library",
}

export function PeekOverlay({
  cards,
  mode,
  onCardHover,
  onCardLeave,
  onClose,
  onMoveAll,
  onMoveCard,
  onResolve,
  onShuffle,
}: {
  cards: PlaytestCard[]
  mode: PeekMode
  onCardHover?: (cardId: string, zone: PlaytestZone) => void
  onCardLeave?: (cardId: string) => void
  onClose: () => void
  onMoveAll: (from: PlaytestZone, to: PlaytestZone, options?: { shuffle?: boolean }) => void
  onMoveCard: (
    cardId: string,
    from: PlaytestZone,
    to: PlaytestZone,
    placement?: "top" | "bottom",
  ) => void
  onResolve: (decisions: Record<string, LibraryTopDecision>, mode: PeekMode) => void
  onShuffle: () => void
}) {
  const zone = MODE_ZONE[mode]
  const isDecisionMode = mode === "Scry" || mode === "Surveil"
  const [query, setQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const [decisions, setDecisions] = useState<Record<string, LibraryTopDecision>>({})
  const alternate: LibraryTopDecision = mode === "Scry" ? "bottom" : "graveyard"

  useEffect(() => {
    // Deferred so it wins over the library menu restoring focus to its trigger.
    if (mode !== "Library") return
    const timeout = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(timeout)
  }, [mode])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  const visibleCards = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return cards
    return cards.filter((card) =>
      `${card.name} ${card.typeLine || ""}`.toLowerCase().includes(needle),
    )
  }, [cards, query])

  const title = {
    Exile: "Exile",
    Graveyard: "Graveyard",
    Library: "Search library",
    Look: `Top ${cards.length} of library`,
    Scry: `Scry ${cards.length}`,
    Surveil: `Surveil ${cards.length}`,
  }[mode]
  const summary = isDecisionMode
    ? `Choose where each card goes. Cards you keep stay on top in this order.`
    : mode === "Library"
      ? `${cards.length} cards, top first. Shuffle when you're done searching.`
      : mode === "Look"
        ? "Top card first."
        : `${cards.length} ${cards.length === 1 ? "card" : "cards"}, newest first.`
  const actions = VIEWER_ACTIONS.filter((action) => zone === "library" || action.to !== zone)

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-2 sm:p-5"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {/* A div, not a section: the glass theme style would make dense card grids translucent. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="peek-title"
        className="flex max-h-full w-full max-w-6xl flex-col rounded-box border border-base-300 bg-base-100 shadow-2xl"
      >
        <header className="flex flex-wrap items-start gap-3 border-b border-base-300 p-4">
          <div className="min-w-0 flex-1">
            <h2 id="peek-title" className="text-lg font-black">
              {title}
            </h2>
            <p className="text-sm text-base-content/70">{summary}</p>
          </div>
          {mode === "Library" ||
          ((mode === "Graveyard" || mode === "Exile") && cards.length > 6) ? (
            <label className="input input-sm input-bordered flex w-full items-center gap-2 sm:w-64">
              <Search className="h-4 w-4 text-base-content/50" />
              <input
                type="search"
                className="min-w-0 grow"
                placeholder="Filter by name or type"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                ref={searchRef}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto p-4">
          {visibleCards.length === 0 ? (
            <p className="py-10 text-center text-sm text-base-content/60">
              {cards.length === 0 ? "Nothing here yet." : `No cards match "${query}".`}
            </p>
          ) : (
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
              {visibleCards.map((card, index) => {
                const decision = decisions[card.id] || "top"
                return (
                  <li
                    key={card.id}
                    className="min-w-0"
                    data-playtest-card={card.id}
                    onMouseEnter={() => onCardHover?.(card.id, zone)}
                    onMouseLeave={() => onCardLeave?.(card.id)}
                  >
                    <div
                      className={cn(
                        "relative overflow-hidden rounded-lg border border-black/25 bg-base-200 shadow-[0_3px_8px_rgb(0_0_0/0.22)] transition-opacity",
                        isDecisionMode && decision !== "top" && "opacity-45",
                        !isDecisionMode && "cursor-pointer",
                      )}
                      title={
                        isDecisionMode ? undefined : "Double-click to put onto the battlefield"
                      }
                      onDoubleClick={
                        isDecisionMode
                          ? undefined
                          : () => {
                              onCardLeave?.(card.id)
                              onMoveCard(card.id, zone, "battlefield")
                            }
                      }
                    >
                      <CardThumb card={card} />
                      {isDecisionMode || mode === "Look" ? (
                        <span className="absolute left-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-xs font-black text-white">
                          {index + 1}
                        </span>
                      ) : null}
                    </div>
                    {isDecisionMode ? (
                      <div
                        className="mt-1.5 grid grid-cols-2 rounded-field border border-base-300 p-0.5"
                        role="radiogroup"
                        aria-label={`Where should ${card.name} go`}
                      >
                        {(["top", alternate] as LibraryTopDecision[]).map((choice) => (
                          <button
                            key={choice}
                            type="button"
                            role="radio"
                            aria-checked={decision === choice}
                            className={cn(
                              "h-8 rounded-[3px] text-xs font-bold text-base-content/70 hover:text-base-content",
                              decision === choice &&
                                "bg-primary text-primary-content hover:text-primary-content",
                            )}
                            onClick={() =>
                              setDecisions((current) => ({ ...current, [card.id]: choice }))
                            }
                          >
                            {choice === "top" ? "Keep" : choice === "bottom" ? "Bottom" : "Grave"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1.5 flex justify-between gap-0.5">
                        {actions.map((action) => {
                          const Icon = action.icon
                          return (
                            <button
                              key={action.label}
                              type="button"
                              className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-field text-base-content/65 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              onClick={() => {
                                onCardLeave?.(card.id)
                                onMoveCard(card.id, zone, action.to, action.placement)
                              }}
                              aria-label={`${action.label}: ${card.name}`}
                              title={action.label}
                            >
                              <Icon className="h-4 w-4" />
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        {isDecisionMode ||
        mode === "Library" ||
        ((mode === "Graveyard" || mode === "Exile") && cards.length > 0) ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-base-300 p-3">
            {mode === "Graveyard" || mode === "Exile" ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="sm:mr-auto"
                  onClick={() => onMoveAll(zone, "library", { shuffle: true })}
                >
                  <Shuffle className="h-4 w-4" />
                  Shuffle into library
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onMoveAll(zone, "hand")}
                >
                  <Hand className="h-4 w-4" />
                  All to hand
                </Button>
              </>
            ) : null}
            {mode === "Library" ? (
              <Button type="button" variant="outline" size="sm" onClick={onShuffle}>
                <Shuffle className="h-4 w-4" />
                Shuffle and close
              </Button>
            ) : null}
            {isDecisionMode ? (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  onResolve(
                    Object.fromEntries(cards.map((card) => [card.id, decisions[card.id] || "top"])),
                    mode,
                  )
                }
              >
                Confirm
              </Button>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>
  )
}
