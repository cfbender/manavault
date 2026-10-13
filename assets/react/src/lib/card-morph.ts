import { flushSync } from "react-dom"

/**
 * Shared-element "card lifts out of the grid" transitions between a card tile
 * and the full-screen card view, using the View Transitions API. Tiles mark
 * their card with `data-card-morph-key`; the full-screen card carries
 * `CARD_MORPH_NAME`. Without API support, or under reduced motion, the update
 * runs as-is.
 */
export const CARD_MORPH_NAME = "card-morph"

let lastSource: HTMLElement | null = null
let updating = false

function canMorph() {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/** True while a morph is mounting its destination, so it can skip its own intro animation. */
export function cardMorphUpdating() {
  return updating
}

/** Opens the full-screen card from `source`, morphing the tile into it. */
export function morphCardFrom(source: HTMLElement | null, open: () => void) {
  lastSource = source
  if (!source || !canMorph()) {
    open()
    return
  }

  source.style.viewTransitionName = CARD_MORPH_NAME
  startMorph(async () => {
    source.style.viewTransitionName = ""
    updating = true
    try {
      flushSync(open)
    } finally {
      updating = false
    }
    await destinationImagesDecoded()
  })
}

/** Marks the document while a card morph runs, so other shared elements (location objects) sit it out. */
function startMorph(update: () => void | Promise<void>) {
  document.documentElement.dataset.cardMorph = ""
  const transition = document.startViewTransition(update)
  void transition.finished.finally(() => {
    delete document.documentElement.dataset.cardMorph
  })
  return transition
}

/** Waits briefly for the destination card's image, so the morph does not land on a blank card. */
function destinationImagesDecoded() {
  const destination = [
    ...document.querySelectorAll<HTMLElement>("[style*='view-transition-name']"),
  ].find((element) => element.style.viewTransitionName === CARD_MORPH_NAME)
  const images = [...(destination?.querySelectorAll("img") ?? [])]
  return Promise.race([
    Promise.all(images.map((image) => image.decode().catch(() => undefined))),
    new Promise((resolve) => window.setTimeout(resolve, 400)),
  ])
}

/** Closes the full-screen card back into the tile showing `key`, when one is on screen. */
export function morphCardBack(key: string | null, close: () => void) {
  const target = morphTarget(key)
  lastSource = null
  if (!target || !canMorph()) {
    close()
    return
  }

  const transition = startMorph(() => {
    flushSync(close)
    target.style.viewTransitionName = CARD_MORPH_NAME
  })
  void transition.finished.finally(() => {
    target.style.viewTransitionName = ""
  })
}

function morphTarget(key: string | null) {
  if (!key) return null
  const candidate =
    lastSource?.isConnected && lastSource.dataset.cardMorphKey === key
      ? lastSource
      : document.querySelector<HTMLElement>(`[data-card-morph-key="${CSS.escape(key)}"]`)
  if (!candidate) return null

  const rect = candidate.getBoundingClientRect()
  const onScreen =
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  return onScreen ? candidate : null
}
