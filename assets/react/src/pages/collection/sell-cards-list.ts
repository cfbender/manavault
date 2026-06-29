export type SellListCollectionItem = {
  currentPriceCents?: number | null
  finish: string
  id: string
  priceText?: string | null
  quantity: number
  printing?: {
    collectorNumber?: string | null
    setCode?: string | null
    card?: {
      name?: string | null
    } | null
  } | null
}

export type SellListSelection<T extends SellListCollectionItem = SellListCollectionItem> = {
  item: T
  quantity: number
}

export function sellQuantityValue(value: number, maxQuantity: number) {
  const safeValue = Number.isFinite(value) ? Math.floor(value) : 0
  const safeMax = Math.max(0, Math.floor(Number.isFinite(maxQuantity) ? maxQuantity : 0))

  return Math.min(Math.max(safeValue, 0), safeMax)
}

export function sellListTotalCents<T extends SellListCollectionItem>(
  selections: readonly SellListSelection<T>[],
) {
  return selections.reduce(
    (total, selection) => total + (selection.item.currentPriceCents || 0) * selection.quantity,
    0,
  )
}

export function sellListTextForSelections<T extends SellListCollectionItem>(
  selections: readonly SellListSelection<T>[],
  totalCents = sellListTotalCents(selections),
) {
  const lines = selections.map(({ item, quantity }) => {
    const cardName = item.printing?.card?.name || "Unknown card"
    const setCode = item.printing?.setCode?.toUpperCase() || "?"
    const collectorNumber = item.printing?.collectorNumber || "?"
    const unitPrice = item.priceText || "$0"
    const total = formatCents((item.currentPriceCents || 0) * quantity)

    return `${quantity} ${cardName} [${setCode} #${collectorNumber}] ${item.finish} - ${unitPrice} ea - ${total}`
  })

  return [...lines, "", `Total: ${formatCents(totalCents)}`].join("\n")
}

export function selectSellListItems<T extends SellListCollectionItem>(
  lines: readonly string[],
  items: readonly T[],
) {
  const selectedQuantities: Record<string, number> = {}

  for (const line of lines) {
    const match = sellListLineMatch(line, items)
    if (!match) continue

    let remainingQuantity = match.quantity

    for (const item of match.items) {
      const selectedQuantity = selectedQuantities[item.id] || 0
      const availableQuantity = sellQuantityValue(item.quantity - selectedQuantity, item.quantity)
      const addedQuantity = Math.min(remainingQuantity, availableQuantity)

      if (addedQuantity <= 0) continue

      selectedQuantities[item.id] = selectedQuantity + addedQuantity
      remainingQuantity -= addedQuantity
      if (remainingQuantity <= 0) break
    }
  }

  return selectedQuantities
}

export function lineMatchesItem(line: string, item: SellListCollectionItem) {
  const normalizedLine = normalizeMatchText(line)
  const outputFinish = line.match(/\]\s*(nonfoil|foil|etched)\b/i)?.[1]?.toLowerCase()
  const name = normalizeMatchText(item.printing?.card?.name || "")
  const setCode = normalizeMatchText(item.printing?.setCode || "")
  const collectorNumber = normalizeMatchText(item.printing?.collectorNumber || "")
  const finish = normalizeMatchText(item.finish)

  if (!name || !normalizedLine.includes(name)) return false
  if (outputFinish && finish !== outputFinish) return false
  if (setCode && collectorNumber && line.includes("#") && normalizedLine.includes(setCode)) {
    return normalizedLine.includes(collectorNumber)
  }

  return true
}

export function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(cents / 100)
}

function sellListLineMatch<T extends SellListCollectionItem>(line: string, items: readonly T[]) {
  const trimmedLine = line.trim()
  if (!trimmedLine || /^total\s*:/i.test(trimmedLine)) return null

  const quantityPrefix = parseQuantityPrefix(trimmedLine)
  if (quantityPrefix) {
    const prefixedItems = items.filter((item) => lineMatchesItem(quantityPrefix.text, item))
    if (prefixedItems.length) return { items: prefixedItems, quantity: quantityPrefix.quantity }
  }

  const unprefixedItems = items.filter((item) => lineMatchesItem(trimmedLine, item))
  if (!unprefixedItems.length) return null

  return { items: unprefixedItems, quantity: 1 }
}

function parseQuantityPrefix(line: string) {
  const match = line.match(/^(\d+)\s*x?\s+(.+)$/i)
  if (!match) return null

  const quantity = Number(match[1])
  if (!Number.isInteger(quantity) || quantity <= 0) return null

  return { quantity, text: match[2] }
}

function normalizeMatchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}
