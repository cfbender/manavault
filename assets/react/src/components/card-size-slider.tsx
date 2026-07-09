import { RotateCcw, SlidersHorizontal, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import {
  CARD_WIDTH_MAX_REM,
  CARD_WIDTH_MIN_REM,
  CARD_WIDTH_STEP_REM,
  useCardSizeControl,
} from "../lib/card-size"
import { cn } from "../lib/utils"

/** Floating, app-wide control for the shared card-size context. Collapsed to a
 * compact pill button; expands into a small panel with a range slider and a
 * reset action. Self-contained — no props, mount it once per card-bearing route. */
export function CardSizeSlider() {
  const { widthRem, setWidthRem, resetWidthRem } = useCardSizeControl()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <div ref={ref} className="fixed bottom-4 left-4 z-40">
      {open ? (
        <div className="flex w-64 flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-base-content/85">
              <SlidersHorizontal className="h-4 w-4" />
              Card size
            </span>
            <button
              type="button"
              aria-label="Close card size panel"
              className="btn btn-ghost btn-xs btn-circle"
              onClick={() => setOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              aria-label="Card size"
              min={CARD_WIDTH_MIN_REM}
              max={CARD_WIDTH_MAX_REM}
              step={CARD_WIDTH_STEP_REM}
              value={widthRem}
              onChange={(event) => setWidthRem(Number.parseFloat(event.target.value))}
              className="range range-primary range-sm flex-1"
            />
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-base-content/70">
              {widthRem}rem
            </span>
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm gap-2 self-start"
            onClick={resetWidthRem}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label="Adjust card size"
          className={cn(
            "btn btn-circle btn-primary shadow-lg",
            "border border-primary/40 text-primary-content",
          )}
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
