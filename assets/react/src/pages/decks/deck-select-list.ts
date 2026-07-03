// Matches pasted decklist text against deck cards by card name so a pasted
// list can drive bulk selection. Accepts the same line shapes as the server
// decklist parser: zone headings, quantity prefixes, SB: prefixes, printing
// suffixes like "(LEA) 232", finish markers, bracket tags, and comments.

export type SelectListDeckCard = {
  id: string
  card: { name?: string | null } | null
}

export type SelectListMatchResult = {
  matchedIds: string[]
  unmatched: string[]
}

const ZONE_HEADINGS = new Set([
  "main",
  "mainboard",
  "deck",
  "side",
  "sideboard",
  "commander",
  "commanders",
  "maybe",
  "maybeboard",
])

export function parseSelectListNames(text: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const name = parseSelectListLine(rawLine)
    if (!name) continue

    const key = normalizeCardName(name)
    if (seen.has(key)) continue

    seen.add(key)
    names.push(name)
  }

  return names
}

export function matchDeckCardsToNames(
  deckCards: readonly SelectListDeckCard[],
  names: readonly string[],
): SelectListMatchResult {
  const idsByName = new Map<string, string[]>()

  for (const deckCard of deckCards) {
    for (const key of cardNameKeys(deckCard.card?.name || "")) {
      const ids = idsByName.get(key)
      if (ids) ids.push(deckCard.id)
      else idsByName.set(key, [deckCard.id])
    }
  }

  const matchedIds = new Set<string>()
  const unmatched: string[] = []

  for (const name of names) {
    const ids = idsByName.get(normalizeCardName(name))
    if (ids) for (const id of ids) matchedIds.add(id)
    else unmatched.push(name)
  }

  return { matchedIds: Array.from(matchedIds), unmatched }
}

function parseSelectListLine(rawLine: string): string | null {
  const line = rawLine.replace(/\s+#.*$/u, "").trim()
  if (!line) return null
  if (ZONE_HEADINGS.has(line.toLowerCase().replace(/:$/u, ""))) return null

  const name = line
    .replace(/^sb:\s*/iu, "")
    .replace(/^\d+\s*x?\s+/iu, "")
    .replace(/\s+\[[^\]]+\]\s*$/u, "")
    .replace(/\s+\*[A-Za-z]+\*\s*$/u, "")
    .replace(/\s+\([A-Za-z0-9]+\)\s+\S+$/u, "")
    .trim()

  return name || null
}

// A deck card named "A // B" is selectable by its full name or its front face.
function cardNameKeys(cardName: string): string[] {
  const fullName = normalizeCardName(cardName)
  if (!fullName) return []

  const frontFace = normalizeCardName(cardName.split("//")[0])
  return frontFace && frontFace !== fullName ? [fullName, frontFace] : [fullName]
}

function normalizeCardName(name: string): string {
  return name.toLowerCase().replace(/\s+/gu, " ").trim()
}
