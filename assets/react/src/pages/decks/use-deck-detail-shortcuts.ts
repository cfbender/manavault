import { useEffect } from "react"

// Deck-detail keyboard shortcuts. Page-level actions only (no per-card focus
// dependency) so the bindings stay predictable regardless of hover state.
export type DeckDetailShortcutHandlers = {
  onAddCard: () => void
  onToggleSelect: () => void
  onCycleGroup: () => void
  onOpenPlaytest: () => void
  onJumpToTagIndex: (index: number) => void
  onClearHighlight: () => void
  onToggleHelp: () => void
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest("input, textarea, select") ||
      target.isContentEditable ||
      target.closest("[role='textbox']"),
  )
}

export function useDeckDetailShortcuts(
  handlers: DeckDetailShortcutHandlers,
  enabled: boolean,
) {
  const {
    onAddCard,
    onToggleSelect,
    onCycleGroup,
    onOpenPlaytest,
    onJumpToTagIndex,
    onClearHighlight,
    onToggleHelp,
  } = handlers

  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return

      // Shift+/ = "?" toggles the shortcuts overlay.
      if (event.key === "?") {
        event.preventDefault()
        onToggleHelp()
        return
      }

      if (event.key === "Escape") {
        onClearHighlight()
        return
      }

      // 1-9 jump to the Nth custom tag (1-indexed in the UI, 0-indexed here).
      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault()
        onJumpToTagIndex(Number.parseInt(event.key, 10) - 1)
        return
      }

      switch (event.key.toLowerCase()) {
        case "a":
          event.preventDefault()
          onAddCard()
          break
        case "s":
          event.preventDefault()
          onToggleSelect()
          break
        case "g":
          event.preventDefault()
          onCycleGroup()
          break
        case "p":
          event.preventDefault()
          onOpenPlaytest()
          break
        default:
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    enabled,
    onAddCard,
    onToggleSelect,
    onCycleGroup,
    onOpenPlaytest,
    onJumpToTagIndex,
    onClearHighlight,
    onToggleHelp,
  ])
}

export const DECK_DETAIL_SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: "A", label: "Add card" },
  { keys: "S", label: "Toggle select mode" },
  { keys: "G", label: "Cycle grouping" },
  { keys: "P", label: "Open playtest" },
  { keys: "1–9", label: "Jump to custom tag" },
  { keys: "Esc", label: "Clear highlight / deselect" },
  { keys: "?", label: "Toggle this help" },
]
