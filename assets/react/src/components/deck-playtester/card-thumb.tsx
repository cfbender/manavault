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
        <SleeveBack />
      ) : card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.name}
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-base-content/60">
          <span
            className={cn(
              card.deckCardId === "playtest-token" && "font-black text-base-content/80",
            )}
          >
            {card.name}
          </span>
          {card.deckCardId === "playtest-token" && card.typeLine ? (
            <span className="text-[0.6rem] uppercase tracking-[0.14em]">{card.typeLine}</span>
          ) : null}
        </div>
      )}
    </div>
  )
}

/** The ManaVault sleeve: used for the library stack and face-down cards. */
export function SleeveBack({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-[oklch(22%_0.045_350)] p-[7%]",
        className,
      )}
    >
      <div className="absolute inset-[5%] rounded-[6%] border border-[oklch(68%_0.11_72/0.55)]" />
      <div className="absolute inset-[9%] rounded-[5%] bg-[radial-gradient(circle_at_50%_42%,oklch(36%_0.11_10/0.9),transparent_68%)]" />
      <img
        src="/images/logo.png"
        alt=""
        className="relative w-[62%] opacity-90 drop-shadow-[0_2px_4px_rgb(0_0_0/0.45)]"
        draggable={false}
      />
    </div>
  )
}
