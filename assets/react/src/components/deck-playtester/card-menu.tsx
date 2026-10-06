import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Copy,
  Eraser,
  EyeOff,
  Flame,
  Hand,
  Minus,
  Plus,
  RotateCcw,
  Skull,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import type { PlaytestCard, PlaytestZone } from "../../lib/deck-playtest"
import { cn } from "../../lib/utils"
import { hasClearableCardStatus } from "./card-status"
import { ZONE_LABELS } from "./constants"
import type { CardStatus, ContextMenuState, CounterKind } from "./types"

const COUNTER_ROWS: Array<{ kind: CounterKind; label: string }> = [
  { kind: "plusOneCounters", label: "+1/+1 counters" },
  { kind: "minusOneCounters", label: "−1/−1 counters" },
  { kind: "markers", label: "Markers" },
]

export function CardContextMenu({
  card,
  cardStatus,
  menu,
  onAdjustCounter,
  onClearStatus,
  onClose,
  onDuplicate,
  onMove,
  onSetPowerToughness,
  onToggleFaceDown,
  onToggleTapped,
  tapped,
}: {
  card: PlaytestCard | null
  cardStatus: CardStatus
  menu: NonNullable<ContextMenuState>
  onAdjustCounter: (cardId: string, kind: CounterKind, delta: number) => void
  onClearStatus: (cardId: string) => void
  onClose: () => void
  onDuplicate: (cardId: string) => void
  onMove: (
    from: PlaytestZone,
    to: PlaytestZone,
    cardId: string,
    placement?: "top" | "bottom",
  ) => void
  onSetPowerToughness: (cardId: string, power: string, toughness: string) => void
  onToggleFaceDown: (cardId: string) => void
  onToggleTapped: (cardId: string) => void
  tapped: boolean
}) {
  const [power, setPower] = useState(cardStatus.power || "")
  const [toughness, setToughness] = useState(cardStatus.toughness || "")
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: menu.x, top: menu.y })
  const onBattlefield = menu.zone === "battlefield"

  // Keep the menu inside the viewport when opened near an edge.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const { height, width } = panel.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)),
    })
  }, [menu.x, menu.y])

  if (!card) return null

  const name = cardStatus.faceDown ? "Face-down card" : card.name
  const move = (to: PlaytestZone, placement?: "top" | "bottom") =>
    onMove(menu.zone, to, card.id, placement)

  return (
    <>
      <button
        type="button"
        aria-label="Close card menu"
        className="fixed inset-0 z-40 cursor-default bg-black/20 sm:bg-transparent"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        ref={panelRef}
        className="fixed inset-x-2 bottom-2 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 text-sm shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-[var(--menu-x)] sm:top-[var(--menu-y)] sm:w-80"
        style={
          { "--menu-x": `${position.left}px`, "--menu-y": `${position.top}px` } as CSSProperties
        }
        role="dialog"
        aria-label={`${name} actions`}
      >
        <div className="px-2.5 pb-1.5 pt-1">
          <p className="truncate font-black">{name}</p>
          <p className="text-xs text-base-content/60">{ZONE_LABELS[menu.zone]}</p>
        </div>

        {onBattlefield ? (
          <MenuGroup>
            <MenuButton
              label={tapped ? "Untap" : "Tap"}
              shortcut="T"
              icon={RotateCcw}
              onClick={() => onToggleTapped(card.id)}
            />
            <MenuButton
              label={cardStatus.faceDown ? "Turn face up" : "Turn face down"}
              shortcut="F"
              icon={EyeOff}
              onClick={() => onToggleFaceDown(card.id)}
            />
            <MenuButton
              label="Create token copy"
              shortcut="C"
              icon={Copy}
              onClick={() => onDuplicate(card.id)}
            />
          </MenuGroup>
        ) : null}

        {onBattlefield ? (
          <MenuGroup>
            {COUNTER_ROWS.map(({ kind, label }) => (
              <div key={kind} className="flex items-center gap-2 rounded-field px-2.5 py-1">
                <span className="min-w-0 flex-1 text-base-content/80">{label}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square"
                  onClick={() => onAdjustCounter(card.id, kind, -1)}
                  disabled={cardStatus[kind] === 0}
                  aria-label={`Remove one of ${label}`}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center font-mono font-black tabular-nums">
                  {cardStatus[kind]}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square"
                  onClick={() => onAdjustCounter(card.id, kind, 1)}
                  aria-label={`Add one of ${label}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <form
              className="flex items-center gap-1.5 px-2.5 py-1"
              onSubmit={(event) => {
                event.preventDefault()
                onSetPowerToughness(card.id, power.trim(), toughness.trim())
              }}
            >
              <span className="min-w-0 flex-1 text-base-content/80">Power / toughness</span>
              <input
                className="input input-xs input-bordered w-11 px-1 text-center font-mono"
                value={power}
                placeholder="–"
                onChange={(event) => setPower(event.target.value)}
                aria-label="Power"
              />
              <span className="text-base-content/50">/</span>
              <input
                className="input input-xs input-bordered w-11 px-1 text-center font-mono"
                value={toughness}
                placeholder="–"
                onChange={(event) => setToughness(event.target.value)}
                aria-label="Toughness"
              />
              <button type="submit" className="btn btn-xs btn-outline">
                Set
              </button>
            </form>
            <MenuButton
              label="Clear counters"
              icon={Eraser}
              onClick={() => onClearStatus(card.id)}
              disabled={!hasClearableCardStatus(cardStatus)}
            />
          </MenuGroup>
        ) : null}

        <MenuGroup>
          {!onBattlefield ? (
            <MenuButton
              label="Play to battlefield"
              shortcut="B"
              icon={Sparkles}
              onClick={() => move("battlefield")}
            />
          ) : null}
          {menu.zone !== "hand" ? (
            <MenuButton
              label="Return to hand"
              shortcut="H"
              icon={Hand}
              onClick={() => move("hand")}
            />
          ) : null}
          {menu.zone !== "graveyard" ? (
            <MenuButton
              label="Graveyard"
              shortcut="G"
              icon={Skull}
              onClick={() => move("graveyard")}
            />
          ) : null}
          {menu.zone !== "exile" ? (
            <MenuButton label="Exile" shortcut="E" icon={Flame} onClick={() => move("exile")} />
          ) : null}
          <MenuButton
            label="Top of library"
            shortcut="L"
            icon={ArrowUpFromLine}
            onClick={() => move("library", "top")}
          />
          <MenuButton
            label="Bottom of library"
            shortcut="⇧L"
            icon={ArrowDownToLine}
            onClick={() => move("library", "bottom")}
          />
        </MenuGroup>
      </div>
    </>
  )
}

function MenuGroup({ children }: { children: ReactNode }) {
  return <div className="border-t border-base-300 py-1 first:border-t-0">{children}</div>
}

function MenuButton({
  disabled = false,
  icon: Icon,
  label,
  onClick,
  shortcut,
}: {
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
  shortcut?: string
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 rounded-field px-2.5 py-1.5 text-left text-base-content/85 hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        disabled && "cursor-not-allowed text-base-content/40 hover:bg-transparent",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className={cn("h-4 w-4 text-base-content/55", disabled && "text-base-content/30")} />
      <span className="min-w-0 flex-1">{label}</span>
      {shortcut ? <kbd className="kbd kbd-xs font-mono">{shortcut}</kbd> : null}
    </button>
  )
}
