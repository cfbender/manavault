/**
 * Recognition identifies artwork, not the exact printing: reprints share art. This picks the
 * printing a scan is logged as until the user changes it.
 */
import type { ScanSettings } from "./scan-settings"

export type Finish = "nonfoil" | "foil" | "etched"

export type FinishPrices = Record<Finish, number | null>

export interface PrintingOption {
  scryfallId: string
  name: string
  setCode: string
  setName: string | null
  collectorNumber: string
  lang: string
  rarity: string | null
  illustrationId: string | null
  ownedCount: number
  finishes: Finish[]
  promo: boolean
  releasedAt: string | null
  imageUrl: string | null
  /** The printed back of a double-faced card or token, when Scryfall has one. */
  backImageUrl: string | null
  /** Scryfall layout, e.g. "normal", "token", "double_faced_token". */
  layout: string | null
  prices: FinishPrices
}

/** A single-faced token printing, whose physical back Scryfall does not know. */
export function isSingleFacedToken(option: Pick<PrintingOption, "layout">) {
  return option.layout === "token"
}

interface Recognized {
  illustrationId?: string | null
}

type Preferences = Pick<ScanSettings, "lockedSets" | "ignorePromos">

/**
 * Best first: a locked set, then the scanned artwork, then printings already owned, then
 * English non-promo, then newest. "Ignore promos" drops promos unless nothing else is left.
 */
export function rankPrintings(
  options: PrintingOption[],
  recognized: Recognized,
  preferences: Preferences,
): PrintingOption[] {
  const locked = new Set(preferences.lockedSets.map((set) => set.toLowerCase()))
  const nonPromo = options.filter((option) => !option.promo)
  const pool = preferences.ignorePromos && nonPromo.length > 0 ? nonPromo : options
  const miss = (hit: boolean) => (hit ? 0 : 1)
  const key = (option: PrintingOption) => [
    miss(locked.size > 0 && locked.has(option.setCode.toLowerCase())),
    miss(Boolean(recognized.illustrationId) && option.illustrationId === recognized.illustrationId),
    miss(option.ownedCount > 0),
    miss(option.lang === "en"),
    miss(!option.promo),
  ]
  return [...pool].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] !== kb[i]) return ka[i]! - kb[i]!
    }
    return (b.releasedAt ?? "").localeCompare(a.releasedAt ?? "")
  })
}

export function choosePrinting(
  options: PrintingOption[],
  recognized: Recognized,
  preferences: Preferences,
): PrintingOption | null {
  return rankPrintings(options, recognized, preferences)[0] ?? null
}

export function chooseFinish(finishes: Finish[], preferFoil: boolean): Finish {
  if (preferFoil && finishes.includes("foil")) return "foil"
  if (finishes.includes("nonfoil")) return "nonfoil"
  if (finishes.includes("foil")) return "foil"
  if (finishes.includes("etched")) return "etched"
  return "nonfoil"
}

export function isFinish(value: unknown): value is Finish {
  return value === "nonfoil" || value === "foil" || value === "etched"
}
