import type { PlaytestCard } from "../../lib/deck-playtest"
import { cn } from "../../lib/utils"

export function CardThumb({
  card,
  compact = false,
  faceDown = false,
}: {
  card: PlaytestCard
  compact?: boolean
  faceDown?: boolean
}) {
  return (
    <div
      className={
        compact
          ? "h-20 w-14 shrink-0 overflow-hidden rounded-md bg-base-300"
          : "aspect-[5/7] overflow-hidden bg-base-300"
      }
    >
      {faceDown ? (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle,color-mix(in_oklch,var(--color-primary),transparent_70%),var(--color-base-300))] p-2 text-center text-xs font-black uppercase tracking-[0.18em] text-base-content/60">
          Face down
        </div>
      ) : card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.name}
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-base-content/50">
          <span
            className={cn(
              card.deckCardId === "playtest-token" && "font-black text-base-content/75",
            )}
          >
            {card.name}
          </span>
          {card.deckCardId === "playtest-token" ? (
            <span className="text-[0.6rem] uppercase tracking-[0.14em]">{card.typeLine}</span>
          ) : null}
        </div>
      )}
    </div>
  )
}
