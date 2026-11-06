// Reading a card out of something dragged in from another page: a card image
// from Scryfall, EDHREC, Moxfield, or another ManaVault tab, a card link, or
// selected text. Browsers expose a dragged image as its URL (`text/uri-list`)
// and its markup (`text/html`); a dragged link as its URL and anchor markup.

/** What a drop names, most exact first; the server resolves the first part it finds. */
export type CardDropReference = {
  scryfallId?: string
  setCode?: string
  collectorNumber?: string
  name?: string
}

const CARD_DRAG_TYPES = ["text/uri-list", "text/html", "text/plain"]
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
// scryfall.com/card/<set>/<collector number>/<slug>
const SCRYFALL_CARD_PATH = /^\/card\/([^/]+)\/([^/]+)/
// Scryfall alt text names the printing too: "Sol Ring (Commander Masters #464)".
const PRINTING_SUFFIX = /\s+\([^()]*#[^()]*\)$/
const MAX_NAME_LENGTH = 150

/** Whether a drag may carry a card: a URL, markup, or text, not only files. */
export function isCardDrag(types: readonly string[]) {
  return types.some((type) => CARD_DRAG_TYPES.includes(type))
}

export function cardDropReference(data: Pick<DataTransfer, "getData">): CardDropReference | null {
  const markup = parseMarkup(data.getData("text/html"))
  const uriList = data
    .getData("text/uri-list")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
  const plain = data.getData("text/plain").trim()
  const plainUrl = toUrl(plain)
  // Image URLs carry the Scryfall printing id; links carry set and number.
  const urls = [...markup.imageUrls, ...uriList, ...markup.linkUrls, ...(plainUrl ? [plain] : [])]
    .map(toUrl)
    .filter((url): url is URL => url !== null)

  const reference: CardDropReference = {}
  const scryfallId = urls.map((url) => UUID.exec(url.pathname)?.[0]).find(Boolean)
  if (scryfallId) reference.scryfallId = scryfallId.toLowerCase()

  for (const url of urls) {
    if (!/(^|\.)scryfall\.com$/.test(url.hostname)) continue
    const match = SCRYFALL_CARD_PATH.exec(url.pathname)
    if (!match?.[1] || !match[2]) continue
    reference.setCode = decodeURIComponent(match[1])
    reference.collectorNumber = decodeURIComponent(match[2])
    break
  }

  const name = [...markup.altTexts, ...markup.linkTexts, ...(plainUrl ? [] : [plain])]
    .map((text) => text.replace(/\s+/g, " ").trim().replace(PRINTING_SUFFIX, ""))
    .find((text) => text && text.length <= MAX_NAME_LENGTH && !toUrl(text))
  if (name) reference.name = name

  return Object.keys(reference).length ? reference : null
}

function parseMarkup(html: string) {
  const markup = {
    altTexts: [] as string[],
    imageUrls: [] as string[],
    linkTexts: [] as string[],
    linkUrls: [] as string[],
  }
  if (!html.trim()) return markup

  const document = new DOMParser().parseFromString(html, "text/html")
  for (const image of document.querySelectorAll("img")) {
    const src = image.getAttribute("src")
    if (src) markup.imageUrls.push(src)
    for (const candidate of (image.getAttribute("srcset") ?? "").split(",")) {
      const url = candidate.trim().split(/\s+/)[0]
      if (url) markup.imageUrls.push(url)
    }
    const alt = image.getAttribute("alt")
    if (alt) markup.altTexts.push(alt)
  }
  for (const link of document.querySelectorAll("a[href]")) {
    markup.linkUrls.push(link.getAttribute("href") ?? "")
    if (link.textContent) markup.linkTexts.push(link.textContent)
  }
  return markup
}

function toUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}
