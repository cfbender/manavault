/**
 * Turns per-frame recognition results into scan events. Pure, so the thresholds and the
 * "never the same card twice in a row" rule are unit-tested.
 *
 * Thresholds were calibrated on synthetic phone frames with bundle
 * retrain-20260925T043526910942Z: cards scored top ≥ 0.68 with an upright vote ≈ 1, while
 * empty tables and blank paper had upright votes ≤ 0.17 (blank paper still scores 0.91 as
 * "Whiteout", so the upright vote is what rejects it).
 */
import type { Identification } from "./recognition/messages"
import {
  CARD_IN_VIEW,
  cardInView as detectorSawCard,
  isTokenArt,
  type Candidate,
} from "./recognition/pipeline.ts"

export const SCAN_THRESHOLDS = {
  /** A card is in view when this share of detector rotations agree on "up". */
  minUpVote: CARD_IN_VIEW.minUpVote,
  /** Smallest plausible card short side, in frame pixels (frames are 640 px squares). */
  minShortSide: CARD_IN_VIEW.minShortSide,
  /** Below this, a candidate is never logged. */
  minScore: 0.6,
  /** One frame is enough when top-1 is this similar and leads the runner-up by `clearMargin`. */
  clearScore: 0.75,
  clearMargin: 0.08,
  /** Otherwise this many consecutive frames must agree. */
  agreeingFrames: 2,
} as const

export interface ScanTracker {
  /** Card key of the current run of agreeing frames. */
  streakKey: string | null
  streak: number
  /** Card key of the last logged scan; the same card is not logged again until another is. */
  lastLoggedKey: string | null
}

export const INITIAL_TRACKER: ScanTracker = { streakKey: null, streak: 0, lastLoggedKey: null }

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
  if (!cardInView(result)) {
    return { tracker: { ...tracker, streakKey: null, streak: 0 }, outcome: { type: "empty" } }
  }

  const candidates = result.candidates.filter(allowed)
  const best = result.candidates[0]
  if (
    best &&
    !allowed(best) &&
    best.score >= SCAN_THRESHOLDS.minScore &&
    best.score - (candidates[0]?.score ?? 0) >= SCAN_THRESHOLDS.clearMargin
  ) {
    return {
      tracker: { ...tracker, streakKey: null, streak: 0 },
      outcome: { type: "outside-lock", candidate: best },
    }
  }

  const [first, second] = candidates
  if (!first || first.score < SCAN_THRESHOLDS.minScore) {
    return {
      tracker: { ...tracker, streakKey: null, streak: 0 },
      outcome: { type: "tracking", candidate: first ?? null },
    }
  }

  const key = cardKey(first.id)
  const streak = tracker.streakKey === key ? tracker.streak + 1 : 1
  const clear =
    first.score >= SCAN_THRESHOLDS.clearScore &&
    first.score - (second?.score ?? 0) >= SCAN_THRESHOLDS.clearMargin
  const next = { ...tracker, streakKey: key, streak }

  if (!clear && streak < SCAN_THRESHOLDS.agreeingFrames) {
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

/** After the last logged scan is deleted, the same card may be scanned again. */
export function forgetLastLogged(tracker: ScanTracker): ScanTracker {
  return { ...tracker, lastLoggedKey: null }
}

/** After a card is logged by hand, treat what the scanner sees as already logged. */
export function markLogged(tracker: ScanTracker, key: string | null): ScanTracker {
  return key ? { ...tracker, lastLoggedKey: key } : tracker
}
