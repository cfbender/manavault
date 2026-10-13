import type { CSSProperties } from "react"
import { cn, titleize } from "../../lib/utils"

export type LocationStickerValue = { kind: string; value: string; iconUrl?: string | null }

export const MAX_LOCATION_STICKERS = 6

export const STICKER_RARITIES = ["common", "uncommon", "rare", "mythic"] as const

export function stickerKey(sticker: LocationStickerValue) {
  return `${sticker.kind}:${sticker.value}`
}

export function stickerLabel(sticker: LocationStickerValue) {
  if (sticker.kind === "mana") return `{${sticker.value}} symbol`
  if (sticker.kind === "set") return `${sticker.value.toUpperCase()} set symbol`
  return `${titleize(sticker.value)} rarity`
}

// Slight, repeatable tilts so a row of stickers looks hand-placed.
const STICKER_TILTS = [-9, 7, -4, 11, -13, 5]

/** One die-cut sticker: a card symbol, a set symbol, or a rarity gem on white vinyl. */
export function LocationSticker({
  className,
  index = 0,
  sticker,
  style,
}: {
  className?: string
  index?: number
  sticker: LocationStickerValue
  style?: CSSProperties
}) {
  const tilt = { "--tilt": `${STICKER_TILTS[index % STICKER_TILTS.length]}deg` } as CSSProperties
  const iconUrl =
    sticker.iconUrl ||
    (sticker.kind === "mana"
      ? `/scryfall-assets/symbols/${sticker.value}.svg`
      : `/scryfall-assets/sets/${sticker.value}.svg`)

  return (
    <span
      className={cn("lo-sticker", `lo-sticker--${sticker.kind}`, className)}
      style={{ ...tilt, ...style }}
      title={stickerLabel(sticker)}
    >
      {sticker.kind === "mana" ? (
        <img src={iconUrl} alt="" draggable={false} />
      ) : sticker.kind === "set" ? (
        <span
          className="lo-sticker-set"
          style={{
            mask: `url(${iconUrl}) center / contain no-repeat`,
            WebkitMask: `url(${iconUrl}) center / contain no-repeat`,
          }}
        />
      ) : (
        <span className={cn("lo-sticker-gem", `lo-sticker-gem--${sticker.value}`)} />
      )}
    </span>
  )
}

/**
 * The stickers stuck on a location object, in a loose row. The object's CSS
 * places the row on its surface; each sticker is nudged and tilted slightly off
 * the line by a random sequence seeded with the location, so rows look
 * hand-placed and stay the same on every render.
 */
export function LocationStickerSheet({
  className,
  seed,
  stickers,
}: {
  className: string
  seed: string
  stickers: readonly LocationStickerValue[]
}) {
  if (!stickers.length) return null

  const random = seededRandom(seed)

  return (
    <div className={cn("lo-stickers", className)}>
      {stickers.map((sticker, index) => {
        const style = {
          "--dx": (random() - 0.5) * 0.12,
          "--dy": (random() - 0.5) * 0.28,
          "--tilt": `${(random() - 0.5) * 24}deg`,
          zIndex: index,
        } as CSSProperties
        return <LocationSticker key={stickerKey(sticker)} sticker={sticker} style={style} />
      })}
    </div>
  )
}

/** A small deterministic generator (mulberry32) seeded from a string. */
function seededRandom(seed: string) {
  let state = 2166136261
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
