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
export const MOBILE_HOVER_MOVE_THRESHOLD_PX = 8

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

export function didMobileHoverPointerMove({
  currentX,
  currentY,
  startX,
  startY,
  threshold = MOBILE_HOVER_MOVE_THRESHOLD_PX,
}: {
  currentX: number
  currentY: number
  startX: number
  startY: number
  threshold?: number
}) {
  return Math.hypot(currentX - startX, currentY - startY) > threshold
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
  deferRevealUntilPointerUp?: boolean
  isInteractiveTarget?: (target: EventTarget | null, currentTarget: EventTarget | null) => boolean
  isRevealed?: boolean
  onRevealChange?: (isRevealed: boolean) => void
}

export function useMobileHoverReveal<T extends HTMLElement>({
  canReveal = true,
  clearOnOutsidePointerDown = true,
  containerRef,
  deferRevealUntilPointerUp = false,
  isInteractiveTarget = (target, currentTarget) =>
    isNestedInteractiveHoverTarget({ currentTarget, target }) || isMobileHoverSkipTarget(target),
  isRevealed: controlledRevealed,
  onRevealChange,
}: UseMobileHoverRevealOptions<T> = {}) {
  const internalRef = useRef<T | null>(null)
  const [internalRevealed, setInternalRevealed] = useState(false)
  const revealedByPointerDownRef = useRef(false)
  const pendingRevealRef = useRef<{
    moved: boolean
    pointerId: number
    startX: number
    startY: number
  } | null>(null)
  const suppressClickTimeoutRef = useRef<number | null>(null)
  const ref = containerRef ?? internalRef
  const isRevealed = controlledRevealed ?? internalRevealed

  const clearSuppressClickTimeout = useCallback(() => {
    if (suppressClickTimeoutRef.current === null) return
    window.clearTimeout(suppressClickTimeoutRef.current)
    suppressClickTimeoutRef.current = null
  }, [])

  useEffect(() => clearSuppressClickTimeout, [clearSuppressClickTimeout])

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
      clearSuppressClickTimeout()
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

      if (deferRevealUntilPointerUp) {
        pendingRevealRef.current = {
          moved: false,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
        }
        return true
      }

      revealedByPointerDownRef.current = true
      setRevealed(true)
      return true
    },
    [
      canReveal,
      clearSuppressClickTimeout,
      deferRevealUntilPointerUp,
      isInteractiveTarget,
      isRevealed,
      setRevealed,
    ],
  )

  const onPointerMove = useCallback((event: PointerEvent<T>) => {
    const pendingReveal = pendingRevealRef.current
    if (!pendingReveal || pendingReveal.pointerId !== event.pointerId) return

    if (
      didMobileHoverPointerMove({
        currentX: event.clientX,
        currentY: event.clientY,
        startX: pendingReveal.startX,
        startY: pendingReveal.startY,
      })
    ) {
      pendingReveal.moved = true
    }
  }, [])

  const onPointerUp = useCallback(
    (event: PointerEvent<T>) => {
      const pendingReveal = pendingRevealRef.current
      if (!pendingReveal || pendingReveal.pointerId !== event.pointerId) return false

      pendingRevealRef.current = null

      if (pendingReveal.moved) {
        revealedByPointerDownRef.current = true
        suppressClickTimeoutRef.current = window.setTimeout(() => {
          revealedByPointerDownRef.current = false
          suppressClickTimeoutRef.current = null
        }, 0)
        return false
      }

      revealedByPointerDownRef.current = true
      setRevealed(true)
      return true
    },
    [setRevealed],
  )

  const onPointerCancel = useCallback((event: PointerEvent<T>) => {
    if (pendingRevealRef.current?.pointerId === event.pointerId) {
      pendingRevealRef.current = null
      revealedByPointerDownRef.current = false
    }
  }, [])

  const suppressClickIfRevealed = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (
        !shouldSuppressMobileHoverClick({
          revealedByPointerDown: revealedByPointerDownRef.current,
        })
      ) {
        return false
      }

      clearSuppressClickTimeout()
      revealedByPointerDownRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return true
    },
    [clearSuppressClickTimeout],
  )

  const clearReveal = useCallback(() => {
    clearSuppressClickTimeout()
    pendingRevealRef.current = null
    revealedByPointerDownRef.current = false
    setRevealed(false)
  }, [clearSuppressClickTimeout, setRevealed])

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
    onPointerCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
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
