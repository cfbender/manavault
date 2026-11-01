import test from "node:test"
import assert from "node:assert/strict"

import {
  cardKey,
  evaluateFrame,
  evaluateTokenFrame,
  FRAME_PACING,
  frameInterval,
  forgetLastLogged,
  INITIAL_TRACKER,
  SCAN_THRESHOLDS,
} from "../src/pages/scan/scan-decision.ts"

const UUID = "54772e15-d99d-4eec-ba8d-b9202a7e318b"
const OTHER = "db6358cf-fcb9-42af-9755-dd1f39bfc8ff"
const CARD_QUAD = [
  [220, 140],
  [420, 140],
  [420, 420],
  [220, 420],
]

function frame(candidates, { upVote = 1, quad = CARD_QUAD } = {}) {
  return {
    quad,
    upVote,
    candidates: candidates.map(([id, score], index) => ({
      id,
      name: id,
      set: "snc",
      frame: "modern",
      index,
      score,
    })),
    timings: { detector: 0, embed: 0, search: 0, total: 0 },
  }
}

function moved(result, dx, dy = 0) {
  return { ...result, quad: result.quad.map(([x, y]) => [x + dx, y + dy]) }
}

function run(frames, tracker = INITIAL_TRACKER, allowed = undefined) {
  const outcomes = []
  for (const result of frames) {
    const next = evaluateFrame(tracker, result, allowed)
    tracker = next.tracker
    outcomes.push(next.outcome.type)
  }
  return { outcomes, tracker }
}

test("cardKey strips only a face suffix after a complete UUID", () => {
  assert.equal(cardKey(`${UUID}-1`), UUID)
  assert.equal(cardKey(UUID), UUID)
  // A UUID whose last group is all digits is not a face suffix.
  assert.equal(
    cardKey("0a1b2c3d-0000-4000-8000-123456789012"),
    "0a1b2c3d-0000-4000-8000-123456789012",
  )
})

test("a clear match is logged once a second frame agrees", () => {
  const card = frame([
    [UUID, 0.92],
    [OTHER, 0.6],
  ])
  assert.deepEqual(run([card, card]).outcomes, ["tracking", "accept"])
})

test("a near tie needs a third agreeing frame", () => {
  const nearTie = frame([
    [UUID, 0.7],
    [OTHER, 0.66],
  ])
  assert.deepEqual(run([nearTie, nearTie, nearTie]).outcomes, ["tracking", "tracking", "accept"])
  const flipped = frame([
    [OTHER, 0.7],
    [UUID, 0.66],
  ])
  assert.deepEqual(run([nearTie, nearTie, flipped]).outcomes, ["tracking", "tracking", "tracking"])
})

test("a card is logged only once it holds still", () => {
  const card = frame([
    [UUID, 0.92],
    [OTHER, 0.6],
  ])
  // Slid across the view (the quad's short side is 200 px), the card is never logged, even
  // though every frame matches it clearly.
  const sliding = [0, 40, 80, 120].map((dx) => moved(card, dx))
  assert.deepEqual(run(sliding).outcomes, ["tracking", "tracking", "tracking", "tracking"])
  // Lifted towards the camera, it grows.
  const lifted = { ...card, quad: card.quad.map(([x, y]) => [x * 1.2 - 64, y * 1.2 - 56]) }
  assert.deepEqual(run([card, lifted]).outcomes, ["tracking", "tracking"])
  // Once it stops, hand shake of a few pixels still counts as still.
  assert.deepEqual(run([...sliding, moved(card, 124, -3)]).outcomes.at(-1), "accept")
})

test("a card whose art matches the blank Whiteout is not identified", () => {
  // Mystery Booster 2's Whiteout has an all-white art crop, so glare matches it at ~0.98.
  const washedOut = frame([
    ["8cef2ecb-4c23-4af8-940e-86a381e92330", 0.98],
    [UUID, 0.72],
  ])
  assert.deepEqual(run([washedOut, washedOut, washedOut]).outcomes, [
    "tracking",
    "tracking",
    "tracking",
  ])
  assert.equal(evaluateFrame(INITIAL_TRACKER, washedOut).outcome.candidate, null)
})

test("no card in view: low upright vote or a tiny quad is empty", () => {
  // Blank paper scores high as "Whiteout" but the detector does not agree it is upright.
  assert.deepEqual(
    run([
      frame(
        [
          [UUID, 0.91],
          [OTHER, 0.8],
        ],
        { upVote: 0.1 },
      ),
    ]).outcomes,
    ["empty"],
  )
  const tiny = [
    [300, 300],
    [320, 300],
    [320, 330],
    [300, 330],
  ]
  assert.deepEqual(
    run([
      frame(
        [
          [UUID, 0.92],
          [OTHER, 0.5],
        ],
        { quad: tiny },
      ),
    ]).outcomes,
    ["empty"],
  )
})

test("weak matches are never logged", () => {
  const weak = frame([
    [UUID, SCAN_THRESHOLDS.minScore - 0.01],
    [OTHER, 0.2],
  ])
  assert.deepEqual(run([weak, weak, weak]).outcomes, ["tracking", "tracking", "tracking"])
})

test("the same card is not logged twice in a row, even after it leaves the frame", () => {
  const card = frame([
    [UUID, 0.92],
    [OTHER, 0.6],
  ])
  const back = frame([
    [`${UUID}-1`, 0.92],
    [OTHER, 0.6],
  ])
  const empty = frame([], { upVote: 0 })
  assert.deepEqual(run([card, card, card, empty, card, card, back]).outcomes, [
    "tracking",
    "accept",
    "duplicate",
    "empty",
    "tracking",
    "duplicate",
    "duplicate",
  ])
})

test("another card in between allows the first card again", () => {
  const a = frame([
    [UUID, 0.92],
    [OTHER, 0.6],
  ])
  const b = frame([
    [OTHER, 0.92],
    [UUID, 0.6],
  ])
  assert.deepEqual(run([a, a, b, b, a, a]).outcomes, [
    "tracking",
    "accept",
    "tracking",
    "accept",
    "tracking",
    "accept",
  ])
})

test("forgetting the last scan (after deleting it) allows a rescan", () => {
  const card = frame([
    [UUID, 0.92],
    [OTHER, 0.6],
  ])
  const { tracker } = run([card, card])
  assert.deepEqual(run([card], forgetLastLogged(tracker)).outcomes, ["accept"])
})

test("a set lock only logs allowed candidates, with the margin measured among them", () => {
  const allowed = (candidate) => candidate.id !== OTHER
  // The disallowed runner-up does not make a clear allowed match ambiguous.
  const close = frame([
    [UUID, 0.9],
    [OTHER, 0.88],
  ])
  assert.deepEqual(run([close, close]).outcomes, ["tracking", "tracking"])
  assert.deepEqual(run([close, close], INITIAL_TRACKER, allowed).outcomes, ["tracking", "accept"])
  const { outcome } = evaluateFrame(run([close], INITIAL_TRACKER, allowed).tracker, close, allowed)
  assert.equal(outcome.candidate.id, UUID)
})

test("a card clearly from outside the locked sets is reported, not logged", () => {
  const allowed = (candidate) => candidate.id !== OTHER
  const outside = frame([
    [OTHER, 0.9],
    [UUID, 0.62],
  ])
  const { outcome, tracker } = evaluateFrame(INITIAL_TRACKER, outside, allowed)
  assert.equal(outcome.type, "outside-lock")
  assert.equal(outcome.candidate.id, OTHER)
  assert.equal(tracker.lastLoggedKey, null)
  // A near tie between an outside and an allowed card falls back to the allowed candidate.
  const tie = frame([
    [OTHER, 0.8],
    [UUID, 0.78],
  ])
  assert.deepEqual(run([tie, tie], INITIAL_TRACKER, allowed).outcomes, ["tracking", "accept"])
})

test("tokens mode offers the best token for a tap and never logs on its own", () => {
  const token = (candidates, options) => {
    const result = frame(
      candidates.map(([id, score]) => [id, score]),
      options,
    )
    result.candidates.forEach((candidate, index) => {
      candidate.layout = candidates[index][2]
    })
    return result
  }
  // A look-alike card outranks the token; the token is still what is offered.
  const behindCard = token([
    ["funeral-room", 0.9, "normal"],
    [UUID, 0.72, "token"],
    [OTHER, 0.7, "double_faced_token"],
  ])
  assert.deepEqual(evaluateTokenFrame(behindCard), {
    type: "ready",
    candidate: behindCard.candidates[1],
  })
  // The same token frame after frame stays "ready": tapping again adds another copy.
  assert.equal(evaluateTokenFrame(behindCard).type, "ready")
  // No token above the floor: keep tracking, showing the best token guess if any.
  const weak = token([
    ["card", 0.95, "normal"],
    [UUID, SCAN_THRESHOLDS.minScore - 0.01, "token"],
  ])
  assert.deepEqual(evaluateTokenFrame(weak), { type: "tracking", candidate: weak.candidates[1] })
  assert.deepEqual(evaluateTokenFrame(token([["card", 0.95, "normal"]])), {
    type: "tracking",
    candidate: null,
  })
  // Emblems are tokens (printed on token backs); art cards and cards without a layout are not.
  assert.equal(evaluateTokenFrame(token([["emblem", 0.9, "emblem"]])).type, "ready")
  assert.equal(evaluateTokenFrame(token([["art", 0.9, "art_series"]])).type, "tracking")
  assert.equal(evaluateTokenFrame(token([["old", 0.9, undefined]])).type, "tracking")
  assert.deepEqual(evaluateTokenFrame(token([[UUID, 0.9, "token"]], { upVote: 0 })), {
    type: "empty",
  })
})

test("frames slow down while nothing new is in view", () => {
  const { activeMs, relaxedMs, settleMs } = FRAME_PACING
  for (const outcome of ["tracking", "accept", "outside-lock", "ready"]) {
    assert.equal(frameInterval(outcome, 0), activeMs, outcome)
  }
  // The logged card still in view.
  assert.equal(frameInterval("duplicate", 0), relaxedMs)
  // A card just left: stay quick for the next one, then settle.
  assert.equal(frameInterval("empty", settleMs - 1), activeMs)
  assert.equal(frameInterval("empty", settleMs), relaxedMs)
})
