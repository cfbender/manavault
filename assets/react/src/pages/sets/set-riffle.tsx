import { useDrag } from "@use-gesture/react"
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react"
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"
import { useArtPalette } from "../../lib/art-colors"
import { useCardTilt } from "../../lib/card-tilt"
import { cn } from "../../lib/utils"
import type { SetSection } from "./set-sections"

export type RifflePrinting = {
  scryfallId: string
  collectorNumber?: string | null
  imageUrl?: string | null
  largeImageUrl?: string | null
  artCropUrl?: string | null
  finishes?: readonly (string | null)[] | null
  card?: { name?: string | null } | null
}

export type RiffleItem<P extends RifflePrinting> =
  | { kind: "card"; key: string; printing: P; sectionIndex: number }
  | { kind: "divider"; key: string; sectionIndex: number }

/** Cards standing behind the front one that are drawn. */
const BEHIND = 9
/** Each card behind stands this much (% of card height) above the one in front. */
const PEEK = 7.5
/** And this much further back. */
const DEPTH = 34
const WHEEL_STEP = 56
const DRAG_STEP = 64
const SPRING = { type: "spring", stiffness: 230, damping: 30, mass: 0.9 } as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

// A card `d` places from the front: behind it (d > 0) cards stand in a row,
// each a little higher and further back; the front card (d in (-1, 0)) tips
// over toward the viewer as it is flipped past, around its bottom edge.
function slotTransform(d: number) {
  if (d < 0) {
    const t = clamp(-d, 0, 1.2)
    return `translateX(-50%) translateY(${t * 6}%) translateZ(${t * 40}px) rotateX(${-t * 86}deg)`
  }
  const lean = Math.min(d, 1) * 7
  return `translateX(-50%) translateY(${-d * PEEK}%) translateZ(${-d * DEPTH}px) rotateX(${lean}deg)`
}

function slotOpacity(d: number) {
  if (d < 0) return clamp(1 - (-d - 0.5) / 0.4, 0, 1)
  return clamp(BEHIND - d, 0, 1)
}

function slotShade(d: number) {
  return d <= 0 ? 0 : Math.min(0.12 + d * 0.085, 0.72)
}

function RiffleSlot({
  children,
  index,
  label,
  onActivate,
  position,
}: {
  children: ReactNode
  index: number
  label: string
  onActivate: () => void
  position: MotionValue<number>
}) {
  const transform = useTransform(position, (p) => slotTransform(index - p))
  const opacity = useTransform(position, (p) => slotOpacity(index - p))
  const zIndex = useTransform(position, (p) => 1000 - Math.round((index - p) * 10))
  const shade = useTransform(position, (p) => slotShade(index - p))
  const pointerEvents = useTransform(position, (p) => (index - p < -0.4 ? "none" : "auto"))

  return (
    <motion.div
      className="riffle-slot"
      style={{ transform, opacity, zIndex, pointerEvents }}
      aria-label={label}
      onClick={onActivate}
    >
      {children}
      <motion.span className="riffle-shade" style={{ opacity: shade }} aria-hidden="true" />
    </motion.div>
  )
}

function RiffleCardFace({ front, printing }: { front: boolean; printing: RifflePrinting }) {
  const tiltRef = useCardTilt<HTMLDivElement>()
  const finishes = (printing.finishes || []).filter(Boolean)
  const foilOnly = finishes.length > 0 && finishes.every((finish) => finish !== "nonfoil")
  const etched = foilOnly && finishes.every((finish) => finish === "etched")
  const name = printing.card?.name || "Card"
  const imageUrl = printing.largeImageUrl || printing.imageUrl

  return (
    <div
      ref={front ? tiltRef : undefined}
      className={cn("riffle-card group/card", front && "card-tilt", foilOnly && "card-tile-foil")}
      data-card-morph-key={front ? printing.scryfallId : undefined}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" draggable={false} decoding="async" />
      ) : (
        <div className="riffle-card--missing h-full">{name}</div>
      )}
      {foilOnly ? (
        <span
          className={cn("card-tile-foil-overlay", etched && "card-tile-foil-overlay--etched")}
        />
      ) : null}
    </div>
  )
}

function RiffleDividerFace<P>({
  section,
  sectionCount,
  sectionIndex,
}: {
  section: SetSection<P>
  sectionCount: number
  sectionIndex: number
}) {
  const tabOffset = `${6 + ((sectionIndex * 23) % 40)}%`
  return (
    <div className="riffle-divider" style={{ "--tab-offset": tabOffset } as CSSProperties}>
      <span className="riffle-divider__tab">
        <span>{section.label}</span>
        <span className="font-mono opacity-60">{section.printings.length}</span>
      </span>
      <div className="riffle-divider__face">
        <p className="text-xs font-bold uppercase tracking-wide text-base-content/60">
          Section {sectionIndex + 1} of {sectionCount}
        </p>
        <p className="text-balance text-[clamp(1rem,5.5cqh,2rem)] font-black leading-tight">
          {section.label}
        </p>
        <p className="font-mono text-xs text-base-content/70">
          {section.printings.length} {section.printings.length === 1 ? "card" : "cards"}
        </p>
      </div>
    </div>
  )
}

/**
 * The set's cards standing in a row, front to back, to flip through: scroll,
 * drag, swipe, arrow keys, or the scrubber move through them, and each card
 * passed tips over toward the viewer. Dividers mark treatment sections.
 * `index` is controlled; the stack springs to it.
 */
export function SetRiffle<P extends RifflePrinting>({
  index,
  items,
  label,
  onIndexChange,
  onOpen,
  sections,
}: {
  index: number
  items: readonly RiffleItem<P>[]
  label: string
  onIndexChange: (index: number) => void
  onOpen: (printing: P, element: HTMLElement | null) => void
  sections: readonly SetSection<P>[]
}) {
  const reduceMotion = useReducedMotion()
  const position = useMotionValue(index)
  const stageRef = useRef<HTMLDivElement>(null)
  const targetRef = useRef(index)
  const draggingRef = useRef(false)
  const draggedAtRef = useRef(0)
  const last = items.length - 1
  const front = items[index]
  const frontPrinting = front?.kind === "card" ? front.printing : null
  const palette = useArtPalette(frontPrinting?.artCropUrl || frontPrinting?.imageUrl)

  // Keep the latest values for the wheel listener, which is bound once.
  const latest = useRef({ last, onIndexChange })
  latest.current = { last, onIndexChange }

  useEffect(() => {
    targetRef.current = index
    if (draggingRef.current) return
    if (reduceMotion) {
      position.set(index)
      return
    }
    const controls = animate(position, index, SPRING)
    return () => controls.stop()
  }, [index, position, reduceMotion])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let accumulated = 0

    function handleWheel(event: WheelEvent) {
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      const scale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 400 : 1
      const step = Math.sign(delta)
      const target = targetRef.current
      // At either end the page scrolls on.
      if (!step || (step < 0 && target <= 0) || (step > 0 && target >= latest.current.last)) {
        accumulated = 0
        return
      }
      event.preventDefault()
      if (Math.sign(accumulated) !== step) accumulated = 0
      accumulated += delta * scale
      const steps = Math.trunc(accumulated / WHEEL_STEP)
      if (!steps) return
      accumulated -= steps * WHEEL_STEP
      const next = clamp(target + steps, 0, latest.current.last)
      targetRef.current = next
      latest.current.onIndexChange(next)
    }

    stage.addEventListener("wheel", handleWheel, { passive: false })
    return () => stage.removeEventListener("wheel", handleWheel)
  }, [])

  const bindDrag = useDrag(
    ({ active, event, last: released, memo, movement: [mx, my], tap, velocity, direction }) => {
      const start = memo ?? position.get()
      if (tap) return start
      // Pull the front card toward you (drag down) or swipe it aside. Touch
      // only swipes sideways, so the page still scrolls vertically.
      const touch = "pointerType" in event && event.pointerType === "touch"
      const delta = ((touch ? 0 : my) - mx) / DRAG_STEP
      if (active) {
        draggingRef.current = true
        const next = clamp(start + delta, -0.45, last + 0.45)
        position.set(next)
        const rounded = clamp(Math.round(next), 0, last)
        if (rounded !== targetRef.current) {
          targetRef.current = rounded
          onIndexChange(rounded)
        }
      }
      if (released) {
        draggingRef.current = false
        draggedAtRef.current = performance.now()
        const flick = clamp(
          ((touch ? 0 : velocity[1] * direction[1]) - velocity[0] * direction[0]) * 3,
          -12,
          12,
        )
        const target = clamp(Math.round(start + delta + flick), 0, last)
        targetRef.current = target
        onIndexChange(target)
        if (reduceMotion) position.set(target)
        else animate(position, target, SPRING)
      }
      return start
    },
    { filterTaps: true, threshold: 4 },
  )

  function move(step: number) {
    const next = clamp(targetRef.current + step, 0, last)
    targetRef.current = next
    onIndexChange(next)
  }

  function activate(itemIndex: number, element: HTMLElement | null) {
    // A drag ends with a click on whatever card is under the pointer.
    if (performance.now() - draggedAtRef.current < 300) return
    const item = items[itemIndex]
    if (itemIndex !== targetRef.current) {
      move(itemIndex - targetRef.current)
      return
    }
    if (item?.kind === "card") onOpen(item.printing, element)
    else move(1)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      PageDown: 10,
      PageUp: -10,
      Home: -Infinity,
      End: Infinity,
    }
    if (event.key in steps) {
      event.preventDefault()
      const step = steps[event.key]
      move(Number.isFinite(step) ? step : step > 0 ? last : -last)
      return
    }
    if ((event.key === "Enter" || event.key === " ") && front?.kind === "card") {
      event.preventDefault()
      activate(index, stageRef.current?.querySelector<HTMLElement>("[data-card-morph-key]") ?? null)
    }
  }

  const from = Math.max(0, index - 2)
  const to = Math.min(last, index + BEHIND + 1)
  const visible = items.slice(from, to + 1)
  const ambient = palette
    ? ({
        "--art-primary": `rgb(${palette.primary})`,
        "--art-secondary": `rgb(${palette.secondary})`,
      } as CSSProperties)
    : undefined

  return (
    <div
      ref={stageRef}
      {...bindDrag()}
      className="riffle-stage rounded-box border border-base-300"
      data-art={palette ? "" : undefined}
      style={ambient}
      tabIndex={0}
      role="group"
      aria-roledescription="card stack"
      aria-label={label}
      onKeyDown={handleKeyDown}
    >
      <div className="riffle-floor">
        {visible.map((item, offset) => {
          const itemIndex = from + offset
          const section = sections[item.sectionIndex]
          const itemLabel =
            item.kind === "card"
              ? `${item.printing.card?.name || "Card"}${
                  item.printing.collectorNumber ? ` #${item.printing.collectorNumber}` : ""
                }`
              : `${section?.label ?? "Section"} divider`
          return (
            <RiffleSlot
              key={item.key}
              index={itemIndex}
              label={itemLabel}
              position={position}
              onActivate={() =>
                activate(
                  itemIndex,
                  stageRef.current?.querySelector<HTMLElement>(
                    item.kind === "card"
                      ? `[data-card-morph-key="${CSS.escape(item.printing.scryfallId)}"]`
                      : "[data-card-morph-key]",
                  ) ?? null,
                )
              }
            >
              {item.kind === "card" ? (
                <RiffleCardFace front={itemIndex === index} printing={item.printing} />
              ) : section ? (
                <RiffleDividerFace
                  section={section}
                  sectionCount={sections.length}
                  sectionIndex={item.sectionIndex}
                />
              ) : null}
            </RiffleSlot>
          )
        })}
      </div>
    </div>
  )
}
