import test from "node:test"
import assert from "node:assert/strict"

import {
  DECK_STACK_ACTION_MENU_CLASS_NAME,
  DECK_STACK_ACTION_MENU_DEFAULT_STYLE,
  DECK_STACK_ACTION_MENU_TALL_STYLE,
  deckStackActionMenuDirection,
  deckStackActionMenuStyle,
  shouldCloseDeckStackActionMenu,
  shouldRaiseDeckStackCardForActionMenu,
  shouldRevealDeckStackCardOnPointerDown,
  shouldClearDeckStackTouchReveal,
  shouldUnstackDeckStackGroup,
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

test("deck stack action menus fit inside the card without scrollbars", () => {
  assert.equal(deckStackActionMenuDirection({ isLast: false }), "down")
  assert.equal(deckStackActionMenuDirection({ isLast: true }), "down")
  assert.match(DECK_STACK_ACTION_MENU_CLASS_NAME, /\bflex-nowrap\b/)
  assert.match(DECK_STACK_ACTION_MENU_CLASS_NAME, /\boverflow-hidden\b/)
  assert.doesNotMatch(DECK_STACK_ACTION_MENU_CLASS_NAME, /\boverflow-y-auto\b/)
  assert.doesNotMatch(DECK_STACK_ACTION_MENU_CLASS_NAME, /\bmax-w-full\b/)
  assert.equal(DECK_STACK_ACTION_MENU_DEFAULT_STYLE.top, "1.75rem")
  assert.equal(
    deckStackActionMenuStyle({ canSetCommander: false, hasClearTag: false }),
    DECK_STACK_ACTION_MENU_DEFAULT_STYLE,
  )
  assert.equal(
    deckStackActionMenuStyle({ canSetCommander: true, hasClearTag: false }),
    DECK_STACK_ACTION_MENU_DEFAULT_STYLE,
  )
  assert.equal(
    deckStackActionMenuStyle({ canSetCommander: true, hasClearTag: true }),
    DECK_STACK_ACTION_MENU_TALL_STYLE,
  )
})

test("deck stack action menu closes when its card is no longer raised", () => {
  assert.equal(
    shouldCloseDeckStackActionMenu({
      actionMenuHasFocus: true,
      isActive: false,
    }),
    true,
  )
  assert.equal(
    shouldCloseDeckStackActionMenu({
      actionMenuHasFocus: true,
      isActive: true,
    }),
    false,
  )
  assert.equal(
    shouldCloseDeckStackActionMenu({
      actionMenuHasFocus: false,
      isActive: false,
    }),
    false,
  )
})

test("deck stack action menu raises its card before opening", () => {
  assert.equal(shouldRaiseDeckStackCardForActionMenu({ isActive: false }), true)
  assert.equal(shouldRaiseDeckStackCardForActionMenu({ isActive: true }), false)
})

test("deck stack touch reveal clears only for outside touches", () => {
  assert.equal(shouldClearDeckStackTouchReveal({ isInsideStack: false, isPinned: true }), true)
  assert.equal(shouldClearDeckStackTouchReveal({ isInsideStack: true, isPinned: true }), false)
  assert.equal(shouldClearDeckStackTouchReveal({ isInsideStack: false, isPinned: false }), false)
})

test("deck stacks unstack only while selecting on mobile", () => {
  assert.equal(shouldUnstackDeckStackGroup({ isMobile: true, isSelecting: true }), true)
  assert.equal(shouldUnstackDeckStackGroup({ isMobile: true, isSelecting: false }), false)
  assert.equal(shouldUnstackDeckStackGroup({ isMobile: false, isSelecting: true }), false)
  assert.equal(shouldUnstackDeckStackGroup({ isMobile: false, isSelecting: false }), false)
})
