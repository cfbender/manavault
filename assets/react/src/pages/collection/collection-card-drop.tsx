import { useApolloClient, useMutation } from "@apollo/client/react"

import {
  CardDropOverlay,
  droppedPrintingFinish,
  type DroppedPrinting,
} from "../../components/card-drop-overlay"
import { useToast } from "../../components/ui/toast"
import { cn } from "../../lib/utils"
import { invalidateCollectionViews } from "./collection-navigation"
import { CreateCollectionItemDocument } from "./items/documents"
import { LocationObject, locationObjectCards } from "./location-object"
import { isUnfiledLocation } from "./location-summary"
import type { LocationDetail, LocationSummary } from "./types"

/**
 * One drop zone over the collection: a card dragged in from another page is
 * added as one near-mint copy to the location being viewed (unfiled from the
 * collection overview). The zone draws that location, open to take the card.
 */
export function CollectionCardDrop({
  enabled = true,
  location,
}: {
  enabled?: boolean
  location: LocationSummary | LocationDetail | null | undefined
}) {
  const client = useApolloClient()
  const { showToast } = useToast()
  const [createItem] = useMutation(CreateCollectionItemDocument)
  const target = location && !isUnfiledLocation(location) ? location : null
  const label = target?.name ?? "Unfiled"

  async function addDroppedCard(_zone: "collection", printing: DroppedPrinting) {
    await createItem({
      variables: {
        input: {
          scryfallId: printing.id,
          quantity: 1,
          condition: "near_mint",
          finish: droppedPrintingFinish(printing),
          language: "en",
          locationId: target?.id ?? null,
        },
      },
    })
    void invalidateCollectionViews(client, target?.id)
    showToast(`${printing.card?.name ?? "Card"} added to ${label}`)
  }

  return (
    <CardDropOverlay
      enabled={enabled}
      onDropCard={addDroppedCard}
      zones={[
        {
          id: "collection",
          title: target ? target.name : "Collection",
          hint: target
            ? `Drop to add a copy to this ${target.kind === "list" ? "list" : "location"}.`
            : "Drop to add a copy to your unfiled cards.",
          art: ({ open, landing }) => (
            <div
              className={cn(
                "location-card location-card--interactive w-full max-w-md",
                open && "is-open",
                landing && "lo-receive",
              )}
            >
              <LocationObject
                cards={location ? locationObjectCards(location) : []}
                className="h-56 md:h-72"
                coverArtUrl={location?.coverPrinting?.artCropUrl}
                kind={location?.kind ?? "unfiled"}
                seed={location?.id ?? "unfiled"}
                stickers={location?.stickers}
              />
            </div>
          ),
        },
      ]}
    />
  )
}
