import { Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  Coins,
  Dices,
  Check,
  Heart,
  Keyboard,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  RotateCw,
  Settings2,
  Sparkles,
  SkipForward,
  Undo2,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Switch } from "../ui/switch"
import { SHORTCUT_GROUPS } from "./keyboard-shortcuts"
import type { PlayerCounterKind, PlayerCounters, PlaytestSettings } from "./types"

const SETTING_LABELS: Array<{ key: keyof PlaytestSettings; label: string; hint: string }> = [
  {
    hint: "Turn it off for turn one on the play, or to step through untaps only.",
    key: "drawOnNextTurn",
    label: "Draw on next turn",
  },
  {
    hint: "Show a large copy of the card under your pointer.",
    key: "showHoverPreview",
    label: "Card preview on hover",
  },
]

const DICE = [4, 6, 8, 10, 12, 20]
const PLAYER_COUNTER_LABELS: Record<PlayerCounterKind, string> = {
  energy: "Energy",
  experience: "Experience",
  poison: "Poison",
}

export function PlaytestTopBar({
  canUndo,
  closeSlot,
  deckId,
  deckName,
  lifeTotal,
  onAdjustPlayerCounter,
  onCreateToken,
  onFlipCoin,
  onLifeChange,
  onNextTurn,
  onRestart,
  onRollDie,
  onSettingsChange,
  onShortcutsOpenChange,
  onUndo,
  onUntapAll,
  playerCounters,
  settings,
  shortcutsOpen,
  turn,
}: {
  canUndo: boolean
  closeSlot?: ReactNode
  deckId: string
  deckName: string
  lifeTotal: number
  onAdjustPlayerCounter: (kind: PlayerCounterKind, delta: number) => void
  onCreateToken: () => void
  onFlipCoin: () => void
  onLifeChange: (delta: number) => void
  onNextTurn: () => void
  onRestart: () => void
  onRollDie: (sides: number) => void
  onSettingsChange: (patch: Partial<PlaytestSettings>) => void
  onShortcutsOpenChange: (open: boolean) => void
  onUndo: () => void
  onUntapAll: () => void
  playerCounters: PlayerCounters
  settings: PlaytestSettings
  shortcutsOpen: boolean
  turn: number
}) {
  const activeCounters = (Object.keys(PLAYER_COUNTER_LABELS) as PlayerCounterKind[]).filter(
    (kind) => playerCounters[kind] > 0,
  )

  return (
    <header className="col-span-full flex min-w-0 items-center gap-1.5 border-b border-base-300 bg-base-100 px-2 sm:gap-2 sm:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {closeSlot || (
          <Link
            to="/decks/$id"
            params={{ id: deckId }}
            className="btn btn-ghost btn-sm btn-square shrink-0"
            aria-label="Back to deck"
            title="Back to deck"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <h1 className="hidden min-w-0 truncate text-sm font-black sm:block">{deckName}</h1>
      </div>

      <div className="hidden items-center gap-1 lg:flex">
        <ToolButton icon={RotateCcw} label="Untap all" shortcut="U" onClick={onUntapAll} />
        <ToolButton icon={Sparkles} label="Token" onClick={onCreateToken} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="btn btn-ghost btn-sm gap-1.5 px-2.5">
              <Dices className="h-4 w-4" />
              Dice
            </button>
          </DropdownMenuTrigger>
          <DiceMenuContent onFlipCoin={onFlipCoin} onRollDie={onRollDie} />
        </DropdownMenu>
        <span className="mx-1 h-6 w-px bg-base-300" aria-hidden="true" />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="hidden text-xs font-bold text-base-content/70 sm:inline">
          Turn <span className="font-mono text-sm font-black text-base-content">{turn}</span>
        </span>
        <span className="font-mono text-sm font-black sm:hidden" aria-label={`Turn ${turn}`}>
          T{turn}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm gap-1.5 px-2.5"
          onClick={onNextTurn}
          title={`Next turn: untap everything${settings.drawOnNextTurn ? " and draw" : ""} (N)`}
        >
          <SkipForward className="h-4 w-4" />
          <span className="hidden sm:inline">Next turn</span>
          <span className="sm:hidden">Next</span>
          <kbd className="kbd kbd-xs hidden border-secondary-content/30 bg-transparent text-secondary-content md:inline-flex">
            N
          </kbd>
        </button>
      </div>

      <LifeStepper lifeTotal={lifeTotal} onLifeChange={onLifeChange} />

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="btn btn-ghost btn-sm hidden gap-1.5 px-2 md:inline-flex"
            title="Poison, energy, and experience"
          >
            Counters
            {activeCounters.map((kind) => (
              <span key={kind} className="badge badge-sm badge-outline font-mono">
                {PLAYER_COUNTER_LABELS[kind].charAt(0)}
                {playerCounters[kind]}
              </span>
            ))}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-2">
          <PlayerCounterRows counters={playerCounters} onAdjust={onAdjustPlayerCounter} />
        </PopoverContent>
      </Popover>

      <span className="mx-0.5 hidden h-6 w-px bg-base-300 md:block" aria-hidden="true" />

      <button
        type="button"
        className="btn btn-ghost btn-sm btn-square"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo (Ctrl Z)"
      >
        <Undo2 className="h-4 w-4" />
      </button>

      <div className="hidden items-center gap-1 md:flex">
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-square"
          onClick={onRestart}
          aria-label="Restart game"
          title="Restart game"
        >
          <RotateCw className="h-4 w-4" />
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              aria-label="Playtest settings"
              title="Playtest settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3">
            <h2 className="text-sm font-black">Playtest settings</h2>
            <div className="mt-2 grid gap-3">
              {SETTING_LABELS.map(({ hint, key, label }) => (
                <label key={key} className="flex cursor-pointer items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{label}</span>
                    <span className="block text-xs text-base-content/60">{hint}</span>
                  </span>
                  <Switch
                    size="sm"
                    checked={settings[key]}
                    onCheckedChange={(checked) => onSettingsChange({ [key]: checked })}
                  />
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Popover open={shortcutsOpen} onOpenChange={onShortcutsOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[22rem] p-0">
            <ShortcutList />
          </PopoverContent>
        </Popover>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square lg:hidden"
            aria-label="More game actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <DropdownMenuItem onSelect={onUntapAll}>
            <RotateCcw className="h-4 w-4" />
            Untap all
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCreateToken}>
            <Sparkles className="h-4 w-4" />
            Create token
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onRollDie(6)}>
            <Dices className="h-4 w-4" />
            Roll d6
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onRollDie(20)}>
            <Dices className="h-4 w-4" />
            Roll d20
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onFlipCoin}>
            <Coins className="h-4 w-4" />
            Flip a coin
          </DropdownMenuItem>
          <DropdownMenuSeparator className="md:hidden" />
          <div className="md:hidden">
            <DropdownMenuLabel>Counters</DropdownMenuLabel>
            <PlayerCounterRows counters={playerCounters} onAdjust={onAdjustPlayerCounter} />
            <DropdownMenuSeparator />
            {SETTING_LABELS.map(({ key, label }) => (
              <DropdownMenuItem
                key={key}
                onSelect={(event) => {
                  event.preventDefault()
                  onSettingsChange({ [key]: !settings[key] })
                }}
              >
                <Check className={cn("h-4 w-4", !settings[key] && "invisible")} />
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRestart}>
              <RotateCw className="h-4 w-4" />
              Restart game
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  shortcut,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  shortcut?: string
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm gap-1.5 px-2.5"
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function DiceMenuContent({
  onFlipCoin,
  onRollDie,
}: {
  onFlipCoin: () => void
  onRollDie: (sides: number) => void
}) {
  return (
    <DropdownMenuContent align="end" className="w-52">
      <div className="grid grid-cols-3 gap-1 p-1">
        {DICE.map((sides) => (
          <DropdownMenuItem
            key={sides}
            className="justify-center font-mono font-bold"
            onSelect={() => onRollDie(sides)}
          >
            d{sides}
          </DropdownMenuItem>
        ))}
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onFlipCoin}>
        <Coins className="h-4 w-4" />
        Flip a coin
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

function LifeStepper({
  lifeTotal,
  onLifeChange,
}: {
  lifeTotal: number
  onLifeChange: (delta: number) => void
}) {
  return (
    <div
      className="flex h-8 items-center rounded-field border border-base-300 bg-base-200"
      role="group"
      aria-label="Life total"
    >
      <button
        type="button"
        className="flex h-full w-8 items-center justify-center rounded-l-field text-base-content/70 hover:bg-base-300 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onLifeChange(-1)}
        aria-label="Lose 1 life"
        title="Lose 1 life (−)"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span
        className={cn(
          "flex min-w-14 items-center justify-center gap-1 px-1 font-mono text-base font-black tabular-nums",
          lifeTotal <= 10 && "text-error",
        )}
        aria-live="polite"
      >
        <Heart className="h-3.5 w-3.5 fill-current text-primary" aria-hidden="true" />
        {lifeTotal}
      </span>
      <button
        type="button"
        className="flex h-full w-8 items-center justify-center rounded-r-field text-base-content/70 hover:bg-base-300 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onLifeChange(1)}
        aria-label="Gain 1 life"
        title="Gain 1 life (+)"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function PlayerCounterRows({
  counters,
  onAdjust,
}: {
  counters: PlayerCounters
  onAdjust: (kind: PlayerCounterKind, delta: number) => void
}) {
  return (
    <div className="grid gap-0.5">
      {(Object.keys(PLAYER_COUNTER_LABELS) as PlayerCounterKind[]).map((kind) => (
        <div key={kind} className="flex items-center gap-2 rounded-field px-2 py-1">
          <span className="min-w-0 flex-1 text-sm font-bold">{PLAYER_COUNTER_LABELS[kind]}</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square"
            onClick={() => onAdjust(kind, -1)}
            disabled={counters[kind] === 0}
            aria-label={`Remove 1 ${kind}`}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-6 text-center font-mono text-sm font-black tabular-nums">
            {counters[kind]}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square"
            onClick={() => onAdjust(kind, 1)}
            aria-label={`Add 1 ${kind}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

function ShortcutList() {
  return (
    <div className="max-h-[70vh] overflow-y-auto p-3">
      <h2 className="text-sm font-black">Keyboard shortcuts</h2>
      <p className="mt-0.5 text-xs text-base-content/60">
        Card keys act on the card under your pointer, or the selected card.
      </p>
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} className="mt-3">
          <h3 className="text-xs font-bold text-base-content/60">{group.title}</h3>
          <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
            {group.items.map(([keys, label]) => (
              <div key={keys} className="contents">
                <dt>
                  <kbd className="kbd kbd-sm min-w-8 font-mono text-xs">{keys}</kbd>
                </dt>
                <dd className="text-sm">{label}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
