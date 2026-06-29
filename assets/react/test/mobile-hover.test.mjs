import test from "node:test"
import assert from "node:assert/strict"

import {
  shouldClearMobileHoverReveal,
  shouldRevealMobileHover,
  shouldSuppressMobileHoverClick,
} from "../src/lib/mobile-hover.ts"

test("mobile hover reveals on first touch tap only when hidden", () => {
  assert.equal(shouldRevealMobileHover({ isRevealed: false, pointerType: "touch" }), true)
  assert.equal(shouldRevealMobileHover({ isRevealed: true, pointerType: "touch" }), false)
})

test("mobile hover keeps desktop mouse interactions unchanged", () => {
  assert.equal(
    shouldRevealMobileHover({
      hasMobileInteraction: true,
      isRevealed: false,
      pointerType: "mouse",
    }),
    false,
  )
})

test("mobile hover supports non-mouse pointers only on mobile-capable devices", () => {
  assert.equal(
    shouldRevealMobileHover({
      hasMobileInteraction: true,
      isRevealed: false,
      pointerType: "pen",
    }),
    true,
  )
  assert.equal(
    shouldRevealMobileHover({
      hasMobileInteraction: false,
      isRevealed: false,
      pointerType: "pen",
    }),
    false,
  )
})

test("mobile hover does not reveal when there is no hover state or nested control owns the tap", () => {
  assert.equal(
    shouldRevealMobileHover({ canReveal: false, isRevealed: false, pointerType: "touch" }),
    false,
  )
  assert.equal(
    shouldRevealMobileHover({
      isInteractiveTarget: true,
      isRevealed: false,
      pointerType: "touch",
    }),
    false,
  )
})

test("mobile hover suppresses only the click produced by the reveal tap", () => {
  assert.equal(shouldSuppressMobileHoverClick({ revealedByPointerDown: true }), true)
  assert.equal(shouldSuppressMobileHoverClick({ revealedByPointerDown: false }), false)
})

test("mobile hover clears on outside taps while preserving inside second taps", () => {
  assert.equal(shouldClearMobileHoverReveal({ isInsideTarget: false, isRevealed: true }), true)
  assert.equal(shouldClearMobileHoverReveal({ isInsideTarget: true, isRevealed: true }), false)
  assert.equal(shouldClearMobileHoverReveal({ isInsideTarget: false, isRevealed: false }), false)
})
