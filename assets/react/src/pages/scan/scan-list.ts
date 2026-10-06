import type { Finish, FinishPrices, PrintingOption } from "./printing-choice"
import type { TrainingCapture } from "./scan-training"

/** The other printed side of a scanned single-faced token, as the user picked it. */
export interface ScanBackFace {
  scryfallId: string
  name: string
  imageUrl: string | null
}

/** One row of the scanned list; the newest scan is first. */
export interface ScanEntry {
  id: string
  /** Card key of the recognized artwork (see `cardKey`). */
  cardKey: string
  illustrationId: string | null
  name: string
  scryfallId: string
  setCode: string
  setName: string | null
  collectorNumber: string
  rarity: string | null
  finish: Finish
  finishes: Finish[]
  language: string
  quantity: number
  prices: FinishPrices
  imageUrl: string | null
  /** Scryfall layout of the resolved printing; `"token"` entries can carry a `back`. */
  layout?: string | null
  /** Picked other side of a single-faced token; `null` once the user said it has none. */
  back?: ScanBackFace | null
  /** False until the catalog printing lookup finished. */
  resolved: boolean
  scannedAt: number
  /** Set when the scan was uploaded for training; relabelled when the card is corrected. */
  training?: TrainingCapture | null
}

export const SCAN_LANGUAGES = [
  ["en", "English"],
  ["ja", "Japanese"],
  ["de", "German"],
  ["fr", "French"],
  ["it", "Italian"],
  ["es", "Spanish"],
  ["pt", "Portuguese"],
  ["ko", "Korean"],
  ["ru", "Russian"],
  ["zhs", "Chinese (Simplified)"],
  ["zht", "Chinese (Traditional)"],
] as const

export function entryPriceCents(entry: Pick<ScanEntry, "finish" | "prices">): number | null {
  return entry.prices[entry.finish]
}

/** Sum of the list's prices; a card priced below `minCents` (per copy) is left out. */
export function totalValueCents(entries: ScanEntry[], minCents = 0) {
  return entries.reduce((sum, entry) => {
    const price = entryPriceCents(entry) ?? 0
    return price < minCents ? sum : sum + price * entry.quantity
  }, 0)
}

export function totalQuantity(entries: ScanEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.quantity, 0)
}

/**
 * Applies a catalog printing (and its language) to an entry, keeping its quantity. A picked
 * token back only belongs to the printing it was picked for.
 */
export function withPrinting(
  entry: ScanEntry,
  printing: PrintingOption,
  finish: Finish,
): ScanEntry {
  return {
    ...entry,
    back: printing.scryfallId === entry.scryfallId ? entry.back : undefined,
    layout: printing.layout,
    name: printing.name,
    scryfallId: printing.scryfallId,
    setCode: printing.setCode,
    setName: printing.setName,
    collectorNumber: printing.collectorNumber,
    rarity: printing.rarity,
    finish,
    finishes: printing.finishes,
    language: printing.lang,
    prices: printing.prices,
    imageUrl: printing.imageUrl ?? entry.imageUrl,
    resolved: true,
  }
}

export function filterEntries(entries: ScanEntry[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return entries
  return entries.filter((entry) => {
    const text =
      `${entry.name} ${entry.setCode} ${entry.setName ?? ""} ${entry.collectorNumber}`.toLowerCase()
    return terms.every((term) => text.includes(term))
  })
}

/**
 * The back last settled for this token printing by another entry in the list (newest first):
 * a picked back, or `null` for "single-sided". `undefined` when no other entry has decided,
 * so the picker should ask.
 */
export function lastBackFor(
  entries: ScanEntry[],
  entry: Pick<ScanEntry, "id" | "scryfallId">,
): ScanBackFace | null | undefined {
  const other = entries.find(
    (candidate) =>
      candidate.id !== entry.id &&
      candidate.scryfallId === entry.scryfallId &&
      candidate.back !== undefined,
  )
  return other?.back
}

/**
 * Backs already picked in this scan session for the same token printing, newest first: other
 * entries fronted by it contribute their back, and entries whose back is it contribute their
 * own face. The server adds the same from owned tokens once the list is imported.
 */
export function sessionBacks(entries: ScanEntry[], entry: ScanEntry): ScanBackFace[] {
  const seen = new Set<string>()
  const backs: ScanBackFace[] = []
  for (const other of entries) {
    if (other.id === entry.id) continue
    const back =
      other.scryfallId === entry.scryfallId
        ? other.back
        : other.back?.scryfallId === entry.scryfallId
          ? { scryfallId: other.scryfallId, name: other.name, imageUrl: other.imageUrl }
          : null
    if (!back || back.scryfallId === entry.scryfallId || seen.has(back.scryfallId)) continue
    seen.add(back.scryfallId)
    backs.push(back)
  }
  return backs
}

const CSV_HEADERS = [
  "name",
  "set_code",
  "collector_number",
  "quantity",
  "finish",
  "language",
  "scryfall_id",
  "back_scryfall_id",
] as const

/**
 * The collection import's CSV columns, oldest scan first; `scryfall_id` pins the exact
 * printing. Unresolved entries still carry the recognized gallery printing, which is valid.
 * `back_scryfall_id` is the picked other side of a token; the import files tokens as owned
 * tokens rather than collection cards.
 */
export function scanListCsv(entries: ScanEntry[]) {
  const rows = [...entries]
    .reverse()
    .map((entry) =>
      [
        entry.name,
        entry.setCode,
        entry.collectorNumber,
        String(entry.quantity),
        entry.finish,
        entry.language,
        entry.scryfallId,
        entry.back?.scryfallId ?? "",
      ]
        .map(csvCell)
        .join(","),
    )
  return [CSV_HEADERS.join(","), ...rows].join("\n") + "\n"
}

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function formatCents(cents: number | null) {
  if (cents === null) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

/** Parsed stored list; malformed rows are dropped rather than breaking the page. */
export function normalizeScanList(value: unknown): ScanEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is ScanEntry =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof entry.id === "string" &&
      typeof entry.scryfallId === "string" &&
      typeof entry.quantity === "number" &&
      entry.quantity > 0,
  )
}
