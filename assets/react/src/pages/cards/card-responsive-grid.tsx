import { useEffect, useRef, useState, type ReactNode } from "react"
import { CARD_WIDTH_DEFAULT_REM, useCardSize } from "../../lib/card-size"

const GRID_GAP_PX = 24

/** A card grid that fits three default-sized columns into split-screen widths. */
export function ResponsiveCardGrid({ children }: { children: ReactNode }) {
  const size = useCardSize()
  const containerRef = useRef<HTMLDivElement>(null)
  const [cardWidthPx, setCardWidthPx] = useState(size.widthPx)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateCardWidth = () => {
      const width = container.getBoundingClientRect().width
      const responsiveScale = size.widthRem / CARD_WIDTH_DEFAULT_REM
      const splitScreenWidth = Math.max(
        256 * responsiveScale,
        ((width - 2 * GRID_GAP_PX) / 3) * responsiveScale,
      )
      const columnTarget = Math.min(size.widthPx, splitScreenWidth)
      const columns = Math.max(1, Math.floor((width + GRID_GAP_PX) / (columnTarget + GRID_GAP_PX)))
      setCardWidthPx(
        width > 0
          ? Math.min(size.widthPx, (width - (columns - 1) * GRID_GAP_PX) / columns)
          : size.widthPx,
      )
    }

    updateCardWidth()
    const observer = new ResizeObserver(updateCardWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [size.widthPx, size.widthRem])

  return (
    <div
      ref={containerRef}
      className="grid justify-center gap-x-6 gap-y-8"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${cardWidthPx}px, 100%), ${cardWidthPx}px))`,
      }}
    >
      {children}
    </div>
  )
}
