import { Link } from "@tanstack/react-router"
import { CardTile } from "../../components/card-tile"
import { useCardSize } from "../../lib/card-size"
import type { FlipPrinting } from "./set-flip-view"
import type { SetSection } from "./set-sections"

/** The set's sections as headed card grids, for scanning a whole set at once. */
export function SetGridView({
  onOpen,
  sections,
}: {
  onOpen: (printing: FlipPrinting) => void
  sections: readonly SetSection<FlipPrinting>[]
}) {
  const size = useCardSize()
  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <section
          key={section.key}
          id={`set-section-${section.key}`}
          className="scroll-mt-24 space-y-4"
          aria-labelledby={`set-section-${section.key}-title`}
        >
          {sections.length > 1 ? (
            <div className="flex items-baseline gap-3 border-b border-base-300 pb-2">
              <h2 id={`set-section-${section.key}-title`} className="text-xl font-black">
                {section.label}
              </h2>
              <span className="font-mono text-sm text-base-content/60">
                {section.printings.length}
              </span>
            </div>
          ) : null}
          <div
            className="grid justify-center gap-x-6 gap-y-8"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(min(${size.widthRem}rem, 100%), ${size.widthRem}rem))`,
            }}
          >
            {section.printings.map((printing) => {
              const finishes = (printing.finishes || []).filter(Boolean)
              const name = printing.card?.name || "Card"
              return (
                <CardTile
                  key={printing.scryfallId}
                  morphKey={printing.scryfallId}
                  imageUrl={printing.imageUrl}
                  finish={finishes.includes("nonfoil") ? null : finishes[0]}
                  count={printing.ownedCount}
                  countMin={1}
                  showMenu={false}
                  name={
                    printing.card ? (
                      <Link
                        to="/cards/$id"
                        params={{ id: printing.card.id }}
                        viewTransition
                        className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                      >
                        {name}
                      </Link>
                    ) : (
                      name
                    )
                  }
                  primaryActionLabel={`View ${name} up close`}
                  primaryActionRole="button"
                  onSelect={() => onOpen(printing)}
                  price={printing.priceText}
                  rarity={printing.rarity}
                  setCode={printing.setCode}
                  setLabel={`#${printing.collectorNumber}`}
                  showDetails
                  typeLine={printing.card?.typeLine}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
