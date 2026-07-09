import { Link } from "@tanstack/react-router"
import { addToDeckAction, CardTile } from "../../components/card-tile"
import { useCardSize } from "../../lib/card-size"
import { present } from "../../lib/utils"
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
    ownedCount?: number | null
    finishes?: Array<string | null> | null
  } | null> | null
}

type CardSearchParams = {
  filters?: string
  q?: string
}

export function CardResultsGrid({
  cards,
  onAddToDeck,
  onSelectCard,
  searchParams,
}: {
  cards: CardSearchResult[]
  onAddToDeck: (target: CardDeckTarget) => void
  onSelectCard: (id: string) => void
  searchParams: CardSearchParams
}) {
  const size = useCardSize()
  return (
    <div
      className="grid justify-center gap-x-6 gap-y-8"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${size.widthRem}rem, 100%), ${size.widthRem}rem))`,
      }}
    >
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
                      finish: (printing?.finishes || []).includes("nonfoil")
                        ? "nonfoil"
                        : printing?.finishes?.[0] || "nonfoil",
                      finishes: printing?.finishes?.filter(present),
                      preferredPrintingId: printing?.id,
                      printings: card.printings?.filter(present),
                      setCode: printing?.setCode,
                      collectorNumber: printing?.collectorNumber,
                    }),
                }),
              ]}
              count={printing?.ownedCount}
              countMin={1}
              name={
                <Link
                  to="/cards/$id"
                  params={{ id: card.id }}
                  search={searchParams}
                  className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                >
                  {card.name}
                </Link>
              }
              onSelect={() => onSelectCard(card.id)}
              primaryActionLabel={`View ${card.name}`}
              price={printing?.priceText}
              rarity={printing?.rarity}
              setCode={printing?.setCode}
              setLabel={`${printing?.setCode?.toUpperCase() || "?"} #${printing?.collectorNumber || "?"}`}
              setName={printing?.setName}
              showDetails
              typeLine={card.typeLine}
            />
          </div>
        )
      })}
    </div>
  )
}
