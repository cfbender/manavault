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
