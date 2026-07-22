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

export type DeckExportOptions = {
  /** Zones to include. Sections always follow decklist order. Defaults to all zones. */
  zones?: readonly string[]
  /** Prepend a header line (e.g. "Mainboard") to each zone section. Defaults to true. */
  zoneHeaders?: boolean
  /** Append "(SET) collector-number" when a preferred printing is known. Defaults to true. */
  includePrinting?: boolean
  /** Append finish markers like *F* (foil) and *E* (etched). Defaults to true. */
  includeFinish?: boolean
  /** Quantity prefix style. Defaults to "1x". */
  quantityStyle?: "1x" | "1"
}

export const EXPORT_ZONES = ["mainboard", "sideboard", "commander", "maybeboard"] as const

export const EXPORT_ZONE_LABELS: Record<(typeof EXPORT_ZONES)[number], string> = {
  mainboard: "Mainboard",
  sideboard: "Sideboard",
  commander: "Commander",
  maybeboard: "Maybeboard",
}

export function exportDecklistText(
  deckCards: ExportableDeckCard[],
  options: DeckExportOptions = {},
) {
  const includedZones = new Set(options.zones ?? EXPORT_ZONES)

  return EXPORT_ZONES.filter((zone) => includedZones.has(zone))
    .map((zone) => exportZone(deckCards, zone, options))
    .filter((section): section is string => Boolean(section))
    .join("\n\n")
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportZone(deckCards: ExportableDeckCard[], zone: string, options: DeckExportOptions) {
  const lines = deckCards
    .filter((deckCard) => deckCard.zone === zone)
    .sort((left, right) =>
      (left.card?.name?.trim() || "").localeCompare(right.card?.name?.trim() || ""),
    )
    .map((deckCard) => exportLine(deckCard, options))
    .filter(Boolean)

  if (!lines.length) return null

  const body = lines.join("\n")
  if (options.zoneHeaders === false) return body

  const label =
    EXPORT_ZONE_LABELS[zone as keyof typeof EXPORT_ZONE_LABELS] ||
    zone.charAt(0).toUpperCase() + zone.slice(1)
  return `${label}\n${body}`
}

function exportLine(deckCard: ExportableDeckCard, options: DeckExportOptions) {
  const name = deckCard.card?.name?.trim() || ""
  if (!name) return null

  const quantity =
    options.quantityStyle === "1"
      ? `${Math.max(deckCard.quantity || 0, 0)}`
      : `${Math.max(deckCard.quantity || 0, 0)}x`

  return [
    quantity,
    name,
    options.includePrinting === false ? null : exportPrinting(deckCard.preferredPrinting),
    options.includeFinish === false ? null : exportFinish(deckCard.finish),
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
