import { shuffle } from "es-toolkit"
import { useEffect, useState } from "react"
import { EmptyState } from "../../components/card-image"
import DomeGallery, { type DomeGalleryCard } from "../../components/dome-gallery"
import useIsMobile from "../../lib/mobile-hover"

const EDHREC_WEEK_COMMANDERS_URL = "https://json-cloudflare.edhrec.com/pages/commanders/week.json"
const EDHREC_COMMANDER_GALLERY_LIMIT = 50

type EdhrecCommanderCardView = {
  id?: string | null
  name?: string | null
  num_decks?: number | null
  rank?: number | null
}

type EdhrecWeekCommandersResponse = {
  container?: {
    json_dict?: {
      cardlists?: Array<{ cardviews?: EdhrecCommanderCardView[] | null }> | null
    } | null
  } | null
}

export function CommanderGallery() {
  const { cards, hasError, isLoading } = useEdhrecCommanderGallery()
  const { isMobile } = useIsMobile()

  if (!cards.length) {
    return (
      <EmptyState
        title={isLoading ? "Loading top commanders..." : "No commander art available"}
        description={
          hasError
            ? "EDHREC commander data could not be loaded. Search by name or Scryfall syntax instead."
            : "Search by name or Scryfall syntax, then choose the exact printing to inspect or add."
        }
      />
    )
  }

  return (
    <section className="relative h-[min(72vh,38rem)] min-h-[26rem] w-full mx-auto overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm">
      <DomeGallery
        cards={cards}
        fit={1}
        minRadius={isMobile ? 600 : 1200}
        segments={20}
        dragDampening={1.2}
        overlayBlurColor="var(--color-base-100)"
        padFactor={0.08}
        imageBorderRadius="8px"
        openedImageBorderRadius="12px"
        grayscale={false}
      />
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-30 sm:bottom-6 sm:left-6 sm:right-auto">
        <div className="max-w-md rounded-box border border-base-300 bg-base-100/95 p-4 shadow-sm">
          <p className="text-sm font-black text-base-content">Top EDHREC commanders this week</p>
          <p className="md:mt-1 text-xs md:text-sm text-base-content/70">
            Drag through the weekly commander list, select art to inspect the full card, or search
            above for exact printings.
          </p>
        </div>
      </div>
    </section>
  )
}

function useEdhrecCommanderGallery() {
  const [cards, setCards] = useState<DomeGalleryCard[]>([])
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const abortController = new AbortController()

    fetch(EDHREC_WEEK_COMMANDERS_URL, { signal: abortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`EDHREC returned ${response.status}`)
        return response.json() as Promise<EdhrecWeekCommandersResponse>
      })
      .then((data) => setCards(buildCommanderCards(data)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setCards([])
        setHasError(true)
      })
      .finally(() => {
        if (!abortController.signal.aborted) setIsLoading(false)
      })

    return () => abortController.abort()
  }, [])

  return { cards, hasError, isLoading }
}

function buildCommanderCards(data: EdhrecWeekCommandersResponse): DomeGalleryCard[] {
  const cardviews = data.container?.json_dict?.cardlists?.[0]?.cardviews || []

  return shuffle(cardviews)
    .slice(0, EDHREC_COMMANDER_GALLERY_LIMIT)
    .reduce<DomeGalleryCard[]>((cards, card, index) => {
      if (!card.id || !card.name) return cards
      const artCropUrl = scryfallImageUrl(card.id, "art_crop")
      const imageUrl = scryfallImageUrl(card.id, "normal")
      if (!artCropUrl || !imageUrl) return cards
      const rank = card.rank || index + 1
      const deckCount = card.num_decks ? deckCountFormatter.format(card.num_decks) : null

      cards.push({
        id: card.id,
        name: card.name,
        artCropUrl,
        imageUrl,
        collectorNumber: String(rank),
        setCode: "EDHREC",
        setName: deckCount ? `${deckCount} decks this week` : "Top commander this week",
        typeLine: deckCount ? `Rank #${rank} · ${deckCount} decks this week` : `Rank #${rank}`,
      })
      return cards
    }, [])
}

function scryfallImageUrl(id: string, size: "art_crop" | "normal") {
  const scryfallId = id.toLowerCase()
  if (!/^[a-f0-9-]{36}$/.test(scryfallId)) return null
  return `https://cards.scryfall.io/${size}/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`
}

const deckCountFormatter = new Intl.NumberFormat("en-US")
