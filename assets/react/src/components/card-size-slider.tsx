import { RotateCcw, SlidersHorizontal, X } from "lucide-react"
import {
  CARD_WIDTH_MAX_REM,
  CARD_WIDTH_MIN_REM,
  CARD_WIDTH_STEP_REM,
  useCardSizeControl,
} from "../lib/card-size"
import { cn } from "../lib/utils"
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "./ui/popover"

/** Floating, app-wide control for the shared card-size context. Collapsed to a
 * compact pill button; expands into a small panel with a range slider and a
 * reset action. Self-contained — no props, mount it once per card-bearing route. */
export function CardSizeSlider() {
  const { widthRem, setWidthRem, resetWidthRem } = useCardSizeControl()

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Adjust card size"
            className={cn(
              "btn btn-circle btn-primary shadow-lg",
              "border border-primary/40 text-primary-content",
            )}
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="flex w-64 flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-base-content/85">
              <SlidersHorizontal className="h-4 w-4" />
              Card size
            </span>
            <PopoverClose asChild>
              <button
                type="button"
                aria-label="Close card size panel"
                className="btn btn-ghost btn-xs btn-circle"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </PopoverClose>
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
        </PopoverContent>
      </Popover>
    </div>
  )
}
