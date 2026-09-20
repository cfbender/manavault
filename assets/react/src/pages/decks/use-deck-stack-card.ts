import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react"

import { useHasMobileHoverInteraction, useMobileHoverReveal } from "../../lib/mobile-hover"
import { shouldCloseDeckStackActionMenu } from "./deck-stack-interactions"

export function useDeckStackCard({
  isActive,
  isSelecting,
  onReveal,
}: {
  isActive: boolean
  isSelecting: boolean
  onReveal: () => void
}) {
  const [hasFocusWithin, setHasFocusWithin] = useState(false)
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false)
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false)
  const actionMenuRef = useRef<HTMLDivElement>(null)
  const hasMobileHover = useHasMobileHoverInteraction()
  const mobileHover = useMobileHoverReveal<HTMLButtonElement>({
    clearOnOutsidePointerDown: false,
    isRevealed: isActive,
    onRevealChange: (isRevealed) => {
      if (isRevealed) onReveal()
    },
  })
  const isInteractive =
    !isSelecting && (isActive || hasFocusWithin || isActionMenuOpen || isQuickMenuOpen)

  useEffect(() => {
    closeFocusedActionMenu(isActive)
  }, [isActive])

  function closeFocusedActionMenu(isCardRaised: boolean) {
    const activeElement = actionMenuRef.current?.ownerDocument.activeElement
    if (!(activeElement instanceof HTMLElement)) return

    const actionMenuHasFocus = actionMenuRef.current?.contains(activeElement) === true
    if (!shouldCloseDeckStackActionMenu({ actionMenuHasFocus, isActive: isCardRaised })) return

    activeElement.blur()
    setHasFocusWithin(false)
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setHasFocusWithin(false)
    }
  }

  function handlePointerLeave(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "touch") closeFocusedActionMenu(false)
  }

  return {
    actionMenuRef,
    handleBlur,
    handlePointerLeave,
    hasMobileHover,
    isInteractive,
    mobileHover,
    setHasFocusWithin,
    setIsActionMenuOpen,
    setIsQuickMenuOpen,
  }
}
