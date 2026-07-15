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

export function edhrecCardUrl({ name }: { name: string }) {
  return `https://edhrec.com/cards/${cardNameSlug(name)}`
}

export function mtgStocksCardUrl({ name }: { name: string }) {
  return `https://www.mtgstocks.com/?${new URLSearchParams({ q: name.trim() }).toString()}`
}

export function mtgStocksAutocompleteUrl({ name }: { name: string }) {
  return `https://api.mtgstocks.com/search/autocomplete/${encodeURIComponent(name.trim())}`
}

export function mtgStocksPrintUrl(slug: string) {
  return `https://www.mtgstocks.com/prints/${encodeURIComponent(slug.trim())}`
}

function cardNameSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replaceAll(/['’,]/gu, "")
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "")
}
