import type { BuylistEntry, DeckCardEntry } from "./deck-types"

export function buylistSummary(entries: BuylistEntry[]) {
  if (!entries.length) return "No purchases needed."

  const quantity = entries.reduce((total, entry) => total + entry.quantity, 0)
  const missing = entries.reduce((total, entry) => total + entry.missing, 0)
  const unavailable = entries.reduce((total, entry) => total + entry.unavailable, 0)
  return `${quantity} cards to source: ${missing} missing, ${unavailable} owned but unavailable.`
}

export function buylistTotalPrice(entries: BuylistEntry[]) {
  return entries.reduce(
    (summary, entry) => {
      if (typeof entry.totalPriceCents === "number") {
        summary.totalCents += entry.totalPriceCents
      } else {
        summary.unpricedQuantity += entry.quantity
      }

      return summary
    },
    { totalCents: 0, unpricedQuantity: 0 },
  )
}

export function deckCardsTotalPrice(deckCards: DeckCardEntry[]) {
  return deckCards.reduce(
    (summary, deckCard) => {
      if (deckCard.zone === "sideboard" || deckCard.zone === "maybeboard") {
        return summary
      }

      const quantity = Math.max(deckCard.quantity || 0, 0)
      if (typeof deckCard.priceCents === "number") {
        summary.totalCents += deckCard.priceCents * quantity
      } else {
        summary.unpricedQuantity += quantity
      }

      return summary
    },
    { totalCents: 0, unpricedQuantity: 0 },
  )
}

export function formatUsdCents(cents: number) {
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(cents / 100)
}

export function buylistReasonTone(entry: BuylistEntry) {
  if (entry.missing > 0 && entry.unavailable > 0) return "warning"
  if (entry.unavailable > 0) return "primary"
  return "error"
}

export function buylistPrintingLabel(entry: BuylistEntry) {
  if (entry.setCode && entry.collectorNumber) {
    return `${entry.setCode.toUpperCase()} ${entry.collectorNumber}`
  }

  return "Any printing"
}

export function vendorBuylistLine(entry: BuylistEntry) {
  return `${entry.quantity} ${entry.cardName}`
}

export function vendorBuylistPlainText(entries: BuylistEntry[]) {
  return entries.map(vendorBuylistLine).join("\n")
}

export function vendorBuylistPipeText(entries: BuylistEntry[]) {
  return entries.map(vendorBuylistLine).join("||")
}

export function manaPoolBuylistUrl(entries: BuylistEntry[]) {
  if (!entries.length) return "https://manapool.com/add-deck"

  return `https://manapool.com/add-deck?deck=${encodeURIComponent(
    utf8Base64(vendorBuylistPlainText(entries)),
  )}`
}

export function tcgplayerBuylistUrl(entries: BuylistEntry[]) {
  if (!entries.length) return "https://store.tcgplayer.com/massentry"
  return `https://store.tcgplayer.com/massentry?c=${encodeURIComponent(
    vendorBuylistPipeText(entries),
  )}`
}

export function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}
