import { useCallback, useRef } from "react"

const MAX_TILT_DEG = 7

function tiltAllowed() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * Tilts a card toward the mouse with a moving glare, like holding it up to the
 * light. Returns a ref callback for the element with the `card-tilt` class;
 * the element's CSS reads --tilt-x/--tilt-y and --glare-x/--glare-y. Touch and
 * reduced-motion users get the flat card.
 */
export function useCardTilt<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null)

  return useCallback((element: T | null) => {
    cleanup.current?.()
    cleanup.current = null
    if (!element || !tiltAllowed()) return

    let frame = 0
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return
      const { clientX, clientY } = event
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect()
        const x = (clientX - rect.left) / rect.width
        const y = (clientY - rect.top) / rect.height
        element.style.setProperty("--tilt-x", `${(x - 0.5) * 2 * MAX_TILT_DEG}deg`)
        element.style.setProperty("--tilt-y", `${(0.5 - y) * 2 * MAX_TILT_DEG}deg`)
        element.style.setProperty("--glare-x", `${x * 100}%`)
        element.style.setProperty("--glare-y", `${y * 100}%`)
        element.dataset.tilting = ""
      })
    }
    const leave = () => {
      cancelAnimationFrame(frame)
      delete element.dataset.tilting
      element.style.removeProperty("--tilt-x")
      element.style.removeProperty("--tilt-y")
    }

    element.addEventListener("pointermove", move)
    element.addEventListener("pointerleave", leave)
    cleanup.current = () => {
      cancelAnimationFrame(frame)
      element.removeEventListener("pointermove", move)
      element.removeEventListener("pointerleave", leave)
    }
  }, [])
}
