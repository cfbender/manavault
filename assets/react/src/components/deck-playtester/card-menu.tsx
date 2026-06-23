import {
  ArrowDownToLine,
  ArrowUpFromLine,
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
import { useState, type CSSProperties } from "react"
import type { PlaytestCard, PlaytestZone } from "../../lib/deck-playtest"
import { cn } from "../../lib/utils"
import { hasClearableCardStatus } from "./card-status"
import type { CardStatus, ContextMenuState } from "./types"

export function CardContextMenu({
  card,
  cardStatus,
  menu,
  onAddMarker,
  onAdjustCounter,
  onClearStatus,
  onClose,
  onMove,
  onSetPowerToughness,
  onToggleFaceDown,
  onToggleTapped,
  tapped,
}: {
  card: PlaytestCard | null
  cardStatus: CardStatus
  menu: NonNullable<ContextMenuState>
  onAddMarker: (cardId: string) => void
  onAdjustCounter: (
    cardId: string,
    kind: "plusOneCounters" | "minusOneCounters",
    delta: number,
  ) => void
  onClearStatus: (cardId: string) => void
  onClose: () => void
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
  const [power, setPower] = useState(cardStatus.power || "0")
  const [toughness, setToughness] = useState(cardStatus.toughness || "0")
  const hasClearableStatus = hasClearableCardStatus(cardStatus)

  if (!card) return null

  return (
    <>
      <button
        type="button"
        aria-label="Close card menu"
        className="fixed inset-0 z-40 cursor-default bg-transparent"
        onClick={onClose}
      />
      <div
        className="fixed inset-x-2 bottom-2 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-box border border-base-300 bg-base-100/95 text-sm shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-auto sm:w-80 sm:left-[var(--menu-x)] sm:top-[var(--menu-y)]"
        style={{ "--menu-x": `${menu.x}px`, "--menu-y": `${menu.y}px` } as CSSProperties}
        role="menu"
      >
        <div className="border-b border-base-300 px-3 py-2 font-black">
          {cardStatus.faceDown ? "Face-down card" : card.name}
        </div>
        {menu.zone === "battlefield" ? (
          <MenuButton
            label={tapped ? "Untap" : "Tap"}
            shortcut="T"
            icon={RotateCcw}
            onClick={() => onToggleTapped(card.id)}
          />
        ) : null}
        <MenuButton
          label={cardStatus.faceDown ? "Turn face up" : "Turn face down"}
          icon={EyeOff}
          onClick={() => onToggleFaceDown(card.id)}
        />
        <MenuButton
          label={`+1/+1 Counter (${cardStatus.plusOneCounters})`}
          shortcut="+"
          icon={Plus}
          onClick={() => onAdjustCounter(card.id, "plusOneCounters", 1)}
        />
        <MenuButton
          label={`-1/-1 Counter (${cardStatus.minusOneCounters})`}
          shortcut="-"
          icon={Plus}
          onClick={() => onAdjustCounter(card.id, "minusOneCounters", 1)}
        />
        <MenuButton
          label={`Add Marker (${cardStatus.markers})`}
          icon={Sparkles}
          onClick={() => onAddMarker(card.id)}
        />
        <MenuButton
          label="Remove all counters"
          icon={Minus}
          onClick={() => onClearStatus(card.id)}
          disabled={!hasClearableStatus}
        />
        <div className="border-y border-base-300 px-3 py-2 text-xs text-base-content/60">
          Counters: +1/+1 {cardStatus.plusOneCounters}, -1/-1 {cardStatus.minusOneCounters}, markers{" "}
          {cardStatus.markers}
        </div>
        <div className="flex items-center gap-2 border-b border-base-300 px-3 py-2">
          <span className="min-w-0 flex-1 text-base-content/80">Set power / toughness</span>
          <input
            className="input input-xs input-bordered w-12 text-center"
            value={power}
            onChange={(event) => setPower(event.target.value)}
          />
          <span>/</span>
          <input
            className="input input-xs input-bordered w-12 text-center"
            value={toughness}
            onChange={(event) => setToughness(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-xs btn-outline"
            onClick={() => onSetPowerToughness(card.id, power, toughness)}
          >
            OK
          </button>
        </div>
        {menu.zone !== "hand" ? (
          <MenuButton
            label="Return to Hand"
            shortcut="H"
            icon={Hand}
            onClick={() => onMove(menu.zone, "hand", card.id)}
          />
        ) : null}
        {menu.zone !== "graveyard" ? (
          <MenuButton
            label="Graveyard"
            shortcut="G"
            icon={Skull}
            onClick={() => onMove(menu.zone, "graveyard", card.id)}
          />
        ) : null}
        {menu.zone !== "exile" ? (
          <MenuButton
            label="Exile"
            shortcut="E"
            icon={Flame}
            onClick={() => onMove(menu.zone, "exile", card.id)}
          />
        ) : null}
        <MenuButton
          label="Top of Library"
          icon={ArrowUpFromLine}
          onClick={() => onMove(menu.zone, "library", card.id, "top")}
        />
        <MenuButton
          label="Bottom of Library"
          icon={ArrowDownToLine}
          onClick={() => onMove(menu.zone, "library", card.id, "bottom")}
        />
      </div>
    </>
  )
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
        "flex w-full items-center gap-3 px-3 py-2 text-left text-base-content/80 hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        disabled && "cursor-not-allowed text-base-content/35 hover:bg-transparent",
      )}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
    >
      <Icon className={cn("h-4 w-4 text-base-content/45", disabled && "text-base-content/25")} />
      <span className="min-w-0 flex-1">{label}</span>
      {shortcut ? <kbd className="kbd kbd-xs">{shortcut}</kbd> : null}
    </button>
  )
}
