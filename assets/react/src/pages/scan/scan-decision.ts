/**
 * Turns per-frame recognition results into scan events. Pure, so the thresholds and the
 * "never the same card twice in a row" rule are unit-tested.
 *
 * Thresholds were calibrated on synthetic phone frames with bundle
 * retrain-20260925T043526910942Z: cards scored top ≥ 0.68 with an upright vote ≈ 1, while
 * empty tables and blank paper had upright votes ≤ 0.17 (blank paper still scores 0.91 as
 * "Whiteout", so the upright vote is what rejects it).
 *
 * A card being slid off a stack, or one the camera pans across, is blurred, and blurred cards
 * match random artwork at 0.6–0.67 on bundle retrain-20261026T052522727512Z, often the same
 * wrong card on consecutive frames. So a card is logged only once it has held still across
 * agreeing frames.
 */
import type { Identification } from "./recognition/messages"
import {
  CARD_IN_VIEW,
  cardInView as detectorSawCard,
  isTokenArt,
  quadShort,
  type Candidate,
  type Quad,
} from "./recognition/pipeline.ts"

export const SCAN_THRESHOLDS = {
  /** A card is in view when this share of detector rotations agree on "up". */
  minUpVote: CARD_IN_VIEW.minUpVote,
  /** Smallest plausible card short side, in frame pixels (frames are 640 px squares). */
  minShortSide: CARD_IN_VIEW.minShortSide,
  /** Below this, a candidate is never logged. */
  minScore: 0.6,
  /** A clear match: top-1 is this similar and leads the runner-up by `clearMargin`. */
  clearScore: 0.75,
  clearMargin: 0.08,
  /** Consecutive still frames that must agree on a clear match before it is logged. */
  clearFrames: 2,
  /** Consecutive still frames that must agree on any other match. */
  agreeingFrames: 3,
  /**
   * Between two frames a still card's centre moves less than this share of its short side.
   * Hand shake moves a 200 px card about 3%; a card being slid away moves 20% or more.
   */
  stillMove: 0.1,
  /** …and its short side changes by less than this share (a lifted card grows). */
  stillResize: 0.1,
} as const

/**
 * Gallery arts whose artwork is blank, so they stand for "no artwork visible" rather than a
 * card. Mystery Booster 2's playtest Whiteout has an all-white art crop; any card whose art is
 * washed out by glare or blur matches it at 0.96–0.99. The Ice Age Whiteout is real art and
 * stays scannable.
 */
export const BLANK_ARTS: ReadonlySet<string> = new Set(["8cef2ecb-4c23-4af8-940e-86a381e92330"])

export interface ScanTracker {
  /** Card key of the current run of agreeing frames. */
  streakKey: string | null
  streak: number
  /** Where the card was on the streak's latest frame. */
  streakQuad: Quad | null
  /** Card key of the last logged scan; the same card is not logged again until another is. */
  lastLoggedKey: string | null
}

export const INITIAL_TRACKER: ScanTracker = {
  streakKey: null,
  streak: 0,
  streakQuad: null,
  lastLoggedKey: null,
}

function quadCentre(quad: Quad) {
  return [
    (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4,
    (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4,
  ] as const
}

/** Whether the card at `next` is the card at `previous`, not moved in between. */
function cardStill(previous: Quad, next: Quad) {
  const [px, py] = quadCentre(previous)
  const [nx, ny] = quadCentre(next)
  const short = quadShort(previous)
  return (
    Math.hypot(nx - px, ny - py) <= short * SCAN_THRESHOLDS.stillMove &&
    Math.abs(quadShort(next) / short - 1) <= SCAN_THRESHOLDS.stillResize
  )
}

export type FrameOutcome =
  /** No card in view. */
  | { type: "empty" }
  /** A card is in view but not yet confidently identified. */
  | { type: "tracking"; candidate: Candidate | null }
  /** Identified, but it is the card that was just logged. */
  | { type: "duplicate"; candidate: Candidate }
  /** Clearly a card from outside the locked sets; not logged. */
  | { type: "outside-lock"; candidate: Candidate }
  /** Tokens mode: this token is in view and a tap logs it. */
  | { type: "ready"; candidate: Candidate }
  /** Log this card. */
  | { type: "accept"; candidate: Candidate }

/** Gallery IDs name separate faces `<uuid>-<n>`; both faces are the same physical card. */
export function cardKey(galleryId: string) {
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+$/i.exec(
    galleryId,
  )
  return match?.[1] ?? galleryId
}

export function cardInView(result: Identification) {
  return detectorSawCard(result.upVote, result.quad)
}

/**
 * `allowed` is the set lock: only candidates it accepts can be logged, and the margin is
 * measured among them. When the best match overall is disallowed and clearly beats every
 * allowed one, the card in view is from another set and nothing is logged.
 */
export function evaluateFrame(
  tracker: ScanTracker,
  result: Identification,
  allowed: (candidate: Candidate) => boolean = () => true,
): { tracker: ScanTracker; outcome: FrameOutcome } {
  const reset = { ...tracker, streakKey: null, streak: 0, streakQuad: null }
  if (!cardInView(result)) {
    return { tracker: reset, outcome: { type: "empty" } }
  }

  const best = result.candidates[0]
  // The card's artwork is washed out (glare, blur): nothing to identify yet.
  if (best && BLANK_ARTS.has(best.id)) {
    return { tracker: reset, outcome: { type: "tracking", candidate: null } }
  }

  const candidates = result.candidates.filter(allowed)
  if (
    best &&
    !allowed(best) &&
    best.score >= SCAN_THRESHOLDS.minScore &&
    best.score - (candidates[0]?.score ?? 0) >= SCAN_THRESHOLDS.clearMargin
  ) {
    return { tracker: reset, outcome: { type: "outside-lock", candidate: best } }
  }

  const [first, second] = candidates
  if (!first || first.score < SCAN_THRESHOLDS.minScore) {
    return { tracker: reset, outcome: { type: "tracking", candidate: first ?? null } }
  }

  const key = cardKey(first.id)
  // A card that moved since the last frame starts a new streak, even when it matched the same.
  const continues =
    tracker.streakKey === key &&
    tracker.streakQuad !== null &&
    cardStill(tracker.streakQuad, result.quad)
  const streak = continues ? tracker.streak + 1 : 1
  const clear =
    first.score >= SCAN_THRESHOLDS.clearScore &&
    first.score - (second?.score ?? 0) >= SCAN_THRESHOLDS.clearMargin
  const next = { ...tracker, streakKey: key, streak, streakQuad: result.quad }

  if (streak < (clear ? SCAN_THRESHOLDS.clearFrames : SCAN_THRESHOLDS.agreeingFrames)) {
    return { tracker: next, outcome: { type: "tracking", candidate: first } }
  }
  if (key === tracker.lastLoggedKey) {
    return { tracker: next, outcome: { type: "duplicate", candidate: first } }
  }
  return { tracker: { ...next, lastLoggedKey: key }, outcome: { type: "accept", candidate: first } }
}

/**
 * Tokens mode: the best token match above the floor is offered for a tap, never logged on
 * its own. Non-token matches are ignored rather than rejected, since tokens often come back
 * behind a look-alike card in the top results.
 */
export function evaluateTokenFrame(result: Identification): FrameOutcome {
  if (!cardInView(result)) return { type: "empty" }
  const best = result.candidates.find(isTokenArt) ?? null
  if (!best || best.score < SCAN_THRESHOLDS.minScore) return { type: "tracking", candidate: best }
  return { type: "ready", candidate: best }
}

/**
 * How often frames are identified, to spare the battery. A card being identified gets the
 * full rate; nothing new in view (the logged card still there, or no card for a while) gets a
 * slow one, and a card that appears is picked up within one slow frame. With no card in view
 * at all for `sleepMs`, the camera is switched off until the user taps.
 */
export const FRAME_PACING = {
  /** Shortest time from one frame's start to the next while a card is being identified. */
  activeMs: 150,
  relaxedMs: 500,
  /** No card for this long and frames slow down. */
  settleMs: 3000,
  sleepMs: 60_000,
  /** Breathing room after every frame so the UI thread is never saturated. */
  minGapMs: 40,
} as const

/** Milliseconds from this frame's start to the next frame's start. */
export function frameInterval(outcome: FrameOutcome["type"], msSinceCard: number): number {
  if (outcome === "duplicate") return FRAME_PACING.relaxedMs
  if (outcome === "empty" && msSinceCard >= FRAME_PACING.settleMs) return FRAME_PACING.relaxedMs
  return FRAME_PACING.activeMs
}

/** After the last logged scan is deleted, the same card may be scanned again. */
export function forgetLastLogged(tracker: ScanTracker): ScanTracker {
  return { ...tracker, lastLoggedKey: null }
}

/** After a card is logged by hand, treat what the scanner sees as already logged. */
export function markLogged(tracker: ScanTracker, key: string | null): ScanTracker {
  return key ? { ...tracker, lastLoggedKey: key } : tracker
}
