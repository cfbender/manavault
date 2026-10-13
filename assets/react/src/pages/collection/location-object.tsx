import type { CSSProperties } from "react"
import { cn } from "../../lib/utils"
import { LocationStickerSheet, type LocationStickerValue } from "./location-sticker"
import type { LocationDetail, LocationSummary } from "./types"

export type LocationObjectCard = {
  id: string
  imageUrl: string
  foil: boolean
}

type LocationWithPreview = Pick<
  LocationSummary | LocationDetail,
  "coverPrinting" | "id" | "kind" | "previewItems"
>

/** The cards a location shows on its object: the cover first, then its most valuable cards. */
export function locationObjectCards(location: LocationWithPreview): LocationObjectCard[] {
  const cards: LocationObjectCard[] = []
  const seen = new Set<string>()
  const cover = location.coverPrinting
  if (cover?.imageUrl) {
    cards.push({ id: cover.id, imageUrl: cover.imageUrl, foil: false })
    seen.add(cover.id)
  }
  for (const edge of location.previewItems?.edges || []) {
    const item = edge?.node
    const printing = item?.printing
    if (!item || !printing?.imageUrl || seen.has(printing.id)) continue
    seen.add(printing.id)
    cards.push({
      id: printing.id,
      imageUrl: printing.imageUrl,
      foil: item.finish === "foil" || item.finish === "etched",
    })
  }
  return cards
}

/** A CSS ident for a location's shared-element transition between the list and its page. */
export function locationTransitionName(id: string) {
  return `location-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`
}

/**
 * The physical storage a location stands for (binder page, bulk box, deck box,
 * folder, fanned list, or a loose pile for unfiled cards), filled with its cards.
 */
export function LocationObject({
  cards,
  className,
  coverArtUrl,
  kind,
  seed = "",
  stickers = [],
  transitionName,
}: {
  cards: LocationObjectCard[]
  className?: string
  coverArtUrl?: string | null
  kind: string
  seed?: string
  stickers?: readonly LocationStickerValue[]
  transitionName?: string
}) {
  const style = transitionName ? { viewTransitionName: transitionName } : undefined
  const sticker = { seed, stickers }

  return (
    <div className={cn("lo-stage", className)} aria-hidden="true">
      {kind === "binder" ? (
        <BinderPage cards={cards} sticker={sticker} style={style} />
      ) : kind === "box" ? (
        <BulkBox cards={cards} sticker={sticker} style={style} />
      ) : kind === "deck_box" ? (
        <DeckBox card={cards[0]} coverArtUrl={coverArtUrl} sticker={sticker} style={style} />
      ) : kind === "unfiled" ? (
        <LoosePile cards={cards} style={style} />
      ) : (
        <CardFan cards={cards} folder={kind === "folder"} sticker={sticker} style={style} />
      )}
    </div>
  )
}

type Stickers = { sticker: { seed: string; stickers: readonly LocationStickerValue[] } }

function ObjectCard({
  card,
  className,
  style,
}: {
  card?: LocationObjectCard
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={cn("lo-card", !card && "lo-card--blank", className)} style={style}>
      {card ? <img src={card.imageUrl} alt="" loading="lazy" decoding="async" /> : null}
      {card?.foil ? <div className="card-tile-foil-overlay" /> : null}
    </div>
  )
}

const BINDER_POCKETS = 9

function BinderPage({
  cards,
  sticker,
  style,
}: Stickers & { cards: LocationObjectCard[]; style?: CSSProperties }) {
  return (
    <div className="lo-binder" style={style}>
      <div className="lo-binder-page lo-binder-page--under" />
      <div className="lo-binder-page lo-binder-page--front">
        <div className="lo-binder-rings">
          <span />
          <span />
          <span />
        </div>
        <div className="lo-binder-grid">
          {Array.from({ length: BINDER_POCKETS }, (_, index) => (
            <div key={index} className="lo-pocket">
              {cards[index] ? <ObjectCard card={cards[index]} /> : null}
            </div>
          ))}
        </div>
        <LocationStickerSheet className="lo-stickers--binder" {...sticker} />
        <div className="lo-sheen" />
      </div>
    </div>
  )
}

const BOX_CARDS = 6

function BulkBox({
  cards,
  sticker,
  style,
}: Stickers & { cards: LocationObjectCard[]; style?: CSSProperties }) {
  // Back to front: the most valuable card stands at the front of the box.
  const standing = cards.slice(0, BOX_CARDS).reverse()

  return (
    <div className="lo-box" style={style}>
      <div className="lo-box-inner" />
      {standing.map((card, index) => (
        <div key={card.id} className="lo-box-slot" style={{ "--i": index } as CSSProperties}>
          <ObjectCard card={card} />
        </div>
      ))}
      <div className="lo-box-front">
        <span className="lo-box-handle" />
      </div>
      <LocationStickerSheet className="lo-stickers--box" {...sticker} />
    </div>
  )
}

function DeckBox({
  card,
  coverArtUrl,
  sticker,
  style,
}: Stickers & {
  card?: LocationObjectCard
  coverArtUrl?: string | null
  style?: CSSProperties
}) {
  return (
    <div className="lo-deckbox" style={style}>
      <div className="lo-deckbox-inside" />
      {card ? <ObjectCard card={card} className="lo-deckbox-card" /> : null}
      <div className="lo-deckbox-side" />
      <div className="lo-deckbox-front">
        {coverArtUrl ? <img src={coverArtUrl} alt="" loading="lazy" decoding="async" /> : null}
        <span className="lo-deckbox-seam" />
      </div>
      <LocationStickerSheet className="lo-stickers--deckbox" {...sticker} />
    </div>
  )
}

const FAN_CARDS = 5

function CardFan({
  cards,
  folder,
  sticker,
  style,
}: Stickers & {
  cards: LocationObjectCard[]
  folder: boolean
  style?: CSSProperties
}) {
  const fanned = cards.length ? cards.slice(0, folder ? 3 : FAN_CARDS) : [undefined, undefined]
  const middle = (fanned.length - 1) / 2

  return (
    <div className={cn("lo-fan", folder && "lo-fan--folder")} style={style}>
      {folder ? <div className="lo-folder-back" /> : null}
      {fanned.map((card, index) => (
        <ObjectCard
          key={card?.id ?? index}
          card={card}
          className="lo-fan-card"
          style={{ "--o": index - middle, zIndex: index } as CSSProperties}
        />
      ))}
      {folder ? <div className="lo-folder-front" /> : null}
      <LocationStickerSheet
        className={folder ? "lo-stickers--folder" : "lo-stickers--fan"}
        {...sticker}
      />
    </div>
  )
}

const PILE_POSITIONS = [
  { x: -34, y: 6, r: -16 },
  { x: 30, y: 4, r: 13 },
  { x: -10, y: -4, r: -5 },
  { x: 14, y: 8, r: 24 },
  { x: -4, y: 2, r: 4 },
]

function LoosePile({ cards, style }: { cards: LocationObjectCard[]; style?: CSSProperties }) {
  const pile = cards.length ? cards.slice(0, PILE_POSITIONS.length) : [undefined, undefined]

  return (
    <div className="lo-pile" style={style}>
      {pile.map((card, index) => {
        const position = PILE_POSITIONS[index]
        return (
          <ObjectCard
            key={card?.id ?? index}
            card={card}
            className="lo-pile-card"
            style={{ "--x": position.x, "--y": position.y, "--r": position.r } as CSSProperties}
          />
        )
      })}
    </div>
  )
}
