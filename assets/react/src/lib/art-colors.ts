import { useEffect, useState } from "react"

export type ArtPalette = {
  /** Space-separated RGB channels for CSS `rgb(<primary> / <alpha>)` usage. */
  primary: string
  secondary: string
}

const SAMPLE_SIZE = 40
const MIN_SECONDARY_DISTANCE = 90

type ColorBucket = {
  count: number
  r: number
  g: number
  b: number
}

export function extractArtPalette(pixels: Uint8ClampedArray): ArtPalette | null {
  const buckets = new Map<number, ColorBucket>()

  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] < 128) continue
    const r = pixels[offset]
    const g = pixels[offset + 1]
    const b = pixels[offset + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
  }

  const candidates = [...buckets.values()]
    .map((bucket) => {
      const r = bucket.r / bucket.count
      const g = bucket.g / bucket.count
      const b = bucket.b / bucket.count
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const saturation = (max - min) / 255
      const lightness = (max + min) / 510
      // Favor vibrant, mid-lightness colors so near-black shadows and
      // near-white highlights don't wash out the palette.
      const lightnessWeight = 1 - Math.abs(lightness - 0.5) * 1.6
      const score = bucket.count * (0.15 + saturation) * Math.max(0.05, lightnessWeight)
      return { r, g, b, score }
    })
    .sort((a, b) => b.score - a.score)

  const primary = candidates[0]
  if (!primary) return null

  const secondary =
    candidates.find((candidate) => colorDistance(candidate, primary) > MIN_SECONDARY_DISTANCE) ||
    primary

  return { primary: rgbChannels(primary), secondary: rgbChannels(secondary) }
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)
}

function rgbChannels({ r, g, b }: { r: number; g: number; b: number }) {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`
}

const paletteCache = new Map<string, ArtPalette | null>()

export function useArtPalette(url: string | null | undefined) {
  const [palette, setPalette] = useState<ArtPalette | null>(
    () => (url && paletteCache.get(url)) || null,
  )

  useEffect(() => {
    if (!url) {
      setPalette(null)
      return
    }
    if (paletteCache.has(url)) {
      setPalette(paletteCache.get(url) || null)
      return
    }

    let cancelled = false
    setPalette(null)
    loadArtPalette(url).then((result) => {
      paletteCache.set(url, result)
      if (!cancelled) setPalette(result)
    })

    return () => {
      cancelled = true
    }
  }, [url])

  return palette
}

async function loadArtPalette(url: string): Promise<ArtPalette | null> {
  try {
    const image = new Image()
    image.crossOrigin = "anonymous"
    // The same art may already sit in the HTTP cache from a normal image load,
    // cached without CORS headers (Scryfall varies on Origin). A dedicated
    // query param forces a fresh CORS-mode fetch so the canvas isn't tainted.
    image.src = `${url}${url.includes("?") ? "&" : "?"}palette=1`
    await image.decode()

    const canvas = document.createElement("canvas")
    canvas.width = SAMPLE_SIZE
    canvas.height = SAMPLE_SIZE
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return null
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

    return extractArtPalette(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data)
  } catch {
    // Image failed to load or the canvas is CORS-tainted; callers fall back
    // to the untinted panel style.
    return null
  }
}
