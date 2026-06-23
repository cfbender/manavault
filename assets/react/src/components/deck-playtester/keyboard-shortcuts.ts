import { useEffect } from "react"
import type { PlaytestZone } from "../../lib/deck-playtest"
import { isTypingTarget } from "./keyboard-helpers"
import type { CardHoverTarget } from "./types"

export function usePlaytesterKeyboardShortcuts({
  activeKeyboardCard,
  changeLife,
  draw,
  keepHand,
  moveActiveKeyboardCard,
  mulligan,
  nextTurn,
  onEscape,
  openingHand,
  shuffle,
  toggleTapped,
  undo,
  untapAll,
}: {
  activeKeyboardCard: CardHoverTarget | null
  changeLife: (delta: number) => void
  draw: (count?: number) => void
  keepHand: () => void
  moveActiveKeyboardCard: (to: PlaytestZone) => boolean
  mulligan: () => void
  nextTurn: () => void
  onEscape: () => void
  openingHand: boolean
  shuffle: () => void
  toggleTapped: (cardId: string) => void
  undo: () => void
  untapAll: () => void
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return

      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault()
        undo()
        return
      }

      if (key === "d") {
        event.preventDefault()
        draw(1)
      } else if (key === "m" && openingHand) {
        event.preventDefault()
        mulligan()
      } else if (key === "n") {
        event.preventDefault()
        nextTurn()
      } else if (key === "s") {
        event.preventDefault()
        shuffle()
      } else if (key === "u") {
        event.preventDefault()
        untapAll()
      } else if (key === "t" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (activeKeyboardCard?.zone !== "battlefield") return

        event.preventDefault()
        toggleTapped(activeKeyboardCard.cardId)
      } else if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (key === "h" || key === "g" || key === "e" || key === "b")
      ) {
        const canPlayActiveKeyboardCard =
          activeKeyboardCard?.zone === "hand" ||
          activeKeyboardCard?.zone === "command" ||
          activeKeyboardCard?.zone === "library"
        const moved =
          key === "h"
            ? moveActiveKeyboardCard("hand")
            : key === "g"
              ? moveActiveKeyboardCard("graveyard")
              : key === "e"
                ? moveActiveKeyboardCard("exile")
                : canPlayActiveKeyboardCard
                  ? moveActiveKeyboardCard("battlefield")
                  : false

        if (!moved) return
        event.preventDefault()
      } else if (key === "enter" && openingHand) {
        event.preventDefault()
        keepHand()
      } else if (key === "escape") {
        event.preventDefault()
        onEscape()
      } else if (key === "+" || key === "=") {
        event.preventDefault()
        changeLife(1)
      } else if (key === "-") {
        event.preventDefault()
        changeLife(-1)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    activeKeyboardCard,
    changeLife,
    draw,
    keepHand,
    moveActiveKeyboardCard,
    mulligan,
    nextTurn,
    onEscape,
    openingHand,
    shuffle,
    toggleTapped,
    undo,
    untapAll,
  ])
}
