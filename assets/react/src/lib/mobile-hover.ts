import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react"

export const MOBILE_HOVER_MEDIA_QUERY =
  "(pointer: coarse), (any-pointer: coarse), (hover: none), (any-hover: none)"

const INTERACTIVE_SELECTOR = "a,button,input,select,textarea,label,[role='button'],[role='link']"

export const MOBILE_HOVER_SKIP_ATTRIBUTE = "data-mobile-hover-skip"
export const MOBILE_HOVER_SKIP_SELECTOR = `[${MOBILE_HOVER_SKIP_ATTRIBUTE}]`

export function hasMobileHoverInteraction() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MOBILE_HOVER_MEDIA_QUERY).matches
  )
}

export function useHasMobileHoverInteraction() {
  const [hasMobileInteraction, setHasMobileInteraction] = useState(hasMobileHoverInteraction)

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return

    const mediaQuery = window.matchMedia(MOBILE_HOVER_MEDIA_QUERY)
    const update = () => setHasMobileInteraction(mediaQuery.matches)
    update()

    mediaQuery.addEventListener("change", update)
    return () => mediaQuery.removeEventListener("change", update)
  }, [])

  return hasMobileInteraction
}

export function isMobileHoverPointer({
  hasMobileInteraction = hasMobileHoverInteraction(),
  pointerType,
}: {
  hasMobileInteraction?: boolean
  pointerType: string
}) {
  if (pointerType === "mouse") return false
  if (pointerType === "touch") return true

  return hasMobileInteraction
}

export function isNestedInteractiveHoverTarget({
  currentTarget,
  target,
}: {
  currentTarget: EventTarget | null
  target: EventTarget | null
}) {
  if (!(target instanceof Element)) return false
  if (!(currentTarget instanceof Element)) return false

  const interactiveTarget = target.closest(INTERACTIVE_SELECTOR)
  return interactiveTarget !== null && interactiveTarget !== currentTarget
}

export function isMobileHoverSkipTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest(MOBILE_HOVER_SKIP_SELECTOR) !== null
}
export function shouldRevealMobileHover({
  canReveal = true,
  hasMobileInteraction,
  isInteractiveTarget = false,
  isRevealed,
  pointerType,
}: {
  canReveal?: boolean
  hasMobileInteraction?: boolean
  isInteractiveTarget?: boolean
  isRevealed: boolean
  pointerType: string
}) {
  return (
    canReveal &&
    !isRevealed &&
    !isInteractiveTarget &&
    isMobileHoverPointer({ hasMobileInteraction, pointerType })
  )
}

export function shouldSuppressMobileHoverClick({
  revealedByPointerDown,
}: {
  revealedByPointerDown: boolean
}) {
  return revealedByPointerDown
}

export function shouldClearMobileHoverReveal({
  isInsideTarget,
  isRevealed,
}: {
  isInsideTarget: boolean
  isRevealed: boolean
}) {
  return isRevealed && !isInsideTarget
}

type UseMobileHoverRevealOptions<T extends HTMLElement> = {
  canReveal?: boolean
  clearOnOutsidePointerDown?: boolean
  containerRef?: RefObject<T | null>
  isInteractiveTarget?: (target: EventTarget | null, currentTarget: EventTarget | null) => boolean
  isRevealed?: boolean
  onRevealChange?: (isRevealed: boolean) => void
}

export function useMobileHoverReveal<T extends HTMLElement>({
  canReveal = true,
  clearOnOutsidePointerDown = true,
  containerRef,
  isInteractiveTarget = (target, currentTarget) =>
    isNestedInteractiveHoverTarget({ currentTarget, target }) || isMobileHoverSkipTarget(target),
  isRevealed: controlledRevealed,
  onRevealChange,
}: UseMobileHoverRevealOptions<T> = {}) {
  const internalRef = useRef<T | null>(null)
  const [internalRevealed, setInternalRevealed] = useState(false)
  const revealedByPointerDownRef = useRef(false)
  const ref = containerRef ?? internalRef
  const isRevealed = controlledRevealed ?? internalRevealed

  const setRevealed = useCallback(
    (nextRevealed: boolean) => {
      if (controlledRevealed === undefined) setInternalRevealed(nextRevealed)
      onRevealChange?.(nextRevealed)
    },
    [controlledRevealed, onRevealChange],
  )

  useEffect(() => {
    if (!clearOnOutsidePointerDown || !isRevealed) return

    function closeOnOutsidePointerDown(event: globalThis.PointerEvent) {
      if (
        !shouldClearMobileHoverReveal({
          isInsideTarget: ref.current?.contains(event.target as Node | null) === true,
          isRevealed,
        })
      ) {
        return
      }

      setRevealed(false)
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true)
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true)
  }, [clearOnOutsidePointerDown, isRevealed, ref, setRevealed])

  const onPointerDown = useCallback(
    (event: PointerEvent<T>) => {
      revealedByPointerDownRef.current = false

      if (
        !shouldRevealMobileHover({
          canReveal,
          isInteractiveTarget: isInteractiveTarget(event.target, event.currentTarget),
          isRevealed,
          pointerType: event.pointerType,
        })
      ) {
        return false
      }

      revealedByPointerDownRef.current = true
      setRevealed(true)
      return true
    },
    [canReveal, isInteractiveTarget, isRevealed, setRevealed],
  )

  const suppressClickIfRevealed = useCallback((event: MouseEvent<HTMLElement>) => {
    if (
      !shouldSuppressMobileHoverClick({
        revealedByPointerDown: revealedByPointerDownRef.current,
      })
    ) {
      return false
    }

    revealedByPointerDownRef.current = false
    event.preventDefault()
    event.stopPropagation()
    return true
  }, [])

  const clearReveal = useCallback(() => {
    revealedByPointerDownRef.current = false
    setRevealed(false)
  }, [setRevealed])

  const clearRevealOnBlur = useCallback(
    (event: FocusEvent<T>) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
        return
      clearReveal()
    },
    [clearReveal],
  )

  return {
    clearReveal,
    clearRevealOnBlur,
    isRevealed,
    onPointerDown,
    ref,
    suppressClickIfRevealed,
  }
}

interface UseIsMobileReturn {
  isMobile: boolean
  isLoading: boolean
}

export const useIsMobile = (): UseIsMobileReturn => {
  const [isMobile, setIsMobile] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkIsMobile = () => {
      // Check using media query
      const mediaQuery = window.matchMedia("(max-width: 768px)")

      // Check using user agent (additional detection)
      const userAgent = navigator.userAgent.toLowerCase()
      const mobileKeywords = [
        "android",
        "webos",
        "iphone",
        "ipad",
        "ipod",
        "blackberry",
        "windows phone",
        "mobile",
      ]

      const isMobileUA = mobileKeywords.some((keyword) => userAgent.includes(keyword))

      // Combine both checks - prioritize media query but consider user agent
      const isMobileDevice = mediaQuery.matches || (isMobileUA && window.innerWidth <= 768)

      setIsMobile(isMobileDevice)
      setIsLoading(false)
    }

    // Initial check
    checkIsMobile()

    // Listen for media query changes
    const mediaQuery = window.matchMedia("(max-width: 768px)")
    const handleChange = () => checkIsMobile()

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange)
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange)
    }

    // Listen for window resize
    window.addEventListener("resize", checkIsMobile)

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleChange)
      } else {
        mediaQuery.removeListener(handleChange)
      }
      window.removeEventListener("resize", checkIsMobile)
    }
  }, [])

  return {
    isMobile,
    isLoading,
  }
}

export default useIsMobile
