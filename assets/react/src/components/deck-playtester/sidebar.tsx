import {
  Dices,
  Eye,
  EyeOff,
  Flame,
  Hand,
  Library,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  Skull,
  Sparkles,
  Swords,
  Undo2,
  type LucideIcon,
} from "lucide-react"
import type { PlaytestCard, PlaytestZone } from "../../lib/deck-playtest"
import { Button } from "../ui/button"
import { CardThumb } from "./card-thumb"
import { ZONE_ACTIONS, ZONE_LABELS } from "./constants"
import type { CardStatus } from "./types"

export function PlaytestSidebar({
  actionCount,
  canUndo,
  lastAction,
  libraryCount,
  lifeTotal,
  onActionCountChange,
  onCreateToken,
  onDiceAndCoin,
  onDraw,
  onExile,
  onLibrary,
  onLifeChange,
  onLook,
  onMill,
  onMove,
  onNewGame,
  onNextTurn,
  onScry,
  onShuffle,
  onSurveil,
  onTapSelected,
  onUndo,
  onUntapAll,
  selectedCard,
  selectedStatus,
  selectedZone,
  tapped,
}: {
  actionCount: number
  canUndo: boolean
  lastAction: string
  libraryCount: number
  lifeTotal: number
  onActionCountChange: (count: number) => void
  onCreateToken: () => void
  onDiceAndCoin: () => void
  onDraw: (count?: number) => void
  onExile: (count?: number) => void
  onLibrary: () => void
  onLifeChange: (delta: number) => void
  onLook: () => void
  onMill: (count?: number) => void
  onMove: (
    from: PlaytestZone,
    to: PlaytestZone,
    cardId: string,
    placement?: "top" | "bottom",
  ) => void
  onNewGame: () => void
  onNextTurn: () => void
  onScry: () => void
  onShuffle: () => void
  onSurveil: () => void
  onTapSelected?: () => void
  onUndo: () => void
  onUntapAll: () => void
  selectedCard: PlaytestCard | null
  selectedStatus: CardStatus | null
  selectedZone: PlaytestZone | null
  tapped: boolean
}) {
  const selectedActions = selectedZone ? ZONE_ACTIONS[selectedZone] || [] : []

  return (
    <aside className="row-start-2 hidden min-h-0 flex-col gap-1.5 overflow-y-auto border-l border-base-300 bg-base-100/90 p-2 shadow-2xl lg:col-start-2 lg:flex">
      <div className="rounded-box border border-primary/30 bg-primary/10 p-2 text-primary shadow-sm">
        <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-primary/80">Life</p>
        <div className="mt-1 flex items-center overflow-hidden rounded-full border border-primary/25 bg-base-100 text-base-content">
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square h-8 min-h-8 rounded-none border-r border-primary/15 hover:bg-primary/10"
            onClick={() => onLifeChange(-1)}
            aria-label="Lose 1 life"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-center px-3">
            <span className="text-2xl font-black leading-none tabular-nums">{lifeTotal}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square h-8 min-h-8 rounded-none border-l border-primary/15 hover:bg-primary/10"
            onClick={() => onLifeChange(1)}
            aria-label="Gain 1 life"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onLibrary}
        disabled={libraryCount === 0}
      >
        <Library className="h-4 w-4" />
        Library
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onNewGame}>
        <Play className="h-4 w-4" />
        Restart
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onCreateToken}>
        <Sparkles className="h-4 w-4" />
        Create Token
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onShuffle}
        disabled={libraryCount < 2}
      >
        <Shuffle className="h-4 w-4" />
        Shuffle <kbd className="kbd kbd-xs">S</kbd>
      </Button>
      <ActionWithCount
        count={actionCount}
        disabled={libraryCount === 0}
        icon={Hand}
        label="Draw"
        onAction={() => onDraw(actionCount)}
        onCountChange={onActionCountChange}
        shortcut="D"
      />
      <ActionWithCount
        count={actionCount}
        disabled={libraryCount === 0}
        icon={Eye}
        label="Scry"
        onAction={onScry}
        onCountChange={onActionCountChange}
      />
      <ActionWithCount
        count={actionCount}
        disabled={libraryCount === 0}
        icon={EyeOff}
        label="Surveil"
        onAction={onSurveil}
        onCountChange={onActionCountChange}
      />
      <ActionWithCount
        count={actionCount}
        disabled={libraryCount === 0}
        icon={Eye}
        label="Look"
        onAction={onLook}
        onCountChange={onActionCountChange}
      />
      <ActionWithCount
        count={actionCount}
        disabled={libraryCount === 0}
        icon={Skull}
        label="Mill"
        onAction={() => onMill(actionCount)}
        onCountChange={onActionCountChange}
      />
      <ActionWithCount
        count={actionCount}
        disabled={libraryCount === 0}
        icon={Flame}
        label="Exile"
        onAction={() => onExile(actionCount)}
        onCountChange={onActionCountChange}
      />
      <Button type="button" variant="outline" size="sm" onClick={onDiceAndCoin}>
        <Dices className="h-4 w-4" />
        Dice & Coin
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={onNextTurn}>
        <Swords className="h-4 w-4" />
        Next Turn <kbd className="kbd kbd-xs">N</kbd>
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onUntapAll}>
        <RotateCcw className="h-4 w-4" />
        Untap All <kbd className="kbd kbd-xs">U</kbd>
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo}>
        <Undo2 className="h-4 w-4" />
        Undo <kbd className="kbd kbd-xs">Ctrl+Z</kbd>
      </Button>

      <div className="mt-2 rounded-box border border-base-300 bg-base-200/70 p-3">
        <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-base-content/45">
          Selected
        </p>
        {selectedCard && selectedZone ? (
          <div className="mt-3 space-y-3">
            <div className="flex gap-3">
              <CardThumb card={selectedCard} compact faceDown={selectedStatus?.faceDown} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-black leading-tight">
                  {selectedStatus?.faceDown ? "Face-down card" : selectedCard.name}
                </p>
                <p className="mt-1 text-xs text-base-content/55">{ZONE_LABELS[selectedZone]}</p>
                {selectedStatus &&
                (selectedStatus.plusOneCounters ||
                  selectedStatus.minusOneCounters ||
                  selectedStatus.markers) ? (
                  <p className="mt-1 text-xs text-base-content/55">
                    +1/+1 {selectedStatus.plusOneCounters} · -1/-1 {selectedStatus.minusOneCounters}{" "}
                    · markers {selectedStatus.markers}
                  </p>
                ) : null}
              </div>
            </div>
            {selectedZone === "battlefield" && onTapSelected ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={onTapSelected}
              >
                {tapped ? "Untap" : "Tap"}
              </Button>
            ) : null}
            <div className="grid gap-1.5">
              {selectedActions.map((action) => {
                const Icon = action.icon
                return (
                  <Button
                    key={`${action.to}-${action.label}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() =>
                      onMove(selectedZone, action.to, selectedCard.id, action.placement)
                    }
                  >
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                    {action.label}
                  </Button>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-base-content/55">
            Drag hand cards to the battlefield or right-click any card for actions.
          </p>
        )}
      </div>

      <div className="mt-auto rounded-box border border-base-300 bg-base-200/70 p-3 text-xs text-base-content/65">
        <p className="font-bold text-base-content">{lastAction}</p>
        <p className="mt-2">
          Keys: <kbd className="kbd kbd-xs">D</kbd> draw, <kbd className="kbd kbd-xs">T</kbd> tap
          hovered card, <kbd className="kbd kbd-xs">S</kbd> shuffle,{" "}
          <kbd className="kbd kbd-xs">N</kbd> next turn.
        </p>
      </div>
    </aside>
  )
}

function ActionWithCount({
  count,
  disabled,
  icon: Icon,
  label,
  onAction,
  onCountChange,
  shortcut,
}: {
  count: number
  disabled?: boolean
  icon: LucideIcon
  label: string
  onAction: () => void
  onCountChange: (count: number) => void
  shortcut?: string
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-1">
      <Button type="button" variant="outline" size="sm" onClick={onAction} disabled={disabled}>
        <Icon className="h-4 w-4" />
        {label} {shortcut ? <kbd className="kbd kbd-xs">{shortcut}</kbd> : null}
      </Button>
      <input
        type="number"
        className="input input-sm input-bordered h-8 min-h-8 px-2 text-center text-xs font-bold"
        min={1}
        max={99}
        value={count}
        onChange={(event) => onCountChange(Math.max(1, Number(event.target.value) || 1))}
        aria-label={`${label} count`}
      />
    </div>
  )
}
