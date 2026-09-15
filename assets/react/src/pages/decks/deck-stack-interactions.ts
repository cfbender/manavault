import { shouldRevealMobileHover } from "../../lib/mobile-hover.ts"

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

export const DECK_STACK_CARD_MENU_ATTRIBUTE = "data-deck-stack-card-menu"

export function deckStackCardMenuOwnerId(target: EventTarget | null): string | null {
  if (typeof Element === "undefined" || !(target instanceof Element)) return null

  return (
    target
      .closest(`[${DECK_STACK_CARD_MENU_ATTRIBUTE}]`)
      ?.getAttribute(DECK_STACK_CARD_MENU_ATTRIBUTE) ?? null
  )
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
  return shouldRevealMobileHover({ isRevealed: isActive, pointerType })
}

export function shouldUnstackDeckStackGroup({
  isMobile,
  isSelecting,
}: {
  isMobile: boolean
  isSelecting: boolean
}) {
  return isSelecting && isMobile
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
