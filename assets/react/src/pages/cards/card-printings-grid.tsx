import { Boxes } from "lucide-react"
import { addToDeckAction, CardTile } from "../../components/card-tile"
import { present, titleize } from "../../lib/utils"
import type { AddCollectionItemInitialPrinting } from "../collection"
import type { CardDeckTarget } from "./add-card-to-deck-dialog"

type CardPrintingTile = {
  id: string
  scryfallId: string
  collectorNumber?: string | null
  finishes?: Array<string | null> | null
  imageUrl?: string | null
  ownedCount?: number | null
  priceText?: string | null
  rarity?: string | null
  setCode?: string | null
  setName?: string | null
}

export function CardPrintingsGrid({
  cardName,
  typeLine,
  printings,
  onAddToCollection,
  onAddToDeck,
  onPreviewPrinting,
  showPrivateActions = true,
}: {
  cardName: string
  typeLine?: string | null
  printings: CardPrintingTile[]
  onAddToCollection: (printing: AddCollectionItemInitialPrinting) => void
  onAddToDeck: (target: CardDeckTarget) => void
  onPreviewPrinting: (id: string) => void
  showPrivateActions?: boolean
}) {
  return (
    <div className="grid justify-center gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(14.25rem,14.25rem))]">
      {printings.map((printing) => (
        <div key={printing.id}>
          <CardTile
            defaultActions={[]}
            count={printing.ownedCount}
            countMin={1}
            finish={(printing.finishes || [])[0]}
            imageUrl={printing.imageUrl}
            onSelect={() => onPreviewPrinting(printing.id)}
            primaryActionLabel={`Open ${cardName} ${printing.setCode?.toUpperCase() || "printing"} full screen`}
            primaryActionRole="button"
            showMenu={showPrivateActions}
            menuActions={
              showPrivateActions
                ? [
                    {
                      icon: <Boxes className="h-4 w-4" />,
                      onClick: () =>
                        onAddToCollection({
                          id: printing.id,
                          cardName,
                          collectorNumber: printing.collectorNumber,
                          finishes: printing.finishes,
                          imageUrl: printing.imageUrl,
                          rarity: printing.rarity,
                          scryfallId: printing.scryfallId,
                          setCode: printing.setCode,
                          setName: printing.setName,
                          typeLine,
                        }),
                      label: "Add to collection",
                    },
                    addToDeckAction({
                      onClick: () =>
                        onAddToDeck({
                          cardName,
                          collectorNumber: printing.collectorNumber,
                          finish: (printing.finishes || []).includes("nonfoil")
                            ? "nonfoil"
                            : printing.finishes?.[0] || "nonfoil",
                          finishes: printing.finishes?.filter(present),
                          preferredPrintingId: printing.id,
                          setCode: printing.setCode,
                        }),
                    }),
                  ]
                : []
            }
            name={cardName}
            price={printing.priceText}
            rarity={printing.rarity}
            setCode={printing.setCode}
            setLabel={`${printing.setCode?.toUpperCase() || "?"} #${printing.collectorNumber || "?"}`}
            setName={printing.setName}
            typeLine={`${printing.setCode?.toUpperCase() || "?"} #${printing.collectorNumber || "?"} · ${titleize(printing.rarity)}`}
          />
        </div>
      ))}
    </div>
  )
}
