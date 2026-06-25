type PrintingLabelSource = {
  collectorNumber?: string | null
  setCode?: string | null
  setName?: string | null
  card?: { name?: string | null } | null
}

type DeckCardPrintingLabelSource = {
  preferredPrinting?: PrintingLabelSource | null
}

type CollectionItemPrintingLabelSource = {
  printing?: PrintingLabelSource | null
}

const orderedFinishKeys = ["nonfoil", "foil", "etched"] as const

function normalizedFinish(finish: string | null | undefined) {
  if (finish == null) return "nonfoil"

  const normalized = finish.trim().toLowerCase()
  return normalized || "unknown"
}

function titleizeFinish(finish: string) {
  const label = finish.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ")

  if (!label) return "Unknown"

  return label.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function finishLabel(finish: string | null | undefined): string {
  const normalized = normalizedFinish(finish)

  if (normalized === "nonfoil") return "Nonfoil"
  if (normalized === "foil") return "Foil"
  if (normalized === "etched") return "Etched"
  if (normalized === "unknown") return "Unknown"

  return titleizeFinish(normalized)
}

export function isFoilFinish(finish: string | null | undefined): boolean {
  const normalized = normalizedFinish(finish)
  return normalized === "foil" || normalized === "etched"
}

export function allocationFinishCounts(
  entries: readonly { quantity: number; item: { finish?: string | null } }[],
): { finish: string; label: string; quantity: number }[] {
  const quantities = new Map<string, number>()

  for (const entry of entries) {
    const finish = normalizedFinish(entry.item.finish)
    quantities.set(finish, (quantities.get(finish) ?? 0) + entry.quantity)
  }

  const finishOrder = [
    ...orderedFinishKeys,
    ...Array.from(quantities.keys()).filter(
      (finish) => !orderedFinishKeys.includes(finish as (typeof orderedFinishKeys)[number]),
    ),
  ]

  return finishOrder
    .filter((finish) => quantities.has(finish))
    .map((finish) => ({
      finish,
      label: finishLabel(finish),
      quantity: quantities.get(finish) ?? 0,
    }))
}

export function deckCardPrintingLabel(deckCard: DeckCardPrintingLabelSource) {
  const printing = deckCard.preferredPrinting
  if (!printing) return "Any printing"

  return printingSetLabel(printing) || printing.setName || "Preferred printing"
}

export function collectionItemPrintingLabel(item: CollectionItemPrintingLabelSource) {
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
