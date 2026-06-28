export const DECK_STACK_ACTION_MENU_CLASS_NAME =
  "menu dropdown-content z-[120] mt-0 w-52 flex-nowrap overflow-hidden overscroll-contain rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl"

export const DECK_STACK_ACTION_MENU_DEFAULT_STYLE = {
  marginTop: 0,
  top: "1.75rem",
} as const

export const DECK_STACK_ACTION_MENU_TALL_STYLE = {
  marginTop: 0,
  top: "-0.5rem",
} as const

export function deckStackActionMenuStyle({
  canSetCommander,
  hasClearTag,
}: {
  canSetCommander: boolean
  hasClearTag: boolean
}) {
  return canSetCommander && hasClearTag
    ? DECK_STACK_ACTION_MENU_TALL_STYLE
    : DECK_STACK_ACTION_MENU_DEFAULT_STYLE
}

export type DeckStackActionMenuDirection = "down" | "up"

const DECK_STACK_ACTION_MENU_DIRECTIONS: Record<"first" | "last", DeckStackActionMenuDirection> = {
  first: "down",
  last: "down",
}

export function deckStackActionMenuDirection({
  isLast,
}: {
  isLast: boolean
}): DeckStackActionMenuDirection {
  return DECK_STACK_ACTION_MENU_DIRECTIONS[isLast ? "last" : "first"]
}

export function shouldCloseDeckStackActionMenu({
  actionMenuHasFocus,
  isActive,
}: {
  actionMenuHasFocus: boolean
  isActive: boolean
}) {
  return actionMenuHasFocus && !isActive
}

export function shouldRaiseDeckStackCardForActionMenu({ isActive }: { isActive: boolean }) {
  return !isActive
}

export const DECK_STACK_POINTER_CAPTURE_ATTRIBUTE = "data-deck-stack-pointer-capture"
export const DECK_STACK_POINTER_CAPTURE_SELECTOR = `[${DECK_STACK_POINTER_CAPTURE_ATTRIBUTE}]`

export function isDeckStackPointerCaptured(target: EventTarget | null) {
  return (
    typeof Element !== "undefined" &&
    target instanceof Element &&
    target.closest(DECK_STACK_POINTER_CAPTURE_SELECTOR) !== null
  )
}

export function shouldUpdateDeckStackHoverFromPointer({
  isPointerCaptured,
  pointerType,
}: {
  isPointerCaptured: boolean
  pointerType: string
}) {
  return pointerType !== "touch" && !isPointerCaptured
}

export function shouldRevealDeckStackCardOnPointerDown({
  isActive,
  pointerType,
}: {
  isActive: boolean
  pointerType: string
}) {
  return pointerType !== "mouse" && !isActive
}

export function shouldClearDeckStackTouchReveal({
  isInsideStack,
  isPinned,
}: {
  isInsideStack: boolean
  isPinned: boolean
}) {
  return isPinned && !isInsideStack
}
