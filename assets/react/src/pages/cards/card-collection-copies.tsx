import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Edit3 } from "lucide-react"
import { useState } from "react"
import { Button } from "../../components/ui/button"
import { request } from "../../lib/graphql"
import { present, titleize } from "../../lib/utils"
import {
  EditCollectionItemDialog,
  invalidateCollectionViews,
  type CollectionItem,
} from "../collection"
import { CardCollectionItemsDocument, type CardCollectionItem } from "./data"

type NodeConnection<T> = {
  edges?: ReadonlyArray<{ node?: T | null } | null> | null
} | null | undefined

function connectionNodes<T>(connection: NodeConnection<T>): T[] {
  return connection?.edges?.map((edge) => edge?.node).filter(present) || []
}

function copyLabel(count: number) {
  return `${count} ${count === 1 ? "copy" : "copies"}`
}

function itemSetLabel(item: CardCollectionItem) {
  const printing = item.printing
  const setCode = printing?.setCode?.toUpperCase() || "?"
  const collectorNumber = printing?.collectorNumber || "?"

  return `${setCode} #${collectorNumber}`
}

function itemSummaryParts(item: CardCollectionItem) {
  return [
    copyLabel(item.quantity),
    titleize(item.finish),
    titleize(item.condition),
    item.language?.toUpperCase(),
  ].filter(present)
}

export function CardCollectionCopiesPanel({
  cardId,
  cardQueryId,
}: {
  cardId: string
  cardQueryId: string
}) {
  const queryClient = useQueryClient()
  const [editItem, setEditItem] = useState<CollectionItem | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ["card-collection-items", cardId],
    queryFn: () => request(CardCollectionItemsDocument, { cardId }),
  })
  const items = connectionNodes(data?.collectionItems)
  const copyCount = data?.collectionItemCount ?? items.reduce((total, item) => total + item.quantity, 0)

  if (!isLoading && items.length === 0) return null

  function handleEdited() {
    queryClient.invalidateQueries({ queryKey: ["card-collection-items", cardId] })
    queryClient.invalidateQueries({ queryKey: ["card", cardQueryId] })
    invalidateCollectionViews(queryClient, editItem?.location?.id)
  }

  return (
    <section className="rounded-box border border-base-300 bg-base-100 shadow-sm">
      <div className="flex flex-col gap-1 border-b border-base-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black">Copies in collection</h2>
          <p className="text-sm text-base-content/60">
            {isLoading ? "Checking owned copies..." : `${copyLabel(copyCount)} available to edit`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="px-4 py-4 text-sm text-base-content/60">Loading collection copies...</p>
      ) : (
        <div className="divide-y divide-base-300">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              {item.printing?.imageUrl ? (
                <img
                  src={item.printing.imageUrl}
                  alt=""
                  className="h-20 w-14 rounded-lg object-cover shadow"
                />
              ) : null}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-bold">{itemSetLabel(item)}</p>
                  {item.printing?.setName ? (
                    <p className="text-sm text-base-content/60">{item.printing.setName}</p>
                  ) : null}
                </div>
                <p className="text-sm text-base-content/70">{itemSummaryParts(item).join(" · ")}</p>
                <p className="text-xs text-base-content/55">
                  {item.location?.name || "Unfiled"}
                  {item.priceText ? ` · Current ${item.priceText}` : ""}
                  {item.purchasePriceText ? ` · Paid ${item.purchasePriceText}` : ""}
                </p>
                {item.notes ? <p className="text-xs text-base-content/55">{item.notes}</p> : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditItem(item)}
                aria-label={`Edit ${item.printing?.card?.name || "collection item"} ${itemSetLabel(item)}`}
              >
                <Edit3 className="h-4 w-4" />
                Edit
              </Button>
            </div>
          ))}
        </div>
      )}

      {data?.collectionItems.pageInfo.hasNextPage ? (
        <p className="border-t border-base-300 px-4 py-3 text-xs text-base-content/55">
          Showing the first 100 collection rows for this card.
        </p>
      ) : null}

      <EditCollectionItemDialog
        item={editItem}
        onDone={handleEdited}
        onOpenChange={(open) => !open && setEditItem(null)}
      />
    </section>
  )
}
