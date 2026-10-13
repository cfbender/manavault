import type { ReactNode } from "react"
import { Badge } from "../../components/ui/badge"
import { Card } from "../../components/ui/card"
import { cn, compactNumber, titleize } from "../../lib/utils"
import { LocationObject, locationObjectCards, locationTransitionName } from "./location-object"
import type { LocationDetail, LocationSummary } from "./types"
import { collectionValueLine } from "./value-summary"

/**
 * A location drawn as its physical storage. The list tile and the location
 * page header share a view-transition name, so opening a location carries the
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
  const valueLine = collectionValueLine(location.valueSummary)

  return (
    <Card
      className={cn(
        "location-card group/location relative overflow-hidden",
        header ? "md:grid md:grid-cols-[minmax(0,24rem)_1fr]" : "location-card--interactive",
      )}
    >
      <LocationObject
        cards={locationObjectCards(location)}
        className={header ? "h-60 md:h-full md:min-h-64" : "h-52"}
        coverArtUrl={location.coverPrinting?.artCropUrl}
        kind={location.kind}
        transitionName={locationTransitionName(location.id)}
      />
      <div className={cn("relative flex min-w-0 flex-col gap-2", header ? "p-6" : "p-5 pt-4")}>
        <div className="flex flex-wrap items-center gap-2 pr-12">
          <Badge>{titleize(location.kind)}</Badge>
          <span className="font-mono text-sm font-bold text-base-content/70">
            {compactNumber(location.itemCount || 0)} cards
          </span>
        </div>
        <h3
          className={cn(
            "min-w-0 font-black tracking-normal",
            header ? "line-clamp-2 text-4xl" : "truncate text-2xl",
          )}
        >
          {location.name}
        </h3>
        {valueLine ? (
          <div className="font-mono text-sm font-bold text-base-content/75">{valueLine}</div>
        ) : null}
        {header && location.description ? (
          <p className="mt-1 max-w-2xl text-sm text-base-content/65">{location.description}</p>
        ) : null}
      </div>
      {actionSlot}
    </Card>
  )
}
