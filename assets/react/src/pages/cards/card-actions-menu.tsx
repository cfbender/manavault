import { ExternalLink, MoreVertical } from "lucide-react"
import { useEffect, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { cn } from "../../lib/utils"
import {
  edhrecCardUrl,
  mtgStocksAutocompleteUrl,
  mtgStocksCardUrl,
  mtgStocksPrintUrl,
  scryfallCardUrl,
} from "./card-links"

type CardActionPrinting = {
  scryfallId?: string | null
} | null

type MtgStocksSearchResult = {
  name: string
  slug: string
  type: string
}

export function CardActionsMenu({
  cardName,
  className,
  primaryPrinting,
}: {
  cardName: string
  className?: string
  primaryPrinting?: CardActionPrinting
}) {
  const [open, setOpen] = useState(false)
  const normalizedCardName = cardName.trim().toLocaleLowerCase()
  const [mtgStocksResolution, setMtgStocksResolution] = useState<{
    cardName: string
    url: string
  } | null>(null)
  const mtgStocksUrl =
    mtgStocksResolution?.cardName === normalizedCardName
      ? mtgStocksResolution.url
      : mtgStocksCardUrl({ name: cardName })
  const scryfallUrl = scryfallCardUrl({
    name: cardName,
    scryfallId: primaryPrinting?.scryfallId,
  })
  const externalLinks = [
    { label: "View on Scryfall", url: scryfallUrl },
    { label: "View on EDHREC", url: edhrecCardUrl({ name: cardName }) },
  ]

  useEffect(() => {
    if (!open || mtgStocksResolution?.cardName === normalizedCardName) return

    const abortController = new AbortController()

    fetch(mtgStocksAutocompleteUrl({ name: cardName }), { signal: abortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`MTGStocks returned ${response.status}`)
        return response.json() as Promise<MtgStocksSearchResult[]>
      })
      .then((results) => {
        const result =
          results.find(
            (candidate) =>
              candidate.type === "print" &&
              candidate.name.trim().toLocaleLowerCase() === normalizedCardName,
          ) || results.find((candidate) => candidate.type === "print")

        if (result) {
          setMtgStocksResolution({
            cardName: normalizedCardName,
            url: mtgStocksPrintUrl(result.slug),
          })
        }
      })
      .catch(() => undefined)

    return () => abortController.abort()
  }, [cardName, mtgStocksResolution, normalizedCardName, open])

  return (
    <div
      className={cn("inline-flex", className)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="btn btn-circle btn-sm border-base-300/70 bg-base-100/85 text-base-content shadow-lg backdrop-blur hover:bg-base-100"
            aria-label={`${cardName} actions`}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 shadow-2xl">
          {externalLinks.map(({ label, url }) => (
            <DropdownMenuItem key={label} asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {label}
              </a>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem asChild>
            <a href={mtgStocksUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              View on MTGStocks
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
