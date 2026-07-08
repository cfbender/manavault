import type { DeckCardEntry } from "./deck-types"

export type DeckReadinessSummary = {
  availableToPull: number
  missingToBuy: number
  proxyAllocated: number
  readyCount: number
  readinessPercent: number
  requiredCount: number
}

export function deckPullZones(deckCards: readonly DeckCardEntry[]) {
  return deckCards.filter(
    (deckCard) => deckCard.zone === "mainboard" || deckCard.zone === "commander",
  )
}

export function summarizeDeckPullNeeds(deckCards: readonly DeckCardEntry[]) {
  return summarizeDeckReadiness(deckPullZones(deckCards))
}

export function hasDeckPullWork(deckCards: readonly DeckCardEntry[]) {
  const readiness = summarizeDeckPullNeeds(deckCards)
  return readiness.readyCount < readiness.requiredCount
}

export type DeckZoneMissing = {
  mainboard: boolean
  sideboard: boolean
  maybeboard: boolean
}

function deckCardMissingToBuy(deckCard: DeckCardEntry) {
  if (deckCard.tag === "getting" || deckCard.allocationStatus.state === "basic_land") return 0
  return Math.max(deckCard.allocationStatus.missing || 0, 0)
}

export function deckZoneMissing(deckCards: readonly DeckCardEntry[]): DeckZoneMissing {
  const missing = { mainboard: false, sideboard: false, maybeboard: false }

  for (const deckCard of deckCards) {
    if (deckCardMissingToBuy(deckCard) <= 0) continue

    if (deckCard.zone === "sideboard") missing.sideboard = true
    else if (deckCard.zone === "maybeboard") missing.maybeboard = true
    else missing.mainboard = true
  }

  return missing
}

export function hasDeckBuylistWork(deckCards: readonly DeckCardEntry[]) {
  const missing = deckZoneMissing(deckCards)
  return missing.mainboard || missing.sideboard || missing.maybeboard
}

export function summarizeDeckReadiness(deckCards: readonly DeckCardEntry[]): DeckReadinessSummary {
  let availableToPull = 0
  let missingToBuy = 0
  let proxyAllocated = 0
  let readyCount = 0
  let requiredCount = 0

  for (const deckCard of deckCards) {
    const status = deckCard.allocationStatus
    const required = Math.max(status.required || 0, 0)

    requiredCount += required
    proxyAllocated += Math.max(status.proxyAllocated || 0, 0)

    if (status.state === "basic_land") {
      readyCount += required
      continue
    }

    const allocated = Math.max(status.allocated || 0, 0)
    const proxied = Math.max(status.proxyAllocated || 0, 0)
    const readyForCard = Math.min(required, allocated + proxied)
    const stillNeeded = Math.max(required - readyForCard, 0)
    const available = Math.max(status.available || 0, 0)
    const missing = Math.max(status.missing || 0, 0)

    readyCount += readyForCard
    availableToPull += Math.min(available, stillNeeded)
    missingToBuy += deckCard.tag === "getting" ? 0 : missing
  }

  return {
    availableToPull,
    missingToBuy,
    proxyAllocated,
    readyCount,
    readinessPercent: requiredCount > 0 ? Math.round((readyCount / requiredCount) * 100) : 100,
    requiredCount,
  }
}
