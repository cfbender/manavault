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
import { ZONE_ACTIONS } from "./constants"
import type { CardStatus } from "./types"

export function MobilePlaytestControls({
  actionCount,
  canUndo,
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
    <section className="row-start-3 min-w-0 border-t border-base-300 bg-base-100/95 shadow-2xl lg:hidden">
      <div className="flex items-center gap-1.5 overflow-x-auto px-2 py-2">
        <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-primary/25 bg-base-200 text-base-content">
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square rounded-none"
            onClick={() => onLifeChange(-1)}
            aria-label="Lose 1 life"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-10 text-center text-lg font-black tabular-nums">{lifeTotal}</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square rounded-none"
            onClick={() => onLifeChange(1)}
            aria-label="Gain 1 life"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <input
          type="number"
          className="input input-xs input-bordered h-8 min-h-8 w-12 shrink-0 px-1 text-center text-xs font-bold"
          min={1}
          max={99}
          value={actionCount}
          onChange={(event) => onActionCountChange(Math.max(1, Number(event.target.value) || 1))}
          aria-label="Action count"
        />
        <MobileActionButton
          icon={Hand}
          label="Draw"
          onClick={() => onDraw(actionCount)}
          disabled={libraryCount === 0}
        />
        <MobileActionButton icon={Swords} label="Next" onClick={onNextTurn} />
        <MobileActionButton
          icon={Library}
          label="Library"
          onClick={onLibrary}
          disabled={libraryCount === 0}
        />
        <MobileActionButton
          icon={Eye}
          label="Look"
          onClick={onLook}
          disabled={libraryCount === 0}
        />
        <MobileActionButton
          icon={Eye}
          label="Scry"
          onClick={onScry}
          disabled={libraryCount === 0}
        />
        <MobileActionButton
          icon={EyeOff}
          label="Surveil"
          onClick={onSurveil}
          disabled={libraryCount === 0}
        />
        <MobileActionButton
          icon={Skull}
          label="Mill"
          onClick={() => onMill(actionCount)}
          disabled={libraryCount === 0}
        />
        <MobileActionButton
          icon={Flame}
          label="Exile"
          onClick={() => onExile(actionCount)}
          disabled={libraryCount === 0}
        />
        <MobileActionButton
          icon={Shuffle}
          label="Shuffle"
          onClick={onShuffle}
          disabled={libraryCount < 2}
        />
        <MobileActionButton icon={RotateCcw} label="Untap" onClick={onUntapAll} />
        <MobileActionButton icon={Sparkles} label="Token" onClick={onCreateToken} />
        <MobileActionButton icon={Dices} label="Dice" onClick={onDiceAndCoin} />
        <MobileActionButton icon={Play} label="Restart" onClick={onNewGame} />
        <MobileActionButton icon={Undo2} label="Undo" onClick={onUndo} disabled={!canUndo} />
      </div>
      {selectedCard && selectedZone ? (
        <div className="flex items-center gap-2 border-t border-base-300 px-2 py-1.5">
          <p className="min-w-0 flex-1 truncate text-xs font-black">
            {selectedStatus?.faceDown ? "Face-down card" : selectedCard.name}
          </p>
          <div className="flex max-w-[72vw] gap-1 overflow-x-auto">
            {selectedZone === "battlefield" && onTapSelected ? (
              <button
                type="button"
                className="btn btn-outline btn-xs shrink-0"
                onClick={onTapSelected}
              >
                {tapped ? "Untap" : "Tap"}
              </button>
            ) : null}
            {selectedActions.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={`${action.to}-${action.label}`}
                  type="button"
                  className="btn btn-outline btn-xs shrink-0"
                  onClick={() => onMove(selectedZone, action.to, selectedCard.id, action.placement)}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                  {action.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function MobileActionButton({
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="btn btn-outline btn-xs h-8 min-h-8 shrink-0 gap-1.5 px-2"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
