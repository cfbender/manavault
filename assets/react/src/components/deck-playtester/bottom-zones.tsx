import {
  ChevronUp,
  Eye,
  EyeOff,
  Flame,
  Hand,
  Minus,
  Plus,
  Search,
  Shuffle,
  Skull,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { useRef, type DragEvent, type MouseEvent, type ReactNode } from "react"
import type { PlaytestCard, PlaytestZone } from "../../lib/deck-playtest"
import { cn } from "../../lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { ManaSymbol } from "../ui/mana-symbols"
import { countCardTypes } from "./battlefield-helpers"
import { CardThumb, SleeveBack } from "./card-thumb"
import { DRAG_MIME } from "./constants"
import { decodeDragPayload } from "./drag-helpers"

type CardHandlers = {
  onCardClick: (card: PlaytestCard, zone: PlaytestZone) => void
  onCardContextMenu: (card: PlaytestCard, zone: PlaytestZone, event: MouseEvent) => void
  onCardDragStart: (card: PlaytestCard, zone: PlaytestZone, event: DragEvent<HTMLElement>) => void
  onCardHover: (cardId: string, zone: PlaytestZone) => void
  onCardLeave: (cardId: string) => void
}

export type LibraryActions = {
  actionCount: number
  onActionCountChange: (count: number) => void
  onDraw: (count?: number) => void
  onExile: (count?: number) => void
  onLibrary: () => void
  onLook: () => void
  onMill: (count?: number) => void
  onScry: () => void
  onShuffle: () => void
  onSurveil: () => void
}

export function PlaytestBottomZones({
  command,
  dropTargetZone,
  exile,
  graveyard,
  hand,
  libraryActions,
  libraryCount,
  onDropCard,
  onViewZone,
  selectedCardId,
  ...handlers
}: CardHandlers & {
  command: PlaytestCard[]
  dropTargetZone: PlaytestZone | null
  exile: PlaytestCard[]
  graveyard: PlaytestCard[]
  hand: PlaytestCard[]
  libraryActions: LibraryActions
  libraryCount: number
  onDropCard: (cardId: string, from: PlaytestZone, to: PlaytestZone) => void
  onViewZone: (zone: "graveyard" | "exile") => void
  selectedCardId: string | null
}) {
  const dropProps = (zone: PlaytestZone) => ({
    "data-playtest-zone": zone,
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes(DRAG_MIME)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "move"
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      const payload = decodeDragPayload(event.dataTransfer.getData(DRAG_MIME))
      if (!payload) return
      event.preventDefault()
      onDropCard(payload.cardId, payload.from, zone)
    },
  })

  return (
    <footer className="col-span-full grid min-h-0 grid-cols-[repeat(4,minmax(0,1fr))] grid-rows-[minmax(0,1fr)_auto] border-t border-base-300 bg-base-100 md:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] md:grid-rows-1">
      <ZoneSlot
        className="order-2 md:order-none"
        isDropTarget={dropTargetZone === "library"}
        {...dropProps("library")}
      >
        <LibraryPile count={libraryCount} {...libraryActions} />
      </ZoneSlot>

      <section
        aria-label={`Hand, ${hand.length} cards`}
        className={cn(
          "relative order-1 col-span-full min-w-0 border-b border-base-300 transition-colors md:order-none md:col-span-1 md:border-b-0 md:border-x",
          dropTargetZone === "hand" && "bg-primary/10",
        )}
        {...dropProps("hand")}
      >
        <ZoneLabel className="absolute left-3 top-1.5 z-10" count={hand.length} title="Hand" />
        <FannedHand cards={hand} selectedCardId={selectedCardId} {...handlers} />
      </section>

      <ZoneSlot
        className="order-3 md:order-none"
        isDropTarget={dropTargetZone === "graveyard"}
        {...dropProps("graveyard")}
      >
        <VisiblePile
          badge={graveyard.length ? `${countCardTypes(graveyard)} types` : undefined}
          cards={graveyard}
          emptyIcon={Skull}
          onView={() => onViewZone("graveyard")}
          title="Graveyard"
          zone="graveyard"
          {...handlers}
        />
      </ZoneSlot>
      <ZoneSlot
        className="order-4 md:order-none"
        isDropTarget={dropTargetZone === "exile"}
        {...dropProps("exile")}
      >
        <VisiblePile
          cards={exile}
          emptyIcon={Flame}
          onView={() => onViewZone("exile")}
          title="Exile"
          zone="exile"
          {...handlers}
        />
      </ZoneSlot>
      <ZoneSlot
        className="order-5 md:order-none"
        isDropTarget={dropTargetZone === "command"}
        {...dropProps("command")}
      >
        <CommandPile cards={command} {...handlers} />
      </ZoneSlot>
    </footer>
  )
}

function ZoneSlot({
  children,
  className,
  isDropTarget,
  ...props
}: {
  children: ReactNode
  className?: string
  isDropTarget: boolean
  "data-playtest-zone": PlaytestZone
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-1 px-2 py-2 transition-colors md:w-[7.5rem] md:px-3",
        isDropTarget && "bg-primary/10 ring-2 ring-inset ring-primary/60",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  )
}

function ZoneLabel({
  className,
  count,
  title,
}: {
  className?: string
  count: number
  title: string
}) {
  return (
    <span className={cn("flex items-center gap-1.5 text-xs font-bold", className)}>
      <span className="text-base-content/70">{title}</span>
      <span className="font-mono font-black tabular-nums text-base-content">{count}</span>
    </span>
  )
}

const PILE_CARD = "relative aspect-[5/7] w-12 sm:w-14 md:w-[4.75rem]"

function LibraryPile({
  actionCount,
  count,
  onActionCountChange,
  onDraw,
  onExile,
  onLibrary,
  onLook,
  onMill,
  onScry,
  onShuffle,
  onSurveil,
}: LibraryActions & { count: number }) {
  const n = actionCount
  // Opening a viewer from the menu hands focus to the viewer instead of back to the trigger.
  const opensViewerRef = useRef(false)
  const openViewer = (open: () => void) => () => {
    opensViewerRef.current = true
    open()
  }
  const stackDepth = Math.min(3, Math.ceil(count / 20))
  const isEmpty = count === 0

  return (
    <>
      <button
        type="button"
        className={cn(
          PILE_CARD,
          "group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100",
          isEmpty && "cursor-not-allowed",
        )}
        onClick={() => onDraw(1)}
        disabled={isEmpty}
        aria-label={`Library, ${count} cards. Draw a card`}
        title="Click to draw (D)"
      >
        {isEmpty ? (
          <span className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-base-300 text-xs text-base-content/50">
            Empty
          </span>
        ) : (
          <>
            {Array.from({ length: stackDepth }, (_, index) => (
              <span
                key={index}
                aria-hidden="true"
                className="absolute inset-0 overflow-hidden rounded-md border border-black/30"
                style={{ transform: `translate(${(index + 1) * 2}px, ${(index + 1) * 2}px)` }}
              >
                <SleeveBack />
              </span>
            )).reverse()}
            <span className="absolute inset-0 overflow-hidden rounded-md border border-black/30 shadow-md transition-transform duration-150 ease-out group-hover:-translate-y-1 group-active:translate-y-0">
              <SleeveBack />
            </span>
          </>
        )}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 rounded-field px-1.5 py-0.5 hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Library actions, ${count} cards`}
          >
            <ZoneLabel count={count} title="Library" />
            <ChevronUp className="h-3.5 w-3.5 text-base-content/60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className="w-64"
          onCloseAutoFocus={(event) => {
            if (opensViewerRef.current) event.preventDefault()
            opensViewerRef.current = false
          }}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span className="text-xs font-bold text-base-content/70">How many cards</span>
            <div className="flex items-center rounded-field border border-base-300">
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square rounded-r-none"
                onClick={() => onActionCountChange(Math.max(1, n - 1))}
                disabled={n <= 1}
                aria-label="Fewer cards"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-7 text-center font-mono text-sm font-black tabular-nums">{n}</span>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square rounded-l-none"
                onClick={() => onActionCountChange(Math.min(99, n + 1))}
                aria-label="More cards"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <DropdownMenuSeparator />
          <LibraryMenuItem
            disabled={isEmpty}
            icon={Hand}
            label={`Draw ${n}`}
            onSelect={() => onDraw(n)}
          />
          <LibraryMenuItem
            disabled={isEmpty}
            icon={Eye}
            label={`Scry ${n}`}
            onSelect={openViewer(onScry)}
          />
          <LibraryMenuItem
            disabled={isEmpty}
            icon={EyeOff}
            label={`Surveil ${n}`}
            onSelect={openViewer(onSurveil)}
          />
          <LibraryMenuItem
            disabled={isEmpty}
            icon={Eye}
            label={`Look at top ${n}`}
            onSelect={openViewer(onLook)}
          />
          <LibraryMenuItem
            disabled={isEmpty}
            icon={Skull}
            label={`Mill ${n}`}
            onSelect={() => onMill(n)}
          />
          <LibraryMenuItem
            disabled={isEmpty}
            icon={Flame}
            label={`Exile top ${n}`}
            onSelect={() => onExile(n)}
          />
          <DropdownMenuSeparator />
          <LibraryMenuItem
            disabled={isEmpty}
            icon={Search}
            label="Search library"
            onSelect={openViewer(onLibrary)}
          />
          <LibraryMenuItem
            disabled={count < 2}
            icon={Shuffle}
            label="Shuffle"
            onSelect={onShuffle}
            shortcut="S"
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function LibraryMenuItem({
  disabled,
  icon: Icon,
  label,
  onSelect,
  shortcut,
}: {
  disabled?: boolean
  icon: LucideIcon
  label: string
  onSelect: () => void
  shortcut?: string
}) {
  return (
    <DropdownMenuItem disabled={disabled} onSelect={onSelect}>
      <Icon className="h-4 w-4 text-base-content/60" />
      <span className="min-w-0 flex-1">{label}</span>
      {shortcut ? <kbd className="kbd kbd-xs">{shortcut}</kbd> : null}
    </DropdownMenuItem>
  )
}

function FannedHand({
  cards,
  onCardClick,
  onCardContextMenu,
  onCardDragStart,
  onCardHover,
  onCardLeave,
  selectedCardId,
}: CardHandlers & { cards: PlaytestCard[]; selectedCardId: string | null }) {
  if (!cards.length) {
    return (
      <div className="flex h-full min-h-28 items-center justify-center px-4 pt-5 text-sm text-base-content/50">
        Your hand is empty. Click the library to draw.
      </div>
    )
  }

  return (
    <ol className="flex h-full items-end justify-center px-3 pb-2 pt-7 sm:px-4">
      {cards.map((card, index) => (
        <li
          key={card.id}
          // Slots shrink below the card width so cards overlap instead of scrolling.
          className="relative flex min-w-4 shrink basis-[var(--hand-card-width)] last:shrink-0 hover:!z-50 focus-within:!z-50"
          style={{ zIndex: index }}
        >
          {card.manaCost ? <ManaCostPips manaCost={card.manaCost} /> : null}
          <button
            type="button"
            data-playtest-card={card.id}
            className={cn(
              "relative w-[var(--hand-card-width)] shrink-0 cursor-grab overflow-hidden rounded-md border border-black/25 bg-base-200 shadow-[0_2px_6px_rgb(0_0_0/0.25)] transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-3 hover:shadow-[0_10px_22px_rgb(0_0_0/0.35)] focus-visible:-translate-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing",
              selectedCardId === card.id && "-translate-y-3 ring-2 ring-primary",
            )}
            title={`${card.name}: click to play, drag to place`}
            aria-label={`Play ${card.name}`}
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
        </li>
      ))}
    </ol>
  )
}

function VisiblePile({
  badge,
  cards,
  emptyIcon: EmptyIcon,
  onCardContextMenu,
  onCardDragStart,
  onCardHover,
  onCardLeave,
  onView,
  title,
  zone,
}: CardHandlers & {
  /** Extra pile fact shown on the top card, e.g. the delirium type count. */
  badge?: string
  cards: PlaytestCard[]
  emptyIcon: LucideIcon
  onView: () => void
  title: string
  zone: PlaytestZone
}) {
  const topCard = cards[0]

  return (
    <>
      {topCard ? (
        <button
          type="button"
          data-playtest-card={topCard.id}
          className={cn(
            PILE_CARD,
            "cursor-pointer overflow-hidden rounded-md border border-black/25 bg-base-200 shadow-md transition-transform duration-150 ease-out hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing",
          )}
          title={`${topCard.name}: click to view all ${title.toLowerCase()}, drag to move`}
          aria-label={`${title}, ${cards.length} cards. View all`}
          onClick={onView}
          draggable
          onContextMenu={(event) => onCardContextMenu(topCard, zone, event)}
          onDragStart={(event) => onCardDragStart(topCard, zone, event)}
          onMouseEnter={() => onCardHover(topCard.id, zone)}
          onMouseLeave={() => onCardLeave(topCard.id)}
        >
          <CardThumb card={topCard} />
          {badge ? (
            <span className="absolute inset-x-1 bottom-1 rounded bg-black/75 px-1 py-0.5 text-center font-mono text-xs font-bold leading-none text-white">
              {badge}
            </span>
          ) : null}
        </button>
      ) : (
        <div
          className={cn(
            PILE_CARD,
            "flex items-center justify-center rounded-md border border-dashed border-base-content/20 text-base-content/35",
          )}
          aria-label={`${title} is empty`}
        >
          <EmptyIcon className="h-5 w-5" />
        </div>
      )}
      <ZoneLabel count={cards.length} title={title} />
    </>
  )
}

function CommandPile({
  cards,
  onCardClick,
  onCardContextMenu,
  onCardDragStart,
  onCardHover,
  onCardLeave,
}: CardHandlers & { cards: PlaytestCard[] }) {
  const commander = cards[0]

  return (
    <>
      {commander ? (
        <button
          type="button"
          data-playtest-card={commander.id}
          className={cn(
            PILE_CARD,
            "cursor-grab overflow-hidden rounded-md border border-accent/70 bg-base-200 shadow-md ring-1 ring-accent/30 transition-transform duration-150 ease-out hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing",
          )}
          title={`${commander.name}: click to cast`}
          aria-label={`Cast ${commander.name}`}
          onClick={() => onCardClick(commander, "command")}
          draggable
          onContextMenu={(event) => onCardContextMenu(commander, "command", event)}
          onDragStart={(event) => onCardDragStart(commander, "command", event)}
          onMouseEnter={() => onCardHover(commander.id, "command")}
          onMouseLeave={() => onCardLeave(commander.id)}
          onFocus={() => onCardHover(commander.id, "command")}
          onBlur={() => onCardLeave(commander.id)}
        >
          <CardThumb card={commander} />
          {cards.length > 1 ? (
            <span className="absolute right-1 top-1 rounded bg-black/70 px-1 font-mono text-xs font-black text-white">
              +{cards.length - 1}
            </span>
          ) : null}
        </button>
      ) : (
        <div
          className={cn(
            PILE_CARD,
            "flex items-center justify-center rounded-md border border-dashed border-base-content/20 text-base-content/35",
          )}
        >
          <Sparkles className="h-5 w-5" />
        </div>
      )}
      <ZoneLabel count={cards.length} title="Command" />
    </>
  )
}

/**
 * The hovered hand card's mana cost, floated above it: overlapping hand cards hide the cost printed
 * in their top-right corner.
 */
function ManaCostPips({ manaCost }: { manaCost: string }) {
  const symbols = manaCost.match(/\{[^}]+\}/g) || []
  if (!symbols.length) return null

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -top-9 left-0 z-10 flex items-center rounded-field bg-base-100 px-1 py-0.5 text-sm opacity-0 shadow-[0_2px_6px_rgb(0_0_0/0.25)] transition-opacity duration-150 [li:focus-within>&]:opacity-100 [li:hover>&]:opacity-100"
    >
      {symbols.map((symbol, index) => (
        <ManaSymbol key={`${symbol}-${index}`} symbol={symbol} className="translate-y-0" />
      ))}
    </span>
  )
}
