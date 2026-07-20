export const RECENT_CARD_SEARCHES_STORAGE_KEY = "manavault:recentCardSearches"
export const RECENT_CARD_SEARCHES_LIMIT = 5

export function pushRecentCardSearch(current: string[], name: string): string[] {
  const term = name.trim()
  if (!term) return current

  return [term, ...current.filter((entry) => entry.toLowerCase() !== term.toLowerCase())].slice(
    0,
    RECENT_CARD_SEARCHES_LIMIT,
  )
}

export function deserializeRecentCardSearches(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error("Stored recent card searches are not an array")

  return parsed
    .filter((entry): entry is string => typeof entry === "string")
    .slice(0, RECENT_CARD_SEARCHES_LIMIT)
}
