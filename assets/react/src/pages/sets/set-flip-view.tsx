import { Link } from "@tanstack/react-router"
import { ArrowRight, Maximize2 } from "lucide-react"
import type { CSSProperties } from "react"
import { Button } from "../../components/ui/button"
import { cn, titleize } from "../../lib/utils"
import { ManaText } from "../cards/card-text"
import type { SetPrinting } from "./data"
import { SetRiffle, type RiffleItem } from "./set-riffle"
import type { SetSection } from "./set-sections"

export type FlipPrinting = SetPrinting & { largeImageUrl: string | null }

function FinishBadges({ finishes }: { finishes: FlipPrinting["finishes"] }) {
  const values = (finishes || []).filter((finish): finish is string => Boolean(finish))
  if (!values.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((finish) => (
        <span key={finish} className="badge badge-outline badge-sm font-bold">
          {finish === "nonfoil" ? "Nonfoil" : titleize(finish)}
        </span>
      ))}
    </div>
  )
}

function CardDetails({
  onOpen,
  printing,
  section,
}: {
  onOpen: () => void
  printing: FlipPrinting
  section?: SetSection<FlipPrinting>
}) {
  const card = printing.card
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-2xl font-black leading-tight tracking-normal">
            {card?.name || "Unknown card"}
          </h2>
          {card?.manaCost ? (
            <ManaText text={card.manaCost} className="shrink-0 pt-1 text-lg" />
          ) : null}
        </div>
        {card?.typeLine ? (
          <p className="text-sm font-semibold text-base-content/75">{card.typeLine}</p>
        ) : null}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-base-content/60">Number</dt>
        <dd className="font-mono font-bold">
          {printing.setCode?.toUpperCase()} #{printing.collectorNumber}
        </dd>
        {printing.rarity ? (
          <>
            <dt className="text-base-content/60">Rarity</dt>
            <dd className="font-bold">{titleize(printing.rarity)}</dd>
          </>
        ) : null}
        {section ? (
          <>
            <dt className="text-base-content/60">Section</dt>
            <dd className="font-bold">{section.label}</dd>
          </>
        ) : null}
        <dt className="text-base-content/60">Price</dt>
        <dd className="font-mono font-bold">{printing.priceText || "—"}</dd>
        <dt className="text-base-content/60">Owned</dt>
        <dd className={cn("font-mono font-bold", printing.ownedCount > 0 && "text-primary")}>
          {printing.ownedCount > 0 ? `×${printing.ownedCount}` : "None"}
        </dd>
      </dl>

      <FinishBadges finishes={printing.finishes} />

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onOpen}>
          <Maximize2 className="h-4 w-4" />
          View up close
        </Button>
        {card ? (
          <Button asChild variant="outline">
            <Link to="/cards/$id" params={{ id: card.id }} viewTransition>
              Card page
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function DividerDetails({
  onNext,
  section,
}: {
  onNext: () => void
  section: SetSection<FlipPrinting>
}) {
  const numbers = section.printings.map((printing) => printing.collectorNumber).filter(Boolean)
  const owned = section.printings.filter((printing) => printing.ownedCount > 0).length
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-base-content/60">Section</p>
        <h2 className="text-2xl font-black leading-tight tracking-normal">{section.label}</h2>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-base-content/60">Cards</dt>
        <dd className="font-mono font-bold">{section.printings.length}</dd>
        {numbers.length ? (
          <>
            <dt className="text-base-content/60">Numbers</dt>
            <dd className="font-mono font-bold">
              #{numbers[0]}
              {numbers.length > 1 ? `–#${numbers.at(-1)}` : ""}
            </dd>
          </>
        ) : null}
        <dt className="text-base-content/60">Owned</dt>
        <dd className="font-mono font-bold">
          {owned} / {section.printings.length}
        </dd>
      </dl>
      <Button type="button" variant="outline" onClick={onNext}>
        Flip to the first card
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

/** Where each section starts on the scrubber, as a fraction of its length. */
function sectionMarks(items: readonly RiffleItem<FlipPrinting>[]) {
  const marks: { sectionIndex: number; at: number }[] = []
  items.forEach((item, index) => {
    if (marks.at(-1)?.sectionIndex !== item.sectionIndex) {
      marks.push({
        sectionIndex: item.sectionIndex,
        at: items.length > 1 ? index / (items.length - 1) : 0,
      })
    }
  })
  return marks
}

export function SetFlipView({
  index,
  items,
  onIndexChange,
  onOpen,
  sections,
  setName,
}: {
  index: number
  items: readonly RiffleItem<FlipPrinting>[]
  onIndexChange: (index: number) => void
  onOpen: (printing: FlipPrinting, element: HTMLElement | null) => void
  sections: readonly SetSection<FlipPrinting>[]
  setName: string
}) {
  const item = items[index]
  const section = item ? sections[item.sectionIndex] : undefined
  const cardPosition =
    item?.kind === "card"
      ? items.slice(0, index + 1).filter((candidate) => candidate.kind === "card").length
      : null
  const cardTotal = items.filter((candidate) => candidate.kind === "card").length
  const positionText =
    item?.kind === "card"
      ? `${item.printing.card?.name || "Card"}, card ${cardPosition} of ${cardTotal}`
      : `${section?.label ?? "Section"} divider`

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-2">
        <SetRiffle
          index={index}
          items={items}
          label={`Flip through ${setName}`}
          sections={sections}
          onIndexChange={onIndexChange}
          onOpen={onOpen}
        />
        <div className="relative px-1">
          <input
            type="range"
            className="riffle-scrubber relative z-10"
            min={0}
            max={Math.max(items.length - 1, 0)}
            step={1}
            value={index}
            aria-label="Position in set"
            aria-valuetext={positionText}
            onChange={(event) => onIndexChange(Number(event.target.value))}
          />
          {sections.length > 1 ? (
            <div className="pointer-events-none absolute inset-x-1 top-1/2 h-3 -translate-y-1/2">
              {sectionMarks(items).map((mark) => (
                <span
                  key={mark.sectionIndex}
                  className={cn(
                    "absolute top-0 h-3 w-0.5 -translate-x-1/2 rounded-full bg-base-content/30",
                    mark.sectionIndex === item?.sectionIndex && "bg-primary",
                  )}
                  style={{ left: `${mark.at * 100}%` } as CSSProperties}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <aside className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm lg:self-start">
        <p className="mb-4 flex items-center justify-between gap-2 text-xs font-bold text-base-content/60">
          <span className="font-mono">
            {cardPosition ? `${cardPosition} / ${cardTotal}` : `— / ${cardTotal}`}
          </span>
          <span className="truncate">{section?.label}</span>
        </p>
        <div aria-live="polite" className="sr-only">
          {positionText}
        </div>
        {item?.kind === "card" ? (
          <CardDetails
            printing={item.printing}
            section={sections.length > 1 ? section : undefined}
            onOpen={() =>
              onOpen(
                item.printing,
                document.querySelector<HTMLElement>(
                  `.riffle-stage [data-card-morph-key="${CSS.escape(item.printing.scryfallId)}"]`,
                ),
              )
            }
          />
        ) : section ? (
          <DividerDetails section={section} onNext={() => onIndexChange(index + 1)} />
        ) : null}
        <p className="mt-5 hidden text-xs text-base-content/55 [@media(hover:hover)]:block">
          Scroll, drag, or use the arrow keys to flip. Enter or a click on the front card views it
          up close.
        </p>
      </aside>
    </div>
  )
}
