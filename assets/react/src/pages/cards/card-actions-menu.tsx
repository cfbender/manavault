import { ExternalLink, MoreVertical } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "../../lib/utils"
import { scryfallCardUrl } from "./card-links"

type CardActionPrinting = {
  scryfallId?: string | null
} | null

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
  const ref = useRef<HTMLDivElement>(null)
  const scryfallUrl = scryfallCardUrl({
    name: cardName,
    scryfallId: primaryPrinting?.scryfallId,
  })

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

  return (
    <div ref={ref} className={cn("dropdown dropdown-end", className)}>
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
          <li role="none">
            <a
              role="menuitem"
              href={scryfallUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <ExternalLink className="h-4 w-4" />
              View on Scryfall
            </a>
          </li>
        </ul>
      ) : null}
    </div>
  )
}
