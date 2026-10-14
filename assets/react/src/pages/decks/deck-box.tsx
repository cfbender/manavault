import type { CSSProperties } from "react"
import { cn, present } from "../../lib/utils"
import { locationTransitionName } from "../collection/location-object"
import { LocationStickerSheet } from "../collection/location-sticker"

type DeckBoxDeck = {
  id: string
  coverCardImageUrl?: string | null
  coverImageUrl?: string | null
  priciestCardImageUrls?: ReadonlyArray<string> | null
  commanderColorIdentity?: ReadonlyArray<string | null> | null
}

const STANDING_CARDS = 4

/**
 * A deck drawn as a wide deck box: its front printed edge to edge with the
 * cover art, the cover card and the deck's most valuable cards standing in it,
 * and the commander's colors stuck on as mana stickers. The gallery tile and
 * the deck page header share a view-transition name, so opening a deck carries
 * the box into the page.
 */
export function DeckBox({ className, deck }: { className?: string; deck: DeckBoxDeck }) {
  const stickers = (deck.commanderColorIdentity ?? [])
    .filter(present)
    .map((color) => ({ kind: "mana", value: color }))
  const style = { viewTransitionName: locationTransitionName(deck.id) } as CSSProperties
  // The deck's most valuable cards stand in the box beside the cover card,
  // cheapest at the back left and the priciest in front at the right.
  const standing = (deck.priciestCardImageUrls ?? [])
    .filter((url) => url !== deck.coverCardImageUrl)
    .slice(0, STANDING_CARDS)
    .reverse()
  const middle = (standing.length - 1) / 2

  return (
    <div className={cn("lo-stage db-stage", className)} aria-hidden="true">
      <div className="db-box" style={style}>
        <div className="db-inside" />
        {standing.length
          ? standing.map((url, index) => (
              <div
                key={url}
                className="db-standing"
                style={{ "--s": index, "--o": index - middle } as CSSProperties}
              >
                <img src={url} alt="" loading="lazy" decoding="async" />
              </div>
            ))
          : [0, 1, 2].map((index) => (
              <div key={index} className="db-sleeve" style={{ "--s": index } as CSSProperties} />
            ))}
        {deck.coverCardImageUrl ? (
          <div className="db-card">
            <img src={deck.coverCardImageUrl} alt="" loading="lazy" decoding="async" />
          </div>
        ) : null}
        <div className="db-side" />
        <div className="db-front">
          {deck.coverImageUrl ? (
            <img src={deck.coverImageUrl} alt="" loading="lazy" decoding="async" />
          ) : null}
          <span className="db-lid" />
          <LocationStickerSheet
            className="lo-stickers--deckwide"
            seed={deck.id}
            stickers={stickers}
          />
        </div>
      </div>
    </div>
  )
}
