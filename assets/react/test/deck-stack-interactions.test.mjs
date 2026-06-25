import test from "node:test"
import assert from "node:assert/strict"

import {
  shouldRevealDeckStackCardOnPointerDown,
  shouldUpdateDeckStackHoverFromPointer,
} from "../src/pages/decks/deck-stack-interactions.ts"

test("touching an inactive deck stack card reveals it instead of activating the card", () => {
  assert.equal(
    shouldRevealDeckStackCardOnPointerDown({
      isActive: false,
      pointerType: "touch",
    }),
    true,
  )
})

test("mouse pointers and already-active cards keep their current deck stack behavior", () => {
  assert.equal(
    shouldRevealDeckStackCardOnPointerDown({
      isActive: false,
      pointerType: "mouse",
    }),
    false,
  )
  assert.equal(
    shouldRevealDeckStackCardOnPointerDown({
      isActive: true,
      pointerType: "touch",
    }),
    false,
  )
})

test("deck stack menus capture mouse movement instead of changing the active card", () => {
  assert.equal(
    shouldUpdateDeckStackHoverFromPointer({
      isPointerCaptured: true,
      pointerType: "mouse",
    }),
    false,
  )
  assert.equal(
    shouldUpdateDeckStackHoverFromPointer({
      isPointerCaptured: false,
      pointerType: "mouse",
    }),
    true,
  )
})
