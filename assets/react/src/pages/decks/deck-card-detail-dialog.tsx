import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { CardDetailPage } from "../cards/page"
import type { DeckCardEntry } from "./deck-types"

export type CardDetailDialogTarget = {
  id: string
  name: string
}

export function CardDetailDialog({
  card,
  graphqlEndpoint,
  hidePrivateControls = false,
  onOpenChange,
}: {
  card: CardDetailDialogTarget | null
  graphqlEndpoint?: string
  hidePrivateControls?: boolean
  onOpenChange: (open: boolean) => void
}) {
  const cardId = card?.id || null
  const cardName = card?.name || "Card details"
  return (
    <Dialog open={Boolean(cardId)} onOpenChange={onOpenChange}>
      {cardId ? (
        <DialogContent
          className="max-w-[min(96rem,calc(100vw-2rem))] overflow-hidden"
          labelledBy="deck-card-detail-title"
        >
          <DialogHeader className="sticky top-0 z-20 bg-base-100/95 backdrop-blur">
            <div className="min-w-0">
              <DialogTitle id="deck-card-detail-title" className="truncate">
                {cardName}
              </DialogTitle>
              <p className="mt-1 text-sm text-base-content/60">Card details</p>
            </div>
            <DialogClose onClose={() => onOpenChange(false)} />
          </DialogHeader>
          <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto p-4 sm:max-h-[calc(100dvh-11rem)] sm:p-6">
            <CardDetailPage
              hideBackLink
              hidePrivateControls={hidePrivateControls}
              id={cardId}
              query=""
              graphqlEndpoint={graphqlEndpoint}
            />
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

export function DeckCardDetailDialog({
  deckCard,
  onOpenChange,
  shareMode = false,
}: {
  deckCard: DeckCardEntry | null
  onOpenChange: (open: boolean) => void
  shareMode?: boolean
}) {
  const card = deckCard?.card?.id
    ? { id: deckCard.card.id, name: deckCard.card.name || "Card details" }
    : null

  return (
    <CardDetailDialog
      card={card}
      graphqlEndpoint={shareMode ? "/share/graphql" : undefined}
      hidePrivateControls={shareMode}
      onOpenChange={onOpenChange}
    />
  )
}
