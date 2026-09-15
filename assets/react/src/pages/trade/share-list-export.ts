// Builds standard decklist text ("2x Card Name (SET) 123 *F*") from public
// share-list entries (wants or binder), so a viewer can paste the list into
// any ManaVault Matches tab or another deck tool. Printing info is omitted
// when an entry has none (generic wants), matching the decklist parser's
// optional segments.
export type ShareListExportEntry = {
  cardName: string
  quantity: number
  setCode?: string | null
  collectorNumber?: string | null
  finish?: string | null
}

export function shareListText(entries: readonly ShareListExportEntry[]): string {
  return entries
    .map(shareListLine)
    .filter((line): line is string => Boolean(line))
    .join("\n")
}

function shareListLine(entry: ShareListExportEntry): string | null {
  const name = entry.cardName.trim()
  if (!name) return null

  return [
    `${Math.max(entry.quantity || 0, 1)}x`,
    name,
    printingSegment(entry),
    finishSegment(entry.finish),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ")
}

function printingSegment(entry: ShareListExportEntry): string | null {
  if (!entry.setCode && !entry.collectorNumber) return null
  return `(${(entry.setCode || "").toUpperCase()}) ${entry.collectorNumber || ""}`.trim()
}

function finishSegment(finish?: string | null): string | null {
  if (finish === "foil") return "*F*"
  if (finish === "etched") return "*E*"
  return null
}
