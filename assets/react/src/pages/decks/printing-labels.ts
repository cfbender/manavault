import type { BulkAllocationPreview } from "./deck-types"

export function deckCardPrintingLabel(
  deckCard: BulkAllocationPreview["entries"][number]["deckCard"],
) {
  const printing = deckCard.preferredPrinting
  if (!printing) return "Any printing"

  return printingSetLabel(printing) || printing.setName || "Preferred printing"
}

export function collectionItemPrintingLabel(
  item: BulkAllocationPreview["entries"][number]["item"],
) {
  const printing = item.printing
  return (
    printingSetLabel(printing) || printing?.setName || printing?.card?.name || "Collection item"
  )
}

export function printingSetLabel(
  printing?: { collectorNumber?: string | null; setCode?: string | null } | null,
) {
  return [
    printing?.setCode?.toUpperCase(),
    printing?.collectorNumber ? `#${printing.collectorNumber}` : null,
  ]
    .filter(Boolean)
    .join(" ")
}
