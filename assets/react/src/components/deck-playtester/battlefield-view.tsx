import { CircleDot, Sparkles, ZoomIn, ZoomOut } from "lucide-react"
import {
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react"
import type { PlaytestCard, PlaytestZone } from "../../lib/deck-playtest"
import { cn } from "../../lib/utils"
import {
  battlefieldCardDimensions,
  cardsInMarquee,
  defaultBattlefieldPosition,
} from "./battlefield-helpers"
import { defaultCardStatus } from "./card-status"
import { CardThumb } from "./card-thumb"
import { BATTLEFIELD_CARD_WIDTH_REM } from "./constants"
import type { BattlefieldCardPosition, CardStatus, CounterKind } from "./types"

type Marquee = {
  additive: boolean
  pointerId: number
  x0: number
  y0: number
  x1: number
  y1: number
}

function marqueeRect({ x0, x1, y0, y1 }: Marquee) {
  return {
    height: Math.abs(y1 - y0),
    width: Math.abs(x1 - x0),
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
  }
}

export function PlaytestBattlefield({
  battlefield,
  children,
  battlefieldCardPositions,
  cardStatuses,
  command,
  draggingCardIds,
  onActivateCard,
  onAdjustCounter,
  onBackgroundClick,
  onBeginPointerDrag,
  onCardHover,
  onCardLeave,
  onCastCommander,
  onDrop,
  onFinishPointerDrag,
  onMarqueeSelect,
  onOpenContextMenu,
  onToggleTapped,
  onUpdatePointerDrag,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  selectedCardIds,
  surfaceRef,
  tappedCards,
  zoom,
}: {
  battlefield: PlaytestCard[]
  battlefieldCardPositions: Record<string, BattlefieldCardPosition>
  cardStatuses: Record<string, CardStatus>
  command: PlaytestCard[]
  draggingCardIds: string[]
  onActivateCard: (card: PlaytestCard, zone: PlaytestZone) => void
  onAdjustCounter: (cardId: string, kind: CounterKind, delta: number) => void
  onBackgroundClick: () => void
  children?: ReactNode
  onBeginPointerDrag: (cardId: string, event: PointerEvent<HTMLButtonElement>) => void
  onCardHover: (cardId: string, zone: PlaytestZone) => void
  onCardLeave: (cardId: string) => void
  onCastCommander: (card: PlaytestCard) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onFinishPointerDrag: (event: PointerEvent<HTMLButtonElement>) => void
  onMarqueeSelect: (cardIds: string[], additive: boolean) => void
  onOpenContextMenu: (card: PlaytestCard, zone: PlaytestZone, event: MouseEvent) => void
  onToggleTapped: (cardId: string) => void
  onUpdatePointerDrag: (event: PointerEvent<HTMLButtonElement>) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  selectedCardIds: string[]
  surfaceRef: RefObject<HTMLDivElement | null>
  tappedCards: Set<string>
  zoom: number
}) {
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const suppressBackgroundClickRef = useRef(false)

  const surfacePoint = (event: PointerEvent<HTMLElement>) => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left || 0), y: event.clientY - (rect?.top || 0) }
  }

  // Box selection is for mouse and pen; on touch, dragging empty space scrolls the board.
  const beginMarquee = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.pointerType === "touch") return
    if ((event.target as HTMLElement).closest("[data-playtest-card]")) return
    const point = surfacePoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    setMarquee({
      additive: event.shiftKey || event.metaKey || event.ctrlKey,
      pointerId: event.pointerId,
      x0: point.x,
      x1: point.x,
      y0: point.y,
      y1: point.y,
    })
  }

  const updateMarquee = (event: PointerEvent<HTMLDivElement>) => {
    if (!marquee || marquee.pointerId !== event.pointerId) return
    const point = surfacePoint(event)
    setMarquee({ ...marquee, x1: point.x, y1: point.y })
  }

  const finishMarquee = (event: PointerEvent<HTMLDivElement>) => {
    if (!marquee || marquee.pointerId !== event.pointerId) return
    setMarquee(null)
    const rect = marqueeRect(marquee)
    const surface = surfaceRef.current
    if (!surface || (rect.width < 4 && rect.height < 4)) return
    suppressBackgroundClickRef.current = true
    const positions = Object.fromEntries(
      battlefield.map((card, index) => [
        card.id,
        battlefieldCardPositions[card.id] || defaultBattlefieldPosition(index),
      ]),
    )
    onMarqueeSelect(
      cardsInMarquee(positions, rect, battlefieldCardDimensions(surface, zoom)),
      marquee.additive,
    )
  }

  return (
    <section
      aria-label={`Battlefield, ${battlefield.length} cards`}
      className="relative min-h-0 overflow-hidden bg-base-200 bg-[radial-gradient(ellipse_at_50%_35%,color-mix(in_oklch,var(--color-base-100),transparent_45%),transparent_70%)] shadow-[inset_0_2px_10px_rgb(0_0_0/0.12)]"
    >
      <div
        className="h-full overflow-auto p-2 sm:p-6"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        onPointerDown={beginMarquee}
        onPointerMove={updateMarquee}
        onPointerUp={finishMarquee}
        onPointerCancel={() => setMarquee(null)}
        onClick={(event) => {
          if (suppressBackgroundClickRef.current) {
            suppressBackgroundClickRef.current = false
            return
          }
          if (!(event.target as HTMLElement).closest("[data-playtest-card]")) onBackgroundClick()
        }}
      >
        <div
          ref={surfaceRef}
          className="relative h-full min-h-[20rem] min-w-[21rem] sm:min-h-[28rem] sm:min-w-[48rem]"
        >
          {battlefield.length ? (
            // Newest cards sit at the front of the zone; render them last so they stack on top.
            battlefield
              .map((card, index) => ({ card, index }))
              .reverse()
              .map(({ card, index }) => {
                const position =
                  battlefieldCardPositions[card.id] || defaultBattlefieldPosition(index)

                return (
                  <CanvasCard
                    key={card.id}
                    card={card}
                    isSelected={selectedCardIds.includes(card.id)}
                    isTapped={tappedCards.has(card.id)}
                    position={position}
                    status={cardStatuses[card.id] || defaultCardStatus()}
                    onClick={() => onActivateCard(card, "battlefield")}
                    onDoubleClick={() => onToggleTapped(card.id)}
                    onContextMenu={(event) => onOpenContextMenu(card, "battlefield", event)}
                    onPointerDown={(event) => onBeginPointerDrag(card.id, event)}
                    onPointerMove={onUpdatePointerDrag}
                    onPointerUp={onFinishPointerDrag}
                    onPointerCancel={onFinishPointerDrag}
                    onMouseEnter={() => onCardHover(card.id, "battlefield")}
                    onMouseLeave={() => onCardLeave(card.id)}
                    onFocus={() => onCardHover(card.id, "battlefield")}
                    onBlur={() => onCardLeave(card.id)}
                    isDragging={draggingCardIds.includes(card.id)}
                    onAdjustCounter={(kind, delta) => onAdjustCounter(card.id, kind, delta)}
                    zoom={zoom}
                  />
                )
              })
          ) : (
            <EmptyBattlefield command={command} onCastCommander={onCastCommander} />
          )}
          {marquee ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-40 rounded-sm border border-dashed border-primary bg-primary/10"
              style={{
                height: marqueeRect(marquee).height,
                left: marqueeRect(marquee).x,
                top: marqueeRect(marquee).y,
                width: marqueeRect(marquee).width,
              }}
            />
          ) : null}
        </div>
      </div>

      <BattlefieldZoomControls
        zoom={zoom}
        onReset={onZoomReset}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
      />
      {children}
    </section>
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
    <div className="absolute bottom-3 right-3 z-10 flex items-center rounded-field border border-base-300 bg-base-100 text-xs shadow-sm">
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-square h-8 w-8"
        aria-label="Zoom out"
        onClick={onZoomOut}
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs h-8 min-w-12 px-1 font-mono tabular-nums"
        onClick={onReset}
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-square h-8 w-8"
        aria-label="Zoom in"
        onClick={onZoomIn}
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function EmptyBattlefield({
  command,
  onCastCommander,
}: {
  command: PlaytestCard[]
  onCastCommander: (card: PlaytestCard) => void
}) {
  const commander = command[0]

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <p className="text-sm text-base-content/60">
          Click a card in your hand to play it, or drag it anywhere on the battlefield.
        </p>
        {commander ? (
          <button
            type="button"
            className="btn btn-outline btn-sm pointer-events-auto gap-2"
            onClick={() => onCastCommander(commander)}
          >
            <Sparkles className="h-4 w-4" />
            Cast {commander.name}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function CanvasCard({
  card,
  isSelected,
  isTapped,
  onClick,
  onContextMenu,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  isDragging,
  onAdjustCounter,
  position,
  status,
  zoom,
}: {
  card: PlaytestCard
  isSelected: boolean
  isTapped: boolean
  onClick: () => void
  onContextMenu: (event: MouseEvent) => void
  onDoubleClick: () => void
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: () => void
  onBlur: () => void
  isDragging: boolean
  onAdjustCounter: (kind: CounterKind, delta: number) => void
  position: BattlefieldCardPosition
  status: CardStatus
  zoom: number
}) {
  const netCounters = status.plusOneCounters - status.minusOneCounters
  const label = status.faceDown ? "Face-down card" : card.name
  // The net chip nets +1/+1 against -1/-1 counters, so adding cancels a -1/-1 counter first.
  const adjustNet = (delta: number) => {
    if (delta > 0 && status.minusOneCounters > 0) onAdjustCounter("minusOneCounters", -1)
    else if (delta > 0) onAdjustCounter("plusOneCounters", 1)
    else if (status.plusOneCounters > 0) onAdjustCounter("plusOneCounters", -1)
    else onAdjustCounter("minusOneCounters", 1)
  }

  return (
    <button
      type="button"
      draggable={false}
      data-playtest-card={card.id}
      className={cn(
        "absolute origin-center touch-none select-none rounded-lg transition-[transform,box-shadow,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-200",
        isDragging
          ? "z-30 cursor-grabbing shadow-[0_18px_36px_rgb(0_0_0/0.4)]"
          : "cursor-grab shadow-[0_3px_8px_rgb(0_0_0/0.28)] hover:shadow-[0_8px_18px_rgb(0_0_0/0.32)]",
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-base-200",
        isTapped && "rotate-90",
      )}
      style={{
        left: position.x,
        top: position.y,
        width: `${BATTLEFIELD_CARD_WIDTH_REM * zoom}rem`,
      }}
      aria-label={`${label}${isTapped ? ", tapped" : ""}`}
      aria-pressed={isSelected}
      title={`${label}: double-click to ${isTapped ? "untap" : "tap"}, right-click for actions`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
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
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-black/30 bg-base-300",
          isTapped && "brightness-[0.82]",
        )}
      >
        <CardThumb card={card} faceDown={status.faceDown} />
      </div>
      {netCounters !== 0 || status.markers || status.power || status.toughness ? (
        <div className="absolute inset-x-1 bottom-1.5 flex flex-wrap justify-center gap-1">
          {netCounters !== 0 ? (
            <CounterChip tone={netCounters > 0 ? "success" : "error"} onAdjust={adjustNet}>
              {netCounters > 0
                ? `+${netCounters}/+${netCounters}`
                : `${netCounters}/${netCounters}`}
            </CounterChip>
          ) : null}
          {status.markers ? (
            <CounterChip tone="info" onAdjust={(delta) => onAdjustCounter("markers", delta)}>
              <CircleDot className="h-3 w-3" aria-label="Markers" />
              {status.markers}
            </CounterChip>
          ) : null}
          {status.power || status.toughness ? (
            <CounterChip tone="warning">
              {status.power || "0"}/{status.toughness || "0"}
            </CounterChip>
          ) : null}
        </div>
      ) : null}
    </button>
  )
}

/**
 * Counter badge. Click adds one and Shift-click removes one; the card menu offers the same
 * controls as real buttons for keyboard and screen-reader users.
 */
function CounterChip({
  children,
  onAdjust,
  tone,
}: {
  children: ReactNode
  onAdjust?: (delta: number) => void
  tone: "success" | "error" | "info" | "warning"
}) {
  const tones = {
    error: "bg-error text-error-content",
    info: "bg-info text-info-content",
    success: "bg-success text-success-content",
    warning: "bg-warning text-warning-content",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-xs font-black leading-none shadow-[0_1px_3px_rgb(0_0_0/0.4)]",
        onAdjust && "cursor-pointer hover:brightness-110 active:scale-95",
        tones[tone],
      )}
      title={onAdjust ? "Click +1 · Shift-click −1" : undefined}
      onPointerDown={onAdjust ? (event) => event.stopPropagation() : undefined}
      onDoubleClick={onAdjust ? (event) => event.stopPropagation() : undefined}
      onClick={
        onAdjust
          ? (event) => {
              event.stopPropagation()
              onAdjust(event.shiftKey ? -1 : 1)
            }
          : undefined
      }
    >
      {children}
    </span>
  )
}
