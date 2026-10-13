import { Link } from "@tanstack/react-router"
import { PageSection } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { LocationCard } from "./location-card"
import { SummaryActionMenu, isUnfiledLocation } from "./location-summary"
import type { CollectionExportFormat, LocationSummary } from "./types"

type CollectionLocationsSectionProps = {
  isLoading: boolean
  locationCount: number
  locationGroups: Array<[string, LocationSummary[]]>
  onDeleteLocation: (location: LocationSummary) => void
  onEditLocation: (location: LocationSummary) => void
  onExportLocation: (location: LocationSummary, format: CollectionExportFormat) => void
}

export function CollectionLocationsSection({
  isLoading,
  locationCount,
  locationGroups,
  onDeleteLocation,
  onEditLocation,
  onExportLocation,
}: CollectionLocationsSectionProps) {
  return (
    <PageSection title="Locations" count={`${locationCount} total`}>
      {isLoading ? (
        <EmptyState title="Loading locations..." />
      ) : locationGroups.length ? (
        // One shelf of objects sized to their own shapes, grouped by kind in
        // order, so rows pack tightly instead of leaving a row per kind.
        <ul className="flex flex-wrap gap-x-3 gap-y-6 sm:gap-x-5">
          {locationGroups
            .flatMap(([, locations]) => locations)
            .map((location) => (
              <li
                key={location.id}
                className="location-tile group/tile relative"
                data-kind={location.kind}
              >
                <Link
                  to="/collection/locations/$id"
                  params={{ id: location.id }}
                  className="block rounded-box focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  viewTransition
                >
                  <LocationCard location={location} />
                </Link>
                {!isUnfiledLocation(location) ? (
                  <SummaryActionMenu
                    className="right-0 top-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/tile:opacity-100 [@media(hover:hover)]:group-focus-within/tile:opacity-100"
                    label={`${location.name} actions`}
                    onEdit={() => onEditLocation(location)}
                    onExportCsv={() => onExportLocation(location, "csv")}
                    onExportText={() => onExportLocation(location, "text")}
                    onDelete={() => onDeleteLocation(location)}
                  />
                ) : null}
              </li>
            ))}
        </ul>
      ) : (
        <EmptyState
          title="No locations found"
          description="Create a box, binder, or list location before sorting physical cards into the vault."
        />
      )}
    </PageSection>
  )
}
