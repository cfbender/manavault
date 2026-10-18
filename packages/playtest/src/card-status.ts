import type { CardStatus } from "./types"

export function defaultCardStatus(): CardStatus {
  return { markers: 0, minusOneCounters: 0, plusOneCounters: 0 }
}

export function hasClearableCardStatus(status: CardStatus) {
  return (
    status.plusOneCounters > 0 ||
    status.minusOneCounters > 0 ||
    status.markers > 0 ||
    Boolean(status.power) ||
    Boolean(status.toughness)
  )
}

export function statusFor(statuses: Record<string, CardStatus>, cardId: string) {
  return statuses[cardId] || defaultCardStatus()
}
