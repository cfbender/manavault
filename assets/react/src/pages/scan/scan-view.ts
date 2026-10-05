/**
 * What the viewfinder and status pill show for each frame. Pure, so the notice delay is
 * unit-tested.
 */
import type { Identification } from "./recognition/messages"
import type { Candidate, Quad } from "./recognition/pipeline"
import type { FrameOutcome } from "./scan-decision"

/** "Already logged" and "Not in locked sets" appear only after lasting this long. */
export const NOTICE_DELAY_MS = 1200

export interface ScanView {
  /** The outcome shown, after the notice delay. */
  outcome: FrameOutcome["type"] | "idle"
  /** The latest frame's own outcome, and since when it has been the same. */
  raw: FrameOutcome["type"] | "idle"
  since: number
  /** Detected card corners in frame pixels, when a card is in view. */
  quad: Quad | null
  candidate: Candidate | null
  /** Milliseconds for the latest identification. */
  ms: number | null
  /** Increments on every logged scan, to replay the confirmation flash. */
  logged: number
}

export const IDLE_VIEW: ScanView = {
  outcome: "idle",
  raw: "idle",
  since: 0,
  quad: null,
  candidate: null,
  ms: null,
  logged: 0,
}

export function nextView(
  current: ScanView,
  outcome: FrameOutcome,
  result: Identification,
  now: number,
): ScanView {
  const since = current.raw === outcome.type ? current.since : now
  const base = {
    raw: outcome.type,
    since,
    quad: outcome.type === "empty" ? null : result.quad,
    ms: result.timings.total,
  }
  if (outcome.type === "accept") {
    return { ...base, outcome: "accept", candidate: outcome.candidate, logged: current.logged + 1 }
  }
  // In tokens mode the token stays in view ("ready") after a tap logs it.
  const notice =
    outcome.type === "duplicate" || outcome.type === "outside-lock" || outcome.type === "ready"
  if (notice && now - since < NOTICE_DELAY_MS) {
    // Keep "Logged …" on screen after a scan; otherwise just keep tracking the card.
    if (current.outcome === "accept") {
      return { ...base, outcome: "accept", candidate: current.candidate, logged: current.logged }
    }
    if (outcome.type !== "ready") {
      return { ...base, outcome: "tracking", candidate: outcome.candidate, logged: current.logged }
    }
  }
  return {
    ...base,
    outcome: outcome.type,
    candidate: outcome.type === "empty" ? null : outcome.candidate,
    logged: current.logged,
  }
}
