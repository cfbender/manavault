export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest("input, textarea, select") ||
    target.isContentEditable ||
    target.closest("[role='textbox']"),
  )
}
