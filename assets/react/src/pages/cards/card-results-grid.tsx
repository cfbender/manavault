import { addToDeckAction, CardTile } from "../../components/card-tile"
import type { CardDeckTarget } from "./add-card-to-deck-dialog"

type CardSearchResult = {
  id: string
  oracleId: string
  name: string
  typeLine?: string | null
  printings?: Array<{
    id: string
    scryfallId: string
    setCode?: string | null
    setName?: string | null
    collectorNumber?: string | null
    imageUrl?: string | null
    rarity?: string | null
    priceText?: string | null
  } | null> | null
}

export function CardResultsGrid({
  cards,
  onAddToDeck,
  onSelectCard,
}: {
  cards: CardSearchResult[]
  onAddToDeck: (target: CardDeckTarget) => void
  onSelectCard: (id: string) => void
}) {
  return (
    <div className="grid justify-center gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(14.25rem,14.25rem))]">
      {cards.map((card) => {
        const printing = card.printings?.[0]
        return (
          <div key={card.id}>
            <CardTile
              imageUrl={printing?.imageUrl}
              menuActions={[
                addToDeckAction({
                  onClick: () =>
                    onAddToDeck({
                      cardName: card.name,
                      finish: "nonfoil",
                      preferredPrintingId: printing?.id,
                      setCode: printing?.setCode,
                      collectorNumber: printing?.collectorNumber,
                    }),
                }),
              ]}
              name={card.name}
              onSelect={() => onSelectCard(card.id)}
              price={printing?.priceText}
              rarity={printing?.rarity}
              setCode={printing?.setCode}
              setLabel={`${printing?.setCode?.toUpperCase() || "?"} #${printing?.collectorNumber || "?"}`}
              setName={printing?.setName}
              typeLine={card.typeLine}
            />
          </div>
        )
      })}
    </div>
  )
}
