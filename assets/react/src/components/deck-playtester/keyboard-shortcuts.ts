import { useEffect } from "react"
import type { PlaytestZone } from "../../lib/deck-playtest"
import { isTypingTarget } from "./keyboard-helpers"
import type { CardHoverTarget } from "./types"

export function usePlaytesterKeyboardShortcuts({
  adjustCounter,
  changeLife,
  draw,
  duplicateCards,
  keepHand,
  moveCards,
  mulligan,
  nextTurn,
  onEscape,
  onToggleShortcuts,
  openingHand,
  shuffle,
  targets,
  toggleFaceDown,
  toggleTapped,
  undo,
  untapAll,
}: {
  adjustCounter: (cardIds: string[], kind: "plusOneCounters", delta: number) => void
  changeLife: (delta: number) => void
  draw: (count?: number) => void
  duplicateCards: (cardIds: string[]) => void
  keepHand: () => void
  moveCards: (targets: CardHoverTarget[], to: PlaytestZone, placement?: "top" | "bottom") => void
  mulligan: () => void
  nextTurn: () => void
  onEscape: () => void
  onToggleShortcuts: () => void
  openingHand: boolean
  shuffle: () => void
  /** The hovered card, or the selection; see usePlaytesterState's keyboardTargets. */
  targets: CardHoverTarget[]
  toggleFaceDown: (cardIds: string[]) => void
  toggleTapped: (cardIds: string[]) => void
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
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const battlefieldIds = targets
        .filter(({ zone }) => zone === "battlefield")
        .map(({ cardId }) => cardId)
      const move = (to: PlaytestZone, placement?: "top" | "bottom") => {
        const movable = targets.filter(({ zone }) => zone !== to || to === "library")
        if (movable.length === 0) return false
        moveCards(movable, to, placement)
        return true
      }
      const onBattlefield = (action: (cardIds: string[]) => void) => {
        if (battlefieldIds.length === 0) return false
        action(battlefieldIds)
        return true
      }

      const handled = (() => {
        switch (key) {
          case "?":
            onToggleShortcuts()
            return true
          case "d":
            draw(1)
            return true
          case "m":
            if (!openingHand) return false
            mulligan()
            return true
          case "enter":
            if (!openingHand) return false
            keepHand()
            return true
          case "n":
            nextTurn()
            return true
          case "s":
            shuffle()
            return true
          case "u":
            untapAll()
            return true
          case "escape":
            onEscape()
            return true
          case "+":
          case "=":
            changeLife(1)
            return true
          case "-":
          case "_":
            changeLife(-1)
            return true
          case "]":
            return onBattlefield((ids) => adjustCounter(ids, "plusOneCounters", 1))
          case "[":
            return onBattlefield((ids) => adjustCounter(ids, "plusOneCounters", -1))
          case "t":
            return onBattlefield(toggleTapped)
          case "f":
            return onBattlefield(toggleFaceDown)
          case "c":
            return onBattlefield(duplicateCards)
          case "h":
            return move("hand")
          case "g":
            return move("graveyard")
          case "e":
            return move("exile")
          case "l":
            return move("library", event.shiftKey ? "bottom" : "top")
          case "b":
            return move("battlefield")
          default:
            return false
        }
      })()

      if (handled) event.preventDefault()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    adjustCounter,
    changeLife,
    draw,
    duplicateCards,
    keepHand,
    moveCards,
    mulligan,
    nextTurn,
    onEscape,
    onToggleShortcuts,
    openingHand,
    shuffle,
    targets,
    toggleFaceDown,
    toggleTapped,
    undo,
    untapAll,
  ])
}

export const SHORTCUT_GROUPS: Array<{
  title: string
  items: Array<[keys: string, label: string]>
}> = [
  {
    title: "Turn",
    items: [
      ["N", "Next turn (untap + draw)"],
      ["D", "Draw a card"],
      ["U", "Untap all"],
      ["S", "Shuffle library"],
      ["+ / −", "Gain / lose 1 life"],
      ["Ctrl Z", "Undo"],
    ],
  },
  {
    title: "Hovered card, or every selected card",
    items: [
      ["T", "Tap / untap"],
      ["F", "Flip face down"],
      ["C", "Token copy"],
      ["] / [", "Add / remove a +1/+1 counter"],
      ["B", "Play to battlefield"],
      ["H", "Return to hand"],
      ["G", "Graveyard"],
      ["E", "Exile"],
      ["L", "Top of library"],
      ["Shift L", "Bottom of library"],
    ],
  },
  {
    title: "Mouse",
    items: [
      ["Dbl-click", "Tap a permanent; play from library or graveyard"],
      ["Shift click", "Add a permanent to the selection"],
      ["Drag", "Box-select on empty battlefield"],
      ["Click chip", "Counter +1 (Shift click −1)"],
    ],
  },
  {
    title: "Opening hand",
    items: [
      ["Enter", "Keep hand"],
      ["M", "Mulligan"],
    ],
  },
]
