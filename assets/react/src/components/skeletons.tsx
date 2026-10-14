import { useCardSize } from "../lib/card-size"

/**
 * Card-shaped placeholders in the grid's own size and spacing, so the page
 * holds its layout while cards load instead of jumping from a message.
 */
export function CardGridSkeleton({ count = 10, label }: { count?: number; label: string }) {
  const size = useCardSize()

  return (
    <div
      // Inside a larger skeleton (no label) the outer one announces loading.
      role={label ? "status" : undefined}
      aria-busy={label ? true : undefined}
      className="grid justify-center gap-x-6 gap-y-8"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${size.widthRem}rem, 100%), ${size.widthRem}rem))`,
      }}
    >
      {label ? <span className="sr-only">{label}</span> : null}
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton aspect-[5/7] w-full rounded-xl" />
      ))}
    </div>
  )
}

// Location kinds, so each placeholder takes that object's width on the shelf.
const SHELF_KINDS = ["binder", "box", "deck_box", "box", "list"] as const

/** Object-shaped placeholders for the locations shelf. */
export function LocationShelfSkeleton({
  kinds = SHELF_KINDS,
  label,
}: {
  kinds?: readonly string[]
  label: string
}) {
  return (
    <div role="status" aria-busy="true" className="flex flex-wrap gap-x-3 gap-y-6 sm:gap-x-5">
      <span className="sr-only">{label}</span>
      {kinds.map((kind, index) => (
        <div
          key={index}
          className="location-tile flex flex-col items-center gap-2"
          data-kind={kind}
        >
          <div className="location-tile-stage flex w-full items-end justify-center px-4 pb-6 pt-5">
            <div className="skeleton h-full w-full rounded-lg" />
          </div>
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
      ))}
    </div>
  )
}

/** The location page while its location loads: the object, its label, and cards. */
export function LocationPageSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-7">
      <span className="sr-only">Loading location...</span>
      <div className="skeleton h-9 w-44 rounded-full" />
      <div className="items-center gap-6 md:grid md:grid-cols-[minmax(0,28rem)_1fr]">
        <div className="flex h-64 items-end justify-center px-10 pb-6 pt-5 md:h-80">
          <div className="skeleton h-full w-3/5 rounded-lg" />
        </div>
        <div className="space-y-3">
          <div className="skeleton h-5 w-40 rounded" />
          <div className="skeleton h-10 w-2/3 rounded" />
          <div className="skeleton h-4 w-48 rounded" />
        </div>
      </div>
      <CardGridSkeleton label="" count={8} />
    </div>
  )
}

/** The card page while its card loads: the hero panel, then printings. */
export function CardDetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-7xl space-y-7">
      <span className="sr-only">Loading card...</span>
      <div className="skeleton h-9 w-36 rounded-full" />
      <div className="skeleton min-h-80 w-full rounded-box" />
      <div className="skeleton h-6 w-32 rounded" />
      <CardGridSkeleton label="" count={6} />
    </div>
  )
}
