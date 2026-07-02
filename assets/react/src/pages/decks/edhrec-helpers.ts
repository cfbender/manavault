import { compactNumber, safeHttpUrl } from "../../lib/utils"
import type {
  DeckDetail,
  EDHRecCard,
  EDHRecCardReturnSearch,
  EDHRecCollectionStatus,
  EDHRecSectionCard,
  EDHRecTab,
} from "./deck-types"
import { EDHREC_SCROLL_STORAGE_PREFIX } from "./deck-types"

export function edhrecCardReturnSearch(
  deckId: string,
  tab: EDHRecTab,
  excludeLands: boolean,
): EDHRecCardReturnSearch {
  return {
    deckId,
    edhrec: tab,
    edhrecExcludeLands: excludeLands ? true : undefined,
  }
}

export function edhrecScrollStorageKey(deckId: string, tab: EDHRecTab) {
  return `${EDHREC_SCROLL_STORAGE_PREFIX}${deckId}.${tab}`
}

// Scroll positions are per-visit UI state, so they live in sessionStorage only.
// They used to be mirrored into localStorage too, which never expired and
// accumulated one key per deck/tab forever.
function edhrecScrollStorage() {
  if (typeof window === "undefined") return null

  try {
    return window.sessionStorage ?? null
  } catch {
    return null
  }
}

export function readEdhrecScrollPosition(storageKey: string) {
  const storage = edhrecScrollStorage()
  if (!storage) return 0

  try {
    const value = storage.getItem(storageKey)
    if (value == null) return 0
    const scrollTop = Number.parseInt(value, 10)
    if (Number.isFinite(scrollTop) && scrollTop >= 0) return scrollTop
  } catch {
    return 0
  }

  return 0
}

export function writeEdhrecScrollPosition(storageKey: string, scrollTop: number) {
  const storage = edhrecScrollStorage()
  if (!storage) return

  try {
    storage.setItem(storageKey, String(Math.max(0, Math.round(scrollTop))))
  } catch {
    // Storage can be unavailable or full; the scroll position is non-critical.
  }

  // Purge the stale localStorage mirror left by older versions.
  try {
    window.localStorage?.removeItem(storageKey)
  } catch {
    // Ignore: localStorage may be unavailable.
  }
}

export function collectionStatusShortLabel(status: EDHRecCollectionStatus) {
  if (status.state === "allocated") return "In deck"
  if (status.state === "available") return `${status.available} free`
  if (status.state === "partial") return `${status.owned} owned`
  if (status.state === "basic_land") return "Basic"
  return "Missing"
}

export function collectionStatusHoverLabel(status: EDHRecCollectionStatus) {
  const deckZone = "deckZone" in status ? status.deckZone : null
  if (!deckZone || deckZone === "mainboard") return undefined

  return `In ${deckZoneLabel(deckZone)}`
}

function deckZoneLabel(zone: string) {
  if (zone === "maybeboard") return "maybeboard"
  if (zone === "sideboard") return "sideboard"
  if (zone === "commander") return "commander"
  return zone
}

export function collectionStatusTone(
  state: string,
): "neutral" | "primary" | "success" | "warning" | "error" {
  if (state === "allocated") return "success"
  if (state === "available" || state === "basic_land") return "primary"
  if (state === "partial") return "warning"
  return "error"
}

export function edhrecCardImageUrl(card: EDHRecCard | EDHRecSectionCard) {
  const printing = card.card?.primaryPrinting
  return printing?.imageUrl || printing?.artCropUrl
}

export function edhrecCardPrice(card: EDHRecCard | EDHRecSectionCard) {
  return card.card?.primaryPrinting?.priceText || null
}

export function edhrecCardPrintingId(card: EDHRecCard | EDHRecSectionCard) {
  return card.card?.primaryPrinting?.id || null
}

export function edhrecCardUrl(card: EDHRecCard | EDHRecSectionCard) {
  if ("url" in card && card.url) {
    const safe = safeHttpUrl(card.url)
    if (safe) return safe
  }
  if ("edhrecUrl" in card && card.edhrecUrl) {
    const safe = safeHttpUrl(card.edhrecUrl)
    if (safe) return safe
  }
  return null
}

export function cardTypeLine(card: EDHRecCard | EDHRecSectionCard) {
  return card.card?.typeLine || ("primaryType" in card ? card.primaryType : null)
}

export function formatSynergy(card: EDHRecSectionCard) {
  if (typeof card.synergy === "number") return `${Math.round(card.synergy * 100)}% synergy`
  if (card.numDecks) return `${compactNumber(card.numDecks)} decks`
  return "-"
}

export function commanderDeckCard(deck: DeckDetail | null, name: string) {
  const normalizedName = normalizeDisplayName(name)
  return (deck?.deckCards || []).find(
    (deckCard) =>
      deckCard.zone === "commander" &&
      normalizeDisplayName(deckCard.card?.name || "") === normalizedName,
  )
}

export function normalizeDisplayName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function formatOptionalNumber(value?: number | null) {
  return typeof value === "number" ? value.toFixed(1) : "-"
}
