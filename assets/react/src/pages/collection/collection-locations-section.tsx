import { Link } from "@tanstack/react-router"
import { PageSection } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { titleize } from "../../lib/utils"
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
        <div className="space-y-10">
          {locationGroups.map(([kind, locations]) => (
            <section key={kind} className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-black tracking-normal">{titleize(kind)}</h3>
                <span className="badge border-transparent bg-base-200 text-sm">
                  {locations.length}
                </span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {locations.map((location) => (
                  <div key={location.id} className="relative">
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
                        label={`${location.name} actions`}
                        onEdit={() => onEditLocation(location)}
                        onExportCsv={() => onExportLocation(location, "csv")}
                        onExportText={() => onExportLocation(location, "text")}
                        onDelete={() => onDeleteLocation(location)}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No locations found"
          description="Create a box, binder, or list location before sorting physical cards into the vault."
        />
      )}
    </PageSection>
  )
}
