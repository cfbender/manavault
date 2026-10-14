/**
 * Carries a card from a search result into its card page (and back) with a
 * shared view-transition name. Only the opened card carries the name, so the
 * rest of the grid simply cross-fades.
 */
let lastOpenedCardId: string | null = null

export function cardPageTransitionName(cardId: string) {
  return `card-page-${cardId.replace(/[^a-zA-Z0-9_-]/g, "")}`
}

/** Names the clicked result so the navigation's view transition morphs it. */
export function markCardPageSource(cardId: string) {
  lastOpenedCardId = cardId
  const name = cardPageTransitionName(cardId)
  const source = document.querySelector<HTMLElement>(`[data-page-morph="${CSS.escape(name)}"]`)
  if (source) source.style.viewTransitionName = name
}

/** The card last opened from results, which takes the name back on return. */
export function lastOpenedCard() {
  return lastOpenedCardId
}
