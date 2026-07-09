import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react"

// Single, app-wide source of truth for card sizing. Every card surface (search
// grids, collection grid, deck stack) derives its geometry from one width so the
// floating size slider changes them all at once. Persisted and reactive: updating
// the width re-renders every consumer immediately, and the `storage` event keeps
// other tabs in sync.

const REM_PX = 16
// Magic cards are 63x88mm -> a 5:7 face aspect (height / width).
const CARD_ASPECT = 7 / 5
// How far each stacked card peeks below the one above it, as a fraction of card
// height (preserves the original 34px offset at the original 314px height).
const STACK_OFFSET_RATIO = 34 / 314
// Extra vertical room a grid row needs beyond the card face (name/meta/gap).
const GRID_ROW_EXTRA_PX = 38

export const CARD_WIDTH_MIN_REM = 10
export const CARD_WIDTH_MAX_REM = 26
export const CARD_WIDTH_STEP_REM = 0.5
export const CARD_WIDTH_DEFAULT_REM = 20

const STORAGE_KEY = "manavault:cardWidthRem"

export type CardSize = {
  /** Card width in rem (the single knob everything derives from). */
  widthRem: number
  /** Card width in px. */
  widthPx: number
  /** Card face height in px (5:7 aspect). */
  heightPx: number
  /** Vertical peek between stacked cards, in px. */
  offsetPx: number
  /** How far a revealed stack card slides its followers down, in px. */
  revealOffsetPx: number
  /** Height budget for one grid row (card face + label/meta), in px. */
  rowHeightPx: number
}

export function cardSizeFromWidthRem(widthRem: number): CardSize {
  const widthPx = Math.round(widthRem * REM_PX)
  const heightPx = Math.round(widthPx * CARD_ASPECT)
  const offsetPx = Math.round(heightPx * STACK_OFFSET_RATIO)
  return {
    widthRem,
    widthPx,
    heightPx,
    offsetPx,
    revealOffsetPx: heightPx - offsetPx,
    rowHeightPx: heightPx + GRID_ROW_EXTRA_PX,
  }
}

function clampWidthRem(widthRem: number) {
  if (!Number.isFinite(widthRem)) return CARD_WIDTH_DEFAULT_REM
  return Math.min(CARD_WIDTH_MAX_REM, Math.max(CARD_WIDTH_MIN_REM, widthRem))
}

function storedWidthRem(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return CARD_WIDTH_DEFAULT_REM
    return clampWidthRem(Number.parseFloat(raw))
  } catch {
    return CARD_WIDTH_DEFAULT_REM
  }
}

function persistWidthRem(widthRem: number) {
  try {
    if (widthRem === CARD_WIDTH_DEFAULT_REM) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(widthRem))
  } catch {
    // Storage can be unavailable, disabled, or full. In-memory state still works.
  }
}

type CardSizeContextValue = {
  widthRem: number
  setWidthRem: (widthRem: number) => void
  resetWidthRem: () => void
}

const CardSizeContext = createContext<CardSizeContextValue | null>(null)

export function CardSizeProvider({ children }: { children: ReactNode }) {
  const [widthRem, setWidthRemState] = useState<number>(() =>
    typeof window === "undefined" ? CARD_WIDTH_DEFAULT_REM : storedWidthRem(),
  )

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) setWidthRemState(storedWidthRem())
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  const value = useMemo<CardSizeContextValue>(() => {
    function setWidthRem(next: number) {
      const clamped = clampWidthRem(next)
      setWidthRemState(clamped)
      persistWidthRem(clamped)
    }
    return {
      widthRem,
      setWidthRem,
      resetWidthRem: () => setWidthRem(CARD_WIDTH_DEFAULT_REM),
    }
  }, [widthRem])

  return <CardSizeContext.Provider value={value}>{children}</CardSizeContext.Provider>
}

/** Reactive card geometry derived from the current app-wide width. */
export function useCardSize(): CardSize {
  const context = useContext(CardSizeContext)
  const widthRem = context?.widthRem ?? CARD_WIDTH_DEFAULT_REM
  return useMemo(() => cardSizeFromWidthRem(widthRem), [widthRem])
}

/** Slider control surface: current width plus setters. */
export function useCardSizeControl(): CardSizeContextValue {
  const context = useContext(CardSizeContext)
  if (!context) throw new Error("useCardSizeControl must be used inside CardSizeProvider")
  return context
}
