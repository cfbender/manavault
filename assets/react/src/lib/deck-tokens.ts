/** A token card Scryfall links a producer to, with how many copies the user owns. */
export type DeckProducedToken = {
  ownedCount: number
  printing: {
    scryfallId: string
    oracleId?: string | null
    imageUrl?: string | null
    backImageUrl?: string | null
    setCode?: string | null
    card?: { name?: string | null; typeLine?: string | null } | null
  }
}

export type DeckTokenDeckCard = {
  id?: string
  quantity: number
  zone: string | null
  card: {
    name?: string | null
    oracleText: string | null
    producedTokens?: readonly DeckProducedToken[] | null
  } | null
}

/** `amount` is the copies made per trigger as Oracle text states it; `null` when unknown. */
export type DeckTokenProducer = {
  id: string
  name: string
  quantity: number
  amount: string | null
}

/** The catalog token a summary row shows, when the producers are linked to one. */
export type DeckTokenCard = {
  scryfallId: string
  imageUrl: string | null
  backImageUrl: string | null
  setCode: string | null
  typeLine: string | null
  ownedCount: number
}

export type DeckTokenSummary = {
  key: string
  name: string
  description: string
  producers: DeckTokenProducer[]
  /** Present when the token is a real catalog token rather than an Oracle-text guess. */
  token: DeckTokenCard | null
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

/**
 * One row per token the deck can make. A card linked to catalog tokens (Scryfall's related
 * parts, which include Copy tokens) shows exactly those tokens; its Oracle text is only read
 * for amounts. Cards Scryfall has not linked fall back to parsed "Create …" phrases.
 */
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

    const producer: Omit<DeckTokenProducer, "amount"> = {
      id: getString(deckCard.id) || `card-${rowIndex + 1}`,
      name: getString(card.name) || "Unknown card",
      quantity,
    }
    const descriptions = tokenDescriptions(getString(card.oracleText))
    const linked = producedTokens(card.producedTokens)

    if (linked.length === 0) {
      for (const description of descriptions) {
        addSummary(summaries, description.description.toLowerCase(), {
          name: tokenName(description.description),
          description: description.description,
          token: null,
          producer: { ...producer, amount: description.amount },
        })
      }
      continue
    }

    const matched = new Set<number>()
    for (const token of linked) {
      const index = descriptions.findIndex(
        (description, i) => !matched.has(i) && mentionsToken(description.description, token.name),
      )
      if (index >= 0) matched.add(index)
      const description = index >= 0 ? descriptions[index] : undefined
      addSummary(summaries, `token:${token.key}`, {
        name: token.name,
        description: description?.description ?? token.card.typeLine ?? token.name,
        token: token.card,
        producer: { ...producer, amount: description?.amount ?? null },
      })
    }
  }

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      producers: [...summary.producers].sort(compareProducers),
    }))
    .sort(compareSummaries)
}

function addSummary(
  summaries: Map<string, DeckTokenSummary>,
  key: string,
  row: Pick<DeckTokenSummary, "name" | "description" | "token"> & {
    producer: DeckTokenProducer
  },
) {
  const summary = summaries.get(key)
  if (summary) {
    summary.producers.push(row.producer)
  } else {
    summaries.set(key, {
      key,
      name: row.name,
      description: row.description,
      token: row.token,
      producers: [row.producer],
    })
  }
}

type LinkedToken = { key: string; name: string; card: DeckTokenCard }

/** Longest names first so "Human Soldier" claims its phrase before "Soldier" can. */
function producedTokens(value: unknown): LinkedToken[] {
  if (!Array.isArray(value)) return []
  const tokens: LinkedToken[] = []
  for (const entry of value) {
    if (!isRecord(entry) || !isRecord(entry.printing)) continue
    const printing = entry.printing
    const scryfallId = getString(printing.scryfallId)
    if (!scryfallId) continue
    const card = isRecord(printing.card) ? printing.card : {}
    const name = getString(card.name) || "Token"
    tokens.push({
      key: getString(printing.oracleId) || scryfallId,
      name,
      card: {
        scryfallId,
        imageUrl: getString(printing.imageUrl) || null,
        backImageUrl: getString(printing.backImageUrl) || null,
        setCode: getString(printing.setCode) || null,
        typeLine: getString(card.typeLine) || null,
        ownedCount:
          typeof entry.ownedCount === "number" && Number.isFinite(entry.ownedCount)
            ? Math.max(0, Math.trunc(entry.ownedCount))
            : 0,
      },
    })
  }
  return tokens.sort((left, right) => right.name.length - left.name.length)
}

function mentionsToken(description: string, tokenName: string) {
  const escaped = tokenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`, "i").test(description)
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
