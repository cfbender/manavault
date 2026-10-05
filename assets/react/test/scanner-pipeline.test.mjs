import test from "node:test"
import assert from "node:assert/strict"

import {
  CARD_IN_VIEW,
  cardInView,
  EMPTY_UP_VOTE,
  galleryMask,
  isPaddedResult,
  isTokenArt,
  refineWindow,
  sceneWindow,
  windowsAgree,
} from "../src/pages/scan/recognition/pipeline.ts"

// The production bundle's constants (manifest.constants).
const CONSTANTS = {
  scene: 640,
  det_input: 256,
  rotations: 4,
  refine_fill: 0.6,
  refine_min_side: 64,
  card_aspect: 1.3968253968253967,
  frame_names: [],
}

const quad = (short) => [
  [0, 0],
  [short, 0],
  [short, short * 1.4],
  [0, short * 1.4],
]

test("a card is in view at the upright vote and short side thresholds, not below", () => {
  assert.equal(cardInView(CARD_IN_VIEW.minUpVote, quad(CARD_IN_VIEW.minShortSide)), true)
  assert.equal(cardInView(CARD_IN_VIEW.minUpVote - 0.01, quad(200)), false)
  assert.equal(cardInView(1, quad(CARD_IN_VIEW.minShortSide - 1)), false)
  // The empty shortcut must never skip a frame the refined pass would count as a card.
  assert.ok(EMPTY_UP_VOTE < CARD_IN_VIEW.minUpVote)
})

test("detector windows: the scene centre, then the card's long side at refine_fill", () => {
  assert.deepEqual(sceneWindow({ width: 640, height: 640 }, CONSTANTS), {
    cx: 320,
    cy: 320,
    side: 640,
  })
  const refined = refineWindow({ centre: [200, 300], short: 120 }, CONSTANTS)
  assert.equal(refined.cx, 200)
  assert.equal(refined.cy, 300)
  assert.ok(Math.abs(refined.side - (120 * CONSTANTS.card_aspect) / 0.6) < 1e-9)
  // Tiny detections are clamped so the window never shrinks below refine_min_side.
  assert.equal(refineWindow({ centre: [0, 0], short: 10 }, CONSTANTS).side, 64)
})

test("a tracked pass stands as the refined pass only when the card barely moved or resized", () => {
  const seed = { cx: 320, cy: 320, side: 700 }
  assert.equal(windowsAgree(seed, { cx: 370, cy: 350, side: 700 }), true)
  // Moved exactly a tenth of the window: still fine; a pixel more is not.
  assert.equal(windowsAgree(seed, { cx: 390, cy: 320, side: 700 }), true)
  assert.equal(windowsAgree(seed, { cx: 391, cy: 320, side: 700 }), false)
  // The move is measured as a distance, not per axis.
  assert.equal(windowsAgree(seed, { cx: 370, cy: 370, side: 700 }), false)
  // Size within 0.8–1.25×.
  assert.equal(windowsAgree(seed, { cx: 320, cy: 320, side: 560 }), true)
  assert.equal(windowsAgree(seed, { cx: 320, cy: 320, side: 559 }), false)
  assert.equal(windowsAgree(seed, { cx: 320, cy: 320, side: 875 }), true)
  assert.equal(windowsAgree(seed, { cx: 320, cy: 320, side: 876 }), false)
})

test("the gallery mask keeps every art for 'all' and only token layouts for 'tokens'", () => {
  const arts = [
    { layout: "normal" },
    { layout: "token" },
    { layout: "double_faced_token" },
    { layout: "emblem" },
    {}, // the-gathering bundles without a layout: a card, never a token
  ]
  assert.deepEqual(Array.from(galleryMask(arts, "all")), [1, 1, 1, 1, 1])
  assert.deepEqual(Array.from(galleryMask(arts, "tokens")), [0, 1, 1, 0, 0])
  assert.equal(galleryMask([], "tokens").length, 0)
  assert.equal(isTokenArt({ layout: "token" }), true)
  assert.equal(isTokenArt({ layout: "normal" }), false)
})

test("padded search results (masked-out rows scored -3) are told apart from real scores", () => {
  // Real scores are cosine similarities, so anything in [-1, 1] stays.
  assert.equal(isPaddedResult(-3), true)
  assert.equal(isPaddedResult(-1), false)
  assert.equal(isPaddedResult(0.88), false)
})
