import { compactNumber, present } from "../../lib/utils"
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

export function readEdhrecScrollPosition(storageKey: string) {
  for (const storage of edhrecScrollStorages()) {
    try {
      const value = storage.getItem(storageKey)
      if (value == null) continue
      const scrollTop = Number.parseInt(value, 10)
      if (Number.isFinite(scrollTop) && scrollTop >= 0) return scrollTop
    } catch {
      continue
    }
  }
  return 0
}

export function writeEdhrecScrollPosition(storageKey: string, scrollTop: number) {
  const value = String(Math.max(0, Math.round(scrollTop)))
  for (const storage of edhrecScrollStorages()) {
    try {
      storage.setItem(storageKey, value)
    } catch {
      continue
    }
  }
}

export function edhrecScrollStorages() {
  if (typeof window === "undefined") return []

  return (["sessionStorage", "localStorage"] as const).flatMap((storageName) => {
    try {
      const storage = window[storageName]
      return storage ? [storage] : []
    } catch {
      return []
    }
  })
}

export function collectionStatusShortLabel(status: EDHRecCollectionStatus) {
  if (status.state === "allocated") return "In deck"
  if (status.state === "available") return `${status.available} free`
  if (status.state === "partial") return `${status.owned} owned`
  if (status.state === "basic_land") return "Basic"
  return "Missing"
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
  const printing = card.card?.printings?.find(
    (printing) => printing?.imageUrl || printing?.artCropUrl,
  )
  return printing?.imageUrl || printing?.artCropUrl
}

export function edhrecCardPrice(card: EDHRecCard | EDHRecSectionCard) {
  return card.card?.printings?.find((printing) => printing?.priceText)?.priceText || null
}

export function edhrecCardPrintingId(card: EDHRecCard | EDHRecSectionCard) {
  return card.card?.printings?.find((printing) => printing?.scryfallId)?.scryfallId || null
}

export function edhrecCardUrl(card: EDHRecCard | EDHRecSectionCard) {
  if ("url" in card && card.url) return card.url
  if ("edhrecUrl" in card && card.edhrecUrl) return card.edhrecUrl
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
  return (deck?.deckCards || [])
    .filter(present)
    .find(
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
