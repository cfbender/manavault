/**
 * The glue around the three bundle graphs, ported from the-gathering's
 * `assets/react/src/features/webcam-table/recognition/pipeline.ts` (itself a port of
 * `ml/cardid/bundle.py`). Everything here is pure so it can be unit-tested; onnxruntime calls
 * live in `recognizer.worker.ts`.
 *
 * Per frame: resample the SCENE px square around the frame centre to the detector input, run
 * the detector, map its centre/short side back to image pixels, run it again on a tighter
 * window so the card fills ~60% of the input, then embed the card at the refined quad and
 * search the gallery.
 */

/** Constants the bundle manifest ships (`manifest.constants`); names mirror the manifest. */
export interface BundleConstants {
  scene: number
  det_input: number
  rotations: number
  refine_fill: number
  refine_min_side: number
  card_aspect: number
  frame_names: string[]
}

/** Exact selectable printing; separate printed sides use face IDs (`<uuid>-1`). */
export interface GalleryPrinting {
  id: string
  name: string
  set: string
  collector_number?: string
  layout?: string
  face?: number
  lang?: string
  border_color?: string | null
  scryfall_frame?: string | null
  frame_effects?: string[]
  promo?: boolean
}

/** One embedding per illustration, in `arts.json` order (= gallery index). */
export interface GalleryArt extends GalleryPrinting {
  frame: string
  illustration_id?: string
  url?: string
  printing_count?: number
  printings?: GalleryPrinting[]
}

export interface Candidate extends GalleryArt {
  index: number
  score: number
}

/** Scryfall layouts whose gallery arts are tokens rather than playable cards. */
export const TOKEN_LAYOUTS: ReadonlySet<string> = new Set(["token", "double_faced_token"])

export function isTokenArt(art: Pick<GalleryArt, "layout">): boolean {
  return art.layout !== undefined && TOKEN_LAYOUTS.has(art.layout)
}

/** Which part of the gallery a frame is searched against. */
export type SearchScope = "all" | "tokens"

/**
 * The `mask` input of a bundle whose `search.onnx` was exported with `--search-mask`: one
 * float per gallery art in `arts.json` order, `> 0` keeps the art. Oracle scores an excluded
 * art `PADDED_SCORE` before top-k, so a mask keeping fewer than k arts pads the results.
 */
export function galleryMask(arts: readonly Pick<GalleryArt, "layout">[], scope: SearchScope) {
  const mask = new Float32Array(arts.length)
  for (let i = 0; i < arts.length; i += 1) {
    mask[i] = scope === "all" || isTokenArt(arts[i]!) ? 1 : 0
  }
  return mask
}

/** Score of a masked-out or padded result. Real scores are cosine similarities in [-1, 1]. */
export const PADDED_SCORE = -3

export function isPaddedResult(score: number): boolean {
  return score < -1
}

export type Point = [number, number]
/** Card corners in image pixels, printed order (top-left, top-right, bottom-right, bottom-left). */
export type Quad = [Point, Point, Point, Point]

export interface RgbaImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * The `side` px square around (cx, cy) resampled to a `size` px RGBA square, bilinear with
 * edge replication, plus the scale s so that window = s * (image - (cx, cy)) + size / 2.
 * Matches `cv2.warpAffine(..., borderMode=BORDER_REPLICATE)` in `synth.window_around`.
 */
export function resampleWindow(
  image: RgbaImage,
  cx: number,
  cy: number,
  side: number,
  size: number,
): { window: Uint8ClampedArray; scale: number } {
  const { data, width, height } = image
  const scale = size / side
  const out = new Uint8ClampedArray(size * size * 4)
  const maxX = width - 1
  const maxY = height - 1
  for (let j = 0; j < size; j += 1) {
    const sy = (j - size / 2) / scale + cy
    const y0 = Math.min(maxY, Math.max(0, Math.floor(sy)))
    const y1 = Math.min(maxY, Math.max(0, y0 + 1))
    const fy = Math.min(1, Math.max(0, sy - Math.floor(sy)))
    for (let i = 0; i < size; i += 1) {
      const sx = (i - size / 2) / scale + cx
      const x0 = Math.min(maxX, Math.max(0, Math.floor(sx)))
      const x1 = Math.min(maxX, Math.max(0, x0 + 1))
      const fx = Math.min(1, Math.max(0, sx - Math.floor(sx)))
      const o = (j * size + i) * 4
      const p00 = (y0 * width + x0) * 4
      const p01 = (y0 * width + x1) * 4
      const p10 = (y1 * width + x0) * 4
      const p11 = (y1 * width + x1) * 4
      const w00 = (1 - fx) * (1 - fy)
      const w01 = fx * (1 - fy)
      const w10 = (1 - fx) * fy
      const w11 = fx * fy
      for (let c = 0; c < 3; c += 1) {
        out[o + c] = Math.round(
          (data[p00 + c] ?? 0) * w00 +
            (data[p01 + c] ?? 0) * w01 +
            (data[p10 + c] ?? 0) * w10 +
            (data[p11 + c] ?? 0) * w11,
        )
      }
      out[o + 3] = 255
    }
  }
  return { window: out, scale }
}

/** Window pixel → image pixel for a window produced by `resampleWindow`. */
export function fromWindow(
  point: Point,
  cx: number,
  cy: number,
  scale: number,
  size: number,
): Point {
  return [(point[0] - size / 2) / scale + cx, (point[1] - size / 2) / scale + cy]
}

/** Side of the second detector window: the card's long side at `refine_fill` of the input. */
export function refineSide(short: number, constants: BundleConstants): number {
  return Math.max(
    (short * constants.card_aspect) / constants.refine_fill,
    constants.refine_min_side,
  )
}

/** The detector's `up` output is a summed unit vector over the rotations; |up| / rotations
 * is the share of views that agreed the card is upright. */
export function upVote(up: [number, number], constants: BundleConstants): number {
  return Math.hypot(up[0], up[1]) / constants.rotations
}

/** Shortest side of a quad, in its own pixels. */
export function quadShort(quad: Quad): number {
  const side = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1])
  return Math.min(
    side(quad[0], quad[1]),
    side(quad[1], quad[2]),
    side(quad[2], quad[3]),
    side(quad[3], quad[0]),
  )
}

/**
 * When the refined detector pass means a card is in view. Calibrated on synthetic phone
 * frames with bundle retrain-20260925T043526910942Z: cards had upright votes ≈ 1, empty tables
 * and blank paper ≤ 0.17. Frames are 640 px squares, so 60 px is the smallest plausible card.
 */
export const CARD_IN_VIEW = { minUpVote: 0.5, minShortSide: 60 } as const

export function cardInView(upVote: number, quad: Quad): boolean {
  return upVote >= CARD_IN_VIEW.minUpVote && quadShort(quad) >= CARD_IN_VIEW.minShortSide
}

/**
 * Below this upright vote a detector pass saw nothing card-like, so the rest of the frame's
 * pipeline is skipped. Half of `CARD_IN_VIEW.minUpVote`, so borderline frames still get the
 * refined pass that decides; measured empty and noise frames vote 0.00–0.17 on the coarse pass
 * while cards down to 77 px vote ≥ 0.93.
 */
export const EMPTY_UP_VOTE = 0.25

/** The `side` px square around (cx, cy) a detector pass looks at. */
export interface DetectorWindow {
  cx: number
  cy: number
  side: number
}

/** The first detector pass: the `scene` px square in the middle of the frame. */
export function sceneWindow(
  image: Pick<RgbaImage, "width" | "height">,
  constants: BundleConstants,
) {
  return { cx: image.width / 2, cy: image.height / 2, side: constants.scene }
}

/** The refined detector pass around a detection: the card's long side at `refine_fill`. */
export function refineWindow(
  detection: { centre: Point; short: number },
  constants: BundleConstants,
): DetectorWindow {
  return {
    cx: detection.centre[0],
    cy: detection.centre[1],
    side: refineSide(detection.short, constants),
  }
}

/**
 * Whether a pass on `seed` (the previous frame's refined window) framed the card well enough
 * to stand as this frame's refined pass: the card moved less than a tenth of the window and its
 * size barely changed, so the card still fills roughly `refine_fill` of the window.
 */
export function windowsAgree(seed: DetectorWindow, next: DetectorWindow): boolean {
  const moved = Math.hypot(next.cx - seed.cx, next.cy - seed.cy)
  const ratio = next.side / seed.side
  return moved <= seed.side * 0.1 && ratio >= 0.8 && ratio <= 1.25
}
