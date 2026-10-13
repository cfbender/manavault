import { motion, useReducedMotion } from "motion/react"
import { useSyncExternalStore } from "react"
import { cn } from "../lib/utils"
import type { FullscreenPrinting } from "./fullscreen-printing-dialog"

const WIDE_QUERY = "(min-width: 640px)"

function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE_QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

/** Neighbors shown on each side: fewer on phones so the strip fits. */
function useWindowRadius() {
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  )
  return wide ? 7 : 3
}

/**
 * A strip of the neighboring cards under the full-screen card, the current
 * one raised. Picking a thumbnail deals that card up into view; the strip
 * slides so the current card stays centered.
 */
export function PrintingFilmstrip({
  cardName,
  currentIndex,
  onSelect,
  printings,
}: {
  cardName: string
  currentIndex: number
  onSelect: (printingId: string) => void
  printings: readonly FullscreenPrinting[]
}) {
  const reduceMotion = useReducedMotion()
  const radius = useWindowRadius()
  const start = Math.max(0, Math.min(currentIndex - radius, printings.length - 1 - radius * 2))
  const visible = printings.slice(start, start + radius * 2 + 1)

  return (
    <nav
      aria-label="Cards"
      className="printing-filmstrip relative z-20 -mx-3 flex shrink-0 justify-center overflow-hidden px-3 pb-[calc(var(--safe-bottom)+0.25rem)] pt-3 sm:mx-0 sm:px-0 sm:pb-0"
    >
      <ul className="flex items-end gap-1.5 sm:gap-2">
        {visible.map((printing) => {
          const current = printing.scryfallId === printings[currentIndex]?.scryfallId
          const name = printing.name || cardName
          const label = [name, printing.setCode?.toUpperCase(), printing.collectorNumber]
            .filter(Boolean)
            .join(" ")
          return (
            <motion.li
              key={printing.scryfallId}
              layout={!reduceMotion}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="shrink-0"
            >
              <button
                type="button"
                className={cn(
                  "printing-filmstrip__card block overflow-hidden rounded-[0.3rem] bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  current && "printing-filmstrip__card--current",
                )}
                aria-current={current ? "true" : undefined}
                aria-label={current ? `${label} (showing)` : `Show ${label}`}
                title={label}
                onClick={() => !current && onSelect(printing.scryfallId)}
              >
                {printing.imageUrl ? (
                  <img
                    src={printing.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                    loading="lazy"
                  />
                ) : null}
              </button>
            </motion.li>
          )
        })}
      </ul>
    </nav>
  )
}
