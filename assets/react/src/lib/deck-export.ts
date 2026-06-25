export type ExportableDeckCard = {
  card?: { name?: string | null } | null
  finish?: string | null
  preferredPrinting?: {
    collectorNumber?: string | null
    setCode?: string | null
  } | null
  quantity?: number | null
  zone?: string | null
}

const EXPORT_ZONES = ["mainboard", "sideboard", "commander", "maybeboard"] as const

export function exportDecklistText(deckCards: ExportableDeckCard[]) {
  return EXPORT_ZONES.map((zone) => exportZone(deckCards, zone))
    .filter((section): section is string => Boolean(section))
    .join("\n\n")
}

function exportZone(deckCards: ExportableDeckCard[], zone: string) {
  const lines = deckCards
    .filter((deckCard) => deckCard.zone === zone)
    .sort((left, right) =>
      (left.card?.name?.trim() || "").localeCompare(right.card?.name?.trim() || ""),
    )
    .map(exportLine)
    .filter(Boolean)

  if (!lines.length) return null

  const label =
    zone === "mainboard"
      ? "Mainboard"
      : zone === "sideboard"
        ? "Sideboard"
        : zone === "commander"
          ? "Commander"
          : zone === "maybeboard"
            ? "Maybeboard"
            : zone.charAt(0).toUpperCase() + zone.slice(1)

  return `${label}\n${lines.join("\n")}`
}

function exportLine(deckCard: ExportableDeckCard) {
  const name = deckCard.card?.name?.trim() || ""
  if (!name) return null

  return [
    `${Math.max(deckCard.quantity || 0, 0)}x`,
    name,
    exportPrinting(deckCard.preferredPrinting),
    exportFinish(deckCard.finish),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ")
}

function exportPrinting(printing: ExportableDeckCard["preferredPrinting"]) {
  if (!printing?.setCode && !printing?.collectorNumber) return null
  return `(${(printing.setCode || "").toUpperCase()}) ${printing.collectorNumber || ""}`.trim()
}

function exportFinish(finish?: string | null) {
  if (finish === "foil") return "*F*"
  if (finish === "etched") return "*E*"
  return null
}
