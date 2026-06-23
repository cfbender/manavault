import { Link } from "@tanstack/react-router"
import { X } from "lucide-react"
import type { ReactNode } from "react"

export function PlaytestTopBar({
  closeSlot,
  deckId,
  deckName,
  turn,
}: {
  closeSlot?: ReactNode
  deckId: string
  deckName: string
  turn: number
}) {
  return (
    <header className="col-span-full row-start-1 flex min-w-0 items-center gap-3 border-b border-base-300 bg-base-100/95 px-3 text-sm shadow-sm">
      <div className="min-w-0 flex-1 truncate text-xs font-black uppercase tracking-[0.18em] text-base-content/70">
        {deckName}
      </div>
      <div className="hidden rounded border border-base-300 bg-base-200 px-3 py-1 text-xs font-bold text-base-content/70 sm:block">
        Turn {turn}
      </div>
      {closeSlot || (
        <Link
          to="/decks/$id"
          params={{ id: deckId }}
          className="btn btn-ghost btn-xs gap-1 text-base-content/60"
        >
          <X className="h-3.5 w-3.5" />
          Close
        </Link>
      )}
    </header>
  )
}
