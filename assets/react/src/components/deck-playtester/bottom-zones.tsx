import { EyeOff, Flame, Skull, Sparkles, type LucideIcon } from "lucide-react"
import type { DragEvent, MouseEvent, ReactNode } from "react"
import type { PlaytestCard, PlaytestZone } from "../../lib/deck-playtest"
import { cn } from "../../lib/utils"
import { CardThumb } from "./card-thumb"

export function PlaytestBottomZones({
  command,
  exile,
  graveyard,
  hand,
  libraryCount,
  onCardClick,
  onCardContextMenu,
  onCardDragStart,
  onCardHover,
  onCardLeave,
  selectedCardId,
}: {
  command: PlaytestCard[]
  exile: PlaytestCard[]
  graveyard: PlaytestCard[]
  hand: PlaytestCard[]
  libraryCount: number
  onCardClick: (card: PlaytestCard, zone: PlaytestZone) => void
  onCardContextMenu: (card: PlaytestCard, zone: PlaytestZone, event: MouseEvent) => void
  onCardDragStart: (card: PlaytestCard, zone: PlaytestZone, event: DragEvent<HTMLElement>) => void
  onCardHover: (cardId: string, zone: PlaytestZone) => void
  onCardLeave: (cardId: string) => void
  selectedCardId: string | null
}) {
  return (
    <footer className="col-span-full row-start-4 grid min-h-0 grid-cols-4 grid-rows-[minmax(0,1fr)_5.5rem] border-t border-base-300 bg-base-100/95 text-xs shadow-2xl lg:row-start-3 lg:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem_8rem] lg:grid-rows-none">
      <ZoneStrip
        title="Hand"
        count={hand.length}
        className="col-span-full border-b border-base-300 lg:col-span-1 lg:border-b-0 lg:border-r"
      >
        <div className="flex h-full items-end gap-2 overflow-x-auto px-2 pb-2 pt-5">
          {hand.map((card) => (
            <button
              key={card.id}
              type="button"
              className={cn(
                "group relative h-[6.25rem] w-[4.5rem] shrink-0 cursor-grab rounded-md border border-base-300 bg-base-200 shadow transition hover:-translate-y-2 hover:border-primary active:cursor-grabbing active:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-[8.7rem] sm:w-[6.25rem]",
                selectedCardId === card.id && "border-primary ring-2 ring-primary/35",
              )}
              title={`Play ${card.name}`}
              onClick={() => onCardClick(card, "hand")}
              draggable
              onContextMenu={(event) => onCardContextMenu(card, "hand", event)}
              onDragStart={(event) => onCardDragStart(card, "hand", event)}
              onMouseEnter={() => onCardHover(card.id, "hand")}
              onMouseLeave={() => onCardLeave(card.id)}
              onFocus={() => onCardHover(card.id, "hand")}
              onBlur={() => onCardLeave(card.id)}
            >
              <CardThumb card={card} />
            </button>
          ))}
        </div>
      </ZoneStrip>
      <PileZone title="Library" count={libraryCount} icon={EyeOff} />
      <VisiblePileZone
        title="Graveyard"
        cards={graveyard}
        icon={Skull}
        onCardClick={(card) => onCardClick(card, "graveyard")}
        onCardContextMenu={(card, event) => onCardContextMenu(card, "graveyard", event)}
        onCardDragStart={(card, event) => onCardDragStart(card, "graveyard", event)}
        onCardHover={(card) => onCardHover(card.id, "graveyard")}
        onCardLeave={(card) => onCardLeave(card.id)}
      />
      <VisiblePileZone
        title="Exile"
        cards={exile}
        icon={Flame}
        onCardClick={(card) => onCardClick(card, "exile")}
        onCardContextMenu={(card, event) => onCardContextMenu(card, "exile", event)}
        onCardDragStart={(card, event) => onCardDragStart(card, "exile", event)}
        onCardHover={(card) => onCardHover(card.id, "exile")}
        onCardLeave={(card) => onCardLeave(card.id)}
      />
      <VisiblePileZone
        title="Command"
        cards={command}
        icon={Sparkles}
        onCardClick={(card) => onCardClick(card, "command")}
        onCardContextMenu={(card, event) => onCardContextMenu(card, "command", event)}
        onCardDragStart={(card, event) => onCardDragStart(card, "command", event)}
        onCardHover={(card) => onCardHover(card.id, "command")}
        onCardLeave={(card) => onCardLeave(card.id)}
      />
    </footer>
  )
}

function ZoneStrip({
  children,
  className,
  count,
  title,
}: {
  children: ReactNode
  className?: string
  count: number
  title: string
}) {
  return (
    <section className={cn("relative min-w-0", className)}>
      <div className="absolute left-2 top-1 z-10 flex items-center gap-1 text-[0.62rem] font-black uppercase tracking-[0.18em] text-base-content/45">
        {title} ({count})
      </div>
      {children}
    </section>
  )
}

function PileZone({
  count,
  icon: Icon,
  title,
}: {
  count: number
  icon: LucideIcon
  title: string
}) {
  return (
    <ZoneStrip title={title} count={count} className="border-r border-base-300">
      <div className="flex h-full items-center justify-center p-2 pt-5">
        <div className="flex aspect-[5/7] w-14 flex-col items-center justify-center rounded-md border border-base-300 bg-base-200 text-base-content/50 shadow-inner sm:w-20">
          <Icon className="h-5 w-5" />
          <span className="mt-2 font-black tabular-nums">{count}</span>
        </div>
      </div>
    </ZoneStrip>
  )
}

function VisiblePileZone({
  cards,
  icon,
  onCardClick,
  onCardContextMenu,
  onCardDragStart,
  onCardHover,
  onCardLeave,
  title,
}: {
  cards: PlaytestCard[]
  icon: LucideIcon
  onCardClick: (card: PlaytestCard) => void
  onCardContextMenu: (card: PlaytestCard, event: MouseEvent) => void
  onCardDragStart: (card: PlaytestCard, event: DragEvent<HTMLElement>) => void
  onCardHover: (card: PlaytestCard) => void
  onCardLeave: (card: PlaytestCard) => void
  title: string
}) {
  const topCard = cards[0]

  return (
    <ZoneStrip
      title={title}
      count={cards.length}
      className="border-r border-base-300 last:border-r-0"
    >
      <div className="flex h-full items-center justify-center p-2 pt-5">
        {topCard ? (
          <button
            type="button"
            className="aspect-[5/7] w-14 cursor-grab overflow-hidden rounded-md border border-base-300 bg-base-200 shadow transition hover:-translate-y-1 hover:border-primary active:cursor-grabbing active:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-20"
            title={topCard.name}
            onClick={() => onCardClick(topCard)}
            draggable
            onContextMenu={(event) => onCardContextMenu(topCard, event)}
            onDragStart={(event) => onCardDragStart(topCard, event)}
            onMouseEnter={() => onCardHover(topCard)}
            onMouseLeave={() => onCardLeave(topCard)}
            onFocus={() => onCardHover(topCard)}
            onBlur={() => onCardLeave(topCard)}
          >
            <CardThumb card={topCard} />
          </button>
        ) : (
          <PileZoneCard count={cards.length} icon={icon} />
        )}
      </div>
    </ZoneStrip>
  )
}

function PileZoneCard({ count, icon: Icon }: { count: number; icon: LucideIcon }) {
  return (
    <div className="flex aspect-[5/7] w-14 flex-col items-center justify-center rounded-md border border-dashed border-base-300 bg-base-200/55 text-base-content/40 sm:w-20">
      <Icon className="h-5 w-5" />
      <span className="mt-2 font-black tabular-nums">{count}</span>
    </div>
  )
}
