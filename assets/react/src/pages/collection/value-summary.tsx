import type { CollectionValueSummary } from "./types"

export function collectionValueGainClass(valueGainText?: string | null) {
  if (valueGainText?.startsWith("-")) return "text-error"
  if (valueGainText?.startsWith("+")) return "text-success"
  return undefined
}

export function collectionValueLine(summary?: Partial<CollectionValueSummary> | null) {
  if (!summary) return null

  const total = summary.totalPriceText
  const gain = summary.valueGainText
  const percent = summary.valueGainPercentText
  const delta = gain ? `${gain}${percent ? ` (${percent})` : ""}` : null

  if (!total && !delta) return null

  return (
    <>
      {total}
      {total && delta ? " · " : null}
      {delta ? <span className={collectionValueGainClass(gain)}>{delta}</span> : null}
    </>
  )
}
