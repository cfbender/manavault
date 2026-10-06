import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Copy,
  EyeOff,
  Flame,
  Hand,
  MoreHorizontal,
  RotateCcw,
  Skull,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react"
import type { MouseEvent } from "react"
import type { PlaytestCard, PlaytestZone } from "../../lib/deck-playtest"
import { cn } from "../../lib/utils"
import { ZONE_LABELS } from "./constants"
import type { CardStatus } from "./types"

/**
 * Floating, contextual actions for the selected card (or every selected permanent): the
 * touch-friendly twin of the card menu.
 */
export function SelectionBar({
  card,
  count = 1,
  onClose,
  onDuplicate,
  onMore,
  onMove,
  onToggleFaceDown,
  onToggleTapped,
  status,
  tapped,
  zone,
}: {
  card: PlaytestCard
  /** How many permanents are selected; above one, actions apply to all of them. */
  count?: number
  onClose: () => void
  onDuplicate: () => void
  onMore: (event: MouseEvent) => void
  onMove: (to: PlaytestZone, placement?: "top" | "bottom") => void
  onToggleFaceDown: () => void
  onToggleTapped: () => void
  status: CardStatus | null
  tapped: boolean
  zone: PlaytestZone
}) {
  const onBattlefield = zone === "battlefield"
  const isGroup = count > 1
  const move = onMove
  const title = isGroup ? `${count} permanents` : status?.faceDown ? "Face-down card" : card.name

  return (
    <div
      role="toolbar"
      aria-label={`${title} actions`}
      className="absolute inset-x-2 bottom-3 z-20 mx-auto flex w-fit max-w-[calc(100%-1rem)] items-center gap-0.5 overflow-x-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-[0_8px_24px_rgb(0_0_0/0.22)] motion-safe:animate-[playtest-rise_160ms_ease-out]"
    >
      <div className="hidden min-w-0 max-w-[11rem] shrink-0 flex-col px-2 sm:flex">
        <span className="truncate text-sm font-black leading-tight">{title}</span>
        <span className="text-xs text-base-content/60">
          {isGroup ? "Selected" : ZONE_LABELS[zone]}
          {onBattlefield && tapped ? " · tapped" : ""}
        </span>
      </div>
      <span className="mx-1 hidden h-7 w-px shrink-0 bg-base-300 sm:block" aria-hidden="true" />

      {onBattlefield ? (
        <>
          <BarButton
            icon={RotateCcw}
            label={tapped ? "Untap" : "Tap"}
            shortcut="T"
            onClick={onToggleTapped}
            active={tapped}
          />
          {/* Flip and copy stay in the "more" menu on narrow screens to keep the bar on one line. */}
          <BarButton
            className="max-sm:hidden"
            icon={EyeOff}
            label={status?.faceDown ? "Face up" : "Flip"}
            shortcut="F"
            onClick={onToggleFaceDown}
          />
          <BarButton
            className="max-sm:hidden"
            icon={Copy}
            label="Copy"
            shortcut="C"
            onClick={onDuplicate}
          />
          <span className="mx-1 hidden h-7 w-px shrink-0 bg-base-300 sm:block" aria-hidden="true" />
        </>
      ) : null}

      {zone !== "battlefield" ? (
        <BarButton icon={Sparkles} label="Play" shortcut="B" onClick={() => move("battlefield")} />
      ) : null}
      {zone !== "hand" ? (
        <BarButton icon={Hand} label="Hand" shortcut="H" onClick={() => move("hand")} />
      ) : null}
      {zone !== "graveyard" ? (
        <BarButton icon={Skull} label="Grave" shortcut="G" onClick={() => move("graveyard")} />
      ) : null}
      {zone !== "exile" ? (
        <BarButton icon={Flame} label="Exile" shortcut="E" onClick={() => move("exile")} />
      ) : null}
      <BarButton icon={ArrowUpFromLine} label="Top" shortcut="L" onClick={() => move("library")} />
      <BarButton
        icon={ArrowDownToLine}
        label="Bottom"
        shortcut="Shift L"
        onClick={() => move("library", "bottom")}
      />

      {isGroup ? null : (
        <span className="mx-1 hidden h-7 w-px shrink-0 bg-base-300 sm:block" aria-hidden="true" />
      )}
      <button
        type="button"
        className={cn("btn btn-ghost btn-sm btn-square shrink-0", isGroup && "hidden")}
        onClick={onMore}
        aria-label="More card actions"
        title="Counters, power/toughness, and more"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-square shrink-0"
        onClick={onClose}
        aria-label="Deselect card"
        title="Deselect (Esc)"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function BarButton({
  active = false,
  className,
  icon: Icon,
  label,
  onClick,
  shortcut,
}: {
  active?: boolean
  className?: string
  icon: LucideIcon
  label: string
  onClick: () => void
  shortcut: string
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-field px-1 sm:px-1.5 text-xs font-bold text-base-content/80 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-10 sm:min-w-12",
        active && "bg-primary/10 text-primary",
        className,
      )}
      onClick={onClick}
      title={`${label} (${shortcut})`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}
