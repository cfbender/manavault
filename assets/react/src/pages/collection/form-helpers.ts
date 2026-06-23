import { useEffect, useState } from "react"
import { present, titleize } from "../../lib/utils"
import { COLLECTION_CONDITIONS, COLLECTION_FINISHES, LOCATION_KINDS } from "./constants"
import type { LocationCoverSelection } from "./types"

export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [delayMs, value])

  return debouncedValue
}

export function centsToCurrencyInput(cents?: number | null) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return ""
  return (cents / 100).toFixed(2).replace(/\.00$/, "")
}

export function parseCurrencyInputCents(value: string) {
  const normalized = value.trim().replaceAll(",", "").replace(/^\$/, "")
  if (!normalized) return null

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized)
  if (!match) return undefined

  const dollars = Number(match[1])
  const cents = Number((match[2] || "").padEnd(2, "0"))
  return dollars * 100 + cents
}

export function printingSetLabel(printing: LocationCoverSelection) {
  return (
    [
      printing.setName || printing.setCode,
      printing.collectorNumber ? `#${printing.collectorNumber}` : null,
      printing.rarity ? titleize(printing.rarity) : null,
    ]
      .filter(present)
      .join(" • ") || "Selected printing"
  )
}

export function locationKindValue(value: string): (typeof LOCATION_KINDS)[number] {
  return LOCATION_KINDS.find((kind) => kind === value) || "box"
}

export function collectionConditionValue(value: string): (typeof COLLECTION_CONDITIONS)[number] {
  return COLLECTION_CONDITIONS.find((condition) => condition === value) || "near_mint"
}

export function collectionFinishValue(value: string): (typeof COLLECTION_FINISHES)[number] {
  return COLLECTION_FINISHES.find((finish) => finish === value) || "nonfoil"
}
