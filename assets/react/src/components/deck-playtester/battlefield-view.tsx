import { ZoomIn, ZoomOut } from "lucide-react"
import type { DragEvent, MouseEvent, PointerEvent, ReactNode, RefObject } from "react"
import type { PlaytestCard, PlaytestZone } from "../../lib/deck-playtest"
import { cn } from "../../lib/utils"
import { Badge } from "../ui/badge"
import { defaultBattlefieldPosition } from "./battlefield-helpers"
import { defaultCardStatus } from "./card-status"
import { CardThumb } from "./card-thumb"
import { BATTLEFIELD_CARD_WIDTH_REM } from "./constants"
import type { BattlefieldCardPosition, CardStatus } from "./types"

export function PlaytestBattlefield({
  battlefield,
  children,
  battlefieldCardPositions,
  cardStatuses,
  command,
  draggingBattlefieldCardId,
  onActivateCard,
  onBeginPointerDrag,
  onCardHover,
  onCardLeave,
  onDrop,
  onFinishPointerDrag,
  onOpenContextMenu,
  onUpdatePointerDrag,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  selectedCardId,
  surfaceRef,
  tappedCards,
  zoom,
}: {
  battlefield: PlaytestCard[]
  battlefieldCardPositions: Record<string, BattlefieldCardPosition>
  cardStatuses: Record<string, CardStatus>
  command: PlaytestCard[]
  draggingBattlefieldCardId: string | null
  onActivateCard: (card: PlaytestCard, zone: PlaytestZone) => void
  children?: ReactNode
  onBeginPointerDrag: (cardId: string, event: PointerEvent<HTMLButtonElement>) => void
  onCardHover: (cardId: string, zone: PlaytestZone) => void
  onCardLeave: (cardId: string) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onFinishPointerDrag: (event: PointerEvent<HTMLButtonElement>) => void
  onOpenContextMenu: (card: PlaytestCard, zone: PlaytestZone, event: MouseEvent) => void
  onUpdatePointerDrag: (event: PointerEvent<HTMLButtonElement>) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  selectedCardId: string | null
  surfaceRef: RefObject<HTMLDivElement | null>
  tappedCards: Set<string>
  zoom: number
}) {
  return (
    <main className="relative row-start-2 min-h-0 overflow-hidden border-y border-base-300/70 bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--color-primary),transparent_88%),transparent_34rem)] lg:col-start-1">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.22em] text-base-content/35">
        Battlefield
        <Badge tone={battlefield.length ? "primary" : "neutral"}>{battlefield.length}</Badge>
      </div>

      <div
        className="h-full overflow-auto p-4 sm:p-8"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <div
          ref={surfaceRef}
          className="relative h-full min-h-[24rem] min-w-[38rem] sm:min-h-[32rem] sm:min-w-[48rem]"
        >
          {battlefield.length ? (
            battlefield.map((card, index) => {
              const position =
                battlefieldCardPositions[card.id] || defaultBattlefieldPosition(index)

              return (
                <CanvasCard
                  key={card.id}
                  card={card}
                  isSelected={selectedCardId === card.id}
                  isTapped={tappedCards.has(card.id)}
                  position={position}
                  status={cardStatuses[card.id] || defaultCardStatus()}
                  onClick={() => onActivateCard(card, "battlefield")}
                  onContextMenu={(event) => onOpenContextMenu(card, "battlefield", event)}
                  onPointerDown={(event) => onBeginPointerDrag(card.id, event)}
                  onPointerMove={onUpdatePointerDrag}
                  onPointerUp={onFinishPointerDrag}
                  onPointerCancel={onFinishPointerDrag}
                  onMouseEnter={() => onCardHover(card.id, "battlefield")}
                  onMouseLeave={() => onCardLeave(card.id)}
                  onFocus={() => onCardHover(card.id, "battlefield")}
                  onBlur={() => onCardLeave(card.id)}
                  isDragging={draggingBattlefieldCardId === card.id}
                  zoom={zoom}
                />
              )
            })
          ) : (
            <div className="flex h-full min-h-[28rem] items-center justify-center">
              <EmptyBattlefield
                command={command}
                onCardHover={onCardHover}
                onCardLeave={onCardLeave}
              />
            </div>
          )}
        </div>
      </div>

      <BattlefieldZoomControls
        zoom={zoom}
        onReset={onZoomReset}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
      />
      {children}
    </main>
  )
}

export function BattlefieldZoomControls({
  onReset,
  onZoomIn,
  onZoomOut,
  zoom,
}: {
  onReset: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  zoom: number
}) {
  return (
    <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-box border border-base-300 bg-base-100/80 p-1 text-xs shadow-xl backdrop-blur">
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-square"
        aria-label="Zoom out"
        onClick={onZoomOut}
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs min-w-14"
        onClick={onReset}
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-square"
        aria-label="Zoom in"
        onClick={onZoomIn}
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function EmptyBattlefield({
  command,
  onCardHover,
  onCardLeave,
}: {
  command: PlaytestCard[]
  onCardHover: (cardId: string, zone: PlaytestZone) => void
  onCardLeave: (cardId: string) => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {command.length ? (
        <div>
          <p className="mb-2 text-[0.65rem] font-black uppercase tracking-[0.2em] text-base-content/45">
            Commander
          </p>
          <div
            className="mx-auto w-36 overflow-hidden rounded-lg border border-dashed border-primary/70 bg-base-200 p-1 shadow-2xl shadow-primary/10"
            onMouseEnter={() => onCardHover(command[0].id, "command")}
            onMouseLeave={() => onCardLeave(command[0].id)}
            onFocus={() => onCardHover(command[0].id, "command")}
            onBlur={() => onCardLeave(command[0].id)}
          >
            <CardThumb card={command[0]} />
          </div>
        </div>
      ) : null}
      <p className="max-w-xs text-sm text-base-content/45">
        Drag cards here from your hand or command zone.
      </p>
    </div>
  )
}

export function CanvasCard({
  card,
  isSelected,
  isTapped,
  onClick,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  isDragging,
  position,
  status,
  zoom,
}: {
  card: PlaytestCard
  isSelected: boolean
  isTapped: boolean
  onClick: () => void
  onContextMenu: (event: MouseEvent) => void
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: () => void
  onBlur: () => void
  isDragging: boolean
  position: BattlefieldCardPosition
  status: CardStatus
  zoom: number
}) {
  const hasCounters =
    status.plusOneCounters > 0 || status.minusOneCounters > 0 || status.markers > 0

  return (
    <button
      type="button"
      draggable={false}
      className={cn(
        "absolute origin-center touch-none select-none overflow-hidden rounded-lg border bg-base-200 shadow-2xl transition-[box-shadow,border-color,opacity] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isDragging ? "z-30 cursor-grabbing opacity-95 shadow-primary/40" : "cursor-grab",
        isSelected
          ? "border-primary ring-2 ring-primary/40"
          : "border-base-300 hover:border-primary/70",
        isTapped && "rotate-90",
      )}
      style={{
        left: position.x,
        top: position.y,
        width: `${BATTLEFIELD_CARD_WIDTH_REM * zoom}rem`,
      }}
      title={status.faceDown ? "Face-down card" : card.name}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="relative">
        <CardThumb card={card} faceDown={status.faceDown} />
        {hasCounters || status.power || status.toughness ? (
          <div className="absolute inset-x-1 bottom-1 flex flex-wrap justify-center gap-1">
            {status.plusOneCounters ? (
              <span className="badge badge-success badge-xs">+{status.plusOneCounters}</span>
            ) : null}
            {status.minusOneCounters ? (
              <span className="badge badge-error badge-xs">-{status.minusOneCounters}</span>
            ) : null}
            {status.markers ? (
              <span className="badge badge-info badge-xs">{status.markers} mark</span>
            ) : null}
            {status.power || status.toughness ? (
              <span className="badge badge-warning badge-xs">
                {status.power || "0"}/{status.toughness || "0"}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </button>
  )
}
