import { useSyncExternalStore, type CSSProperties } from "react"
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
 *
 * Each thumbnail is placed by a CSS transform computed from its slot, so
 * sliding is a compositor transition: a layout animation would measure the
 * page after every change, which stalls phones for a noticeable moment.
 * Thumbnails past each end stay drawn, faded out, so the strip slides cards
 * in and out instead of popping them.
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
  const radius = useWindowRadius()
  const start = Math.max(0, Math.min(currentIndex - radius, printings.length - 1 - radius * 2))
  const count = Math.min(printings.length, radius * 2 + 1)
  // Hidden thumbnails past each end, as many as a pick can move the strip, so
  // every thumbnail entering the strip slides in from where it waited.
  const firstDrawn = Math.max(0, start - radius)
  const drawn = printings.slice(firstDrawn, start + count + radius)

  return (
    <nav
      aria-label="Cards"
      className="printing-filmstrip relative z-20 -mx-3 shrink-0 overflow-hidden px-3 pb-[calc(var(--safe-bottom)+0.25rem)] pt-3 sm:mx-0 sm:px-0 sm:pb-0"
    >
      <ul className="printing-filmstrip__track" style={{ "--count": count } as CSSProperties}>
        {drawn.map((printing, offset) => {
          const index = firstDrawn + offset
          const slot = index - start
          const current = index === currentIndex
          const shown = slot >= 0 && slot < count
          const name = printing.name || cardName
          const label = [name, printing.setCode?.toUpperCase(), printing.collectorNumber]
            .filter(Boolean)
            .join(" ")
          return (
            <li
              key={printing.scryfallId}
              className="printing-filmstrip__slot"
              data-shown={shown || undefined}
              inert={!shown}
              style={
                {
                  "--slot": slot,
                  "--after-current": index > currentIndex ? 1 : 0,
                  "--is-current": current ? 1 : 0,
                } as CSSProperties
              }
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
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
