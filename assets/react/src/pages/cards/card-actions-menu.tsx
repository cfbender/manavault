import { ExternalLink, MoreVertical } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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
  const ref = useRef<HTMLDivElement>(null)
  const scryfallUrl = scryfallCardUrl({
    name: cardName,
    scryfallId: primaryPrinting?.scryfallId,
  })
  const externalLinks = [
    { label: "View on Scryfall", url: scryfallUrl },
    { label: "View on EDHREC", url: edhrecCardUrl({ name: cardName }) },
  ]

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

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
      ref={ref}
      className={cn("dropdown dropdown-end", className)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="btn btn-circle btn-sm border-base-300/70 bg-base-100/85 text-base-content shadow-lg backdrop-blur hover:bg-base-100"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${cardName} actions`}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <ul
          role="menu"
          className="menu dropdown-content z-50 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl"
        >
          {externalLinks.map(({ label, url }) => (
            <li key={label} role="none">
              <a
                role="menuitem"
                href={url}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
              >
                <ExternalLink className="h-4 w-4" />
                {label}
              </a>
            </li>
          ))}
          <li role="none">
            <a
              role="menuitem"
              href={mtgStocksUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <ExternalLink className="h-4 w-4" />
              View on MTGStocks
            </a>
          </li>
        </ul>
      ) : null}
    </div>
  )
}
