import type { ReactNode } from "react"
import { Badge } from "../../components/ui/badge"
import { compactNumber, titleize } from "../../lib/utils"
import { LocationObject, locationObjectCards, locationTransitionName } from "./location-object"
import type { LocationDetail, LocationSummary } from "./types"
import { collectionValueLine } from "./value-summary"

/**
 * A location drawn as its physical storage, standing on the page with its
 * label beneath (no card around it). The list tile and the location page
 * header share a view-transition name, so opening a location carries the
 * object into the page while the text cross-fades.
 */
export function LocationCard({
  actionSlot,
  location,
  variant = "tile",
}: {
  actionSlot?: ReactNode
  location: LocationSummary | LocationDetail
  variant?: "header" | "tile"
}) {
  const header = variant === "header"
  const object = (
    <LocationObject
      cards={locationObjectCards(location)}
      className={header ? "h-64 md:h-80" : "location-tile-stage"}
      coverArtUrl={location.coverPrinting?.artCropUrl}
      kind={location.kind}
      seed={location.id}
      stickers={location.stickers}
      transitionName={locationTransitionName(location.id)}
    />
  )

  if (!header) {
    return (
      <div className="location-card location-card--interactive relative">
        {object}
        <div className="mt-1 min-w-0 px-2 text-center">
          <h3 className="line-clamp-2 text-lg font-black leading-tight tracking-normal sm:text-xl">
            {location.name}
          </h3>
          <div className="mt-1 truncate font-mono text-xs font-bold text-base-content/65 sm:text-sm">
            {compactNumber(location.itemCount || 0)} cards
            {location.valueSummary.totalPriceText ? (
              <> · {location.valueSummary.totalPriceText}</>
            ) : null}
          </div>
        </div>
        {actionSlot}
      </div>
    )
  }

  return (
    <div className="location-card relative items-center gap-6 md:grid md:grid-cols-[minmax(0,28rem)_1fr]">
      {object}
      <div className="flex min-w-0 flex-col gap-2 pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{titleize(location.kind)}</Badge>
          <span className="font-mono text-sm font-bold text-base-content/70">
            {compactNumber(location.itemCount || 0)} cards
          </span>
        </div>
        <h3 data-page-heading className="line-clamp-2 min-w-0 text-4xl font-black tracking-normal">
          {location.name}
        </h3>
        <div className="font-mono text-sm font-bold text-base-content/75">
          {collectionValueLine(location.valueSummary)}
        </div>
        {location.description ? (
          <p className="mt-1 max-w-2xl text-sm text-base-content/65">{location.description}</p>
        ) : null}
      </div>
      {actionSlot}
    </div>
  )
}
