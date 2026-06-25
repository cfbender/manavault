export type DeckTokenDeckCard = {
  id?: string
  quantity: number
  zone: string | null
  card: {
    name?: string | null
    oracleText: string | null
  } | null
}

export type DeckTokenProducer = { id: string; name: string; quantity: number; amount: string }

export type DeckTokenSummary = {
  key: string
  name: string
  description: string
  producers: DeckTokenProducer[]
}

const COUNTED_ZONES: Record<string, true> = { commander: true, mainboard: true }
const CREATE_TOKEN_PATTERN =
  /\b(create|creates|created)\b\s+([^.;:!?]*?\btokens?\b(?:\s+(?:(?:that's|that is|that are|which is|which are)\s+)?(?:a\s+)?(?:copy|copies)\b[^.;:!?]*)?)/gi
const WORD_AMOUNTS: Record<string, string> = {
  a: "1",
  an: "1",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
}
const KNOWN_TOKEN_PATTERN = /\b(Treasure|Food|Clue|Blood|Map|Powerstone)\b/i
const KNOWN_TOKEN_NAME_BY_LOWER: Record<string, string> = {
  treasure: "Treasure",
  food: "Food",
  clue: "Clue",
  blood: "Blood",
  map: "Map",
  powerstone: "Powerstone",
}
const CREATURE_DESCRIPTOR_WORDS: Record<string, true> = {
  a: true,
  an: true,
  and: true,
  artifact: true,
  attacking: true,
  black: true,
  blue: true,
  colorless: true,
  enchantment: true,
  green: true,
  legendary: true,
  monocolored: true,
  multicolored: true,
  red: true,
  snow: true,
  tapped: true,
  white: true,
}

export function buildDeckTokens(deckCards: readonly DeckTokenDeckCard[]): DeckTokenSummary[] {
  const summaries = new Map<string, DeckTokenSummary>()
  const rows = Array.isArray(deckCards) ? deckCards : []

  for (const [rowIndex, deckCard] of rows.entries()) {
    if (!isRecord(deckCard)) {
      continue
    }

    const quantity =
      typeof deckCard.quantity === "number" && Number.isFinite(deckCard.quantity)
        ? Math.max(0, Math.trunc(deckCard.quantity))
        : 0
    const zone = getString(deckCard.zone).toLowerCase()
    const card = deckCard.card

    if (quantity === 0 || COUNTED_ZONES[zone] !== true || !isRecord(card)) {
      continue
    }

    const oracleText = getString(card.oracleText)
    if (oracleText.length === 0) {
      continue
    }

    const producer: Omit<DeckTokenProducer, "amount"> = {
      id: getString(deckCard.id) || `card-${rowIndex + 1}`,
      name: getString(card.name) || "Unknown card",
      quantity,
    }

    for (const token of tokenDescriptions(oracleText)) {
      const key = token.description.toLowerCase()
      const summary = summaries.get(key)

      if (summary) {
        summary.producers.push({ ...producer, amount: token.amount })
      } else {
        summaries.set(key, {
          key,
          name: tokenName(token.description),
          description: token.description,
          producers: [{ ...producer, amount: token.amount }],
        })
      }
    }
  }

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      producers: [...summary.producers].sort(compareProducers),
    }))
    .sort(compareSummaries)
}

function tokenDescriptions(oracleText: string) {
  const descriptions: Array<{ amount: string; description: string }> = []

  for (const match of oracleText.matchAll(CREATE_TOKEN_PATTERN)) {
    const keyword = (match[1] ?? "").toLowerCase()
    const rawPhrase = match[2] ?? ""
    if (keyword === "created" && /^(?:by|under|this|those|the)\b/i.test(rawPhrase.trim())) {
      continue
    }

    const phrase = normalizeTokenText(rawPhrase)
    if (phrase.length === 0) {
      continue
    }

    const { amount, description } = tokenAmountAndDescription(phrase)
    if (description.length > 0) {
      descriptions.push({ amount, description })
    }
  }

  return descriptions
}

function tokenAmountAndDescription(phrase: string) {
  const amountMatch = phrase.match(
    /^(that many|x|\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\b\s*/i,
  )

  if (!amountMatch) {
    return { amount: "1", description: phrase }
  }

  const amount = tokenAmount(amountMatch[1])
  const description = normalizeTokenText(phrase.slice(amountMatch[0].length))

  return { amount, description }
}

function tokenAmount(rawAmount: string | undefined) {
  const lowerAmount = rawAmount?.toLowerCase() ?? "a"

  if (lowerAmount === "x") {
    return "X"
  }

  return WORD_AMOUNTS[lowerAmount] ?? lowerAmount
}

function tokenName(description: string) {
  if (isTokenCopyDescription(description)) {
    return "Copy"
  }

  const knownTokenMatch = description.match(KNOWN_TOKEN_PATTERN)
  if (knownTokenMatch) {
    const knownTokenName = knownTokenMatch[1]
    return typeof knownTokenName === "string"
      ? (KNOWN_TOKEN_NAME_BY_LOWER[knownTokenName.toLowerCase()] ?? knownTokenName)
      : description
  }

  const creatureMatch = description.match(/^(.*?)\bcreature\s+tokens?\b/i)
  if (!creatureMatch) {
    return description
  }

  const words = creatureMatch[1]
    .replace(/[-+*?\d]+\/[-+*?\d]+/g, " ")
    .replace(/[,()]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && CREATURE_DESCRIPTOR_WORDS[word.toLowerCase()] !== true)

  return words.length === 0 ? description : words.join(" ")
}

function isTokenCopyDescription(description: string) {
  return /^tokens?\s+(?:(?:that's|that is|that are|which is|which are)\s+)?(?:a\s+)?(?:copy|copies)\b/i.test(
    description,
  )
}

function normalizeTokenText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/[,.]+$/g, "")
    .trim()
    .replace(/\btokens?\b$/i, "token")
}

function compareSummaries(left: DeckTokenSummary, right: DeckTokenSummary) {
  const nameComparison = left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  return nameComparison === 0
    ? left.description.localeCompare(right.description, undefined, { sensitivity: "base" })
    : nameComparison
}

function compareProducers(left: DeckTokenProducer, right: DeckTokenProducer) {
  const nameComparison = left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  return nameComparison === 0
    ? left.id.localeCompare(right.id, undefined, { sensitivity: "base" })
    : nameComparison
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getString(value: unknown) {
  return typeof value === "string" ? value : ""
}
