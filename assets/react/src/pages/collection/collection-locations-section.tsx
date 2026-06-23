import { Link } from "@tanstack/react-router"
import { Boxes } from "lucide-react"
import { PageSection } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { ImageSummaryCard } from "../../components/image-summary-card"
import { Badge } from "../../components/ui/badge"
import { compactNumber, titleize } from "../../lib/utils"
import { SummaryActionMenu, UnfiledLocationCard, isUnfiledLocation } from "./location-summary"
import type { CollectionExportFormat, LocationSummary } from "./types"
import { collectionValueLine } from "./value-summary"

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
    <PageSection count={`${locationCount} total`}>
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
              <div className="grid gap-5 md:grid-cols-2">
                {locations.map((location) => (
                  <div key={location.id} className="relative">
                    <Link
                      to="/collection/locations/$id"
                      params={{ id: location.id }}
                      className="block"
                    >
                      {isUnfiledLocation(location) ? (
                        <UnfiledLocationCard
                          location={location}
                          countLine={`${compactNumber(location.itemCount || 0)} cards`}
                          priceLine={collectionValueLine(location.valueSummary)}
                        />
                      ) : (
                        <ImageSummaryCard
                          imageUrl={location.coverPrinting?.artCropUrl}
                          fallback={<Boxes className="h-12 w-12" />}
                          typeLine={<Badge>{titleize(location.kind)}</Badge>}
                          countLine={`${compactNumber(location.itemCount || 0)} cards`}
                          priceLine={collectionValueLine(location.valueSummary)}
                          nameLine={location.name}
                        />
                      )}
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
        <EmptyState title="No locations found" />
      )}
    </PageSection>
  )
}
