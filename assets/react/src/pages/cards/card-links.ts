export function scryfallCardUrl({
  name,
  scryfallId,
}: {
  name: string
  scryfallId?: string | null
}) {
  const trimmedScryfallId = scryfallId?.trim()
  if (trimmedScryfallId) {
    return `https://scryfall.com/card/${encodeURIComponent(trimmedScryfallId)}`
  }

  const trimmedName = name.trim()
  const query = trimmedName ? `!${JSON.stringify(trimmedName)}` : ""
  return `https://scryfall.com/search?${new URLSearchParams({ q: query }).toString()}`
}
