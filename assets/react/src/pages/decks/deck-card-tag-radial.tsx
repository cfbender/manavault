import { Check, X } from "lucide-react"
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"

import { cn } from "../../lib/utils"
import type { DeckCustomTag } from "./deck-types"

const OUTER_RADIUS_PERCENT = 48
const HUB_RADIUS_PERCENT = 14

export type DeckCardTagRadialHandle = {
  hitTest(clientX: number, clientY: number): string | null
}

export const DeckCardTagRadial = forwardRef<
  DeckCardTagRadialHandle,
  {
    open: boolean
    tags: DeckCustomTag[]
    assignedTagIds: string[]
    onToggleTag: (tagId: string) => void
    onClose: () => void
    anchorLabel?: string
    highlightedTagId?: string | null
  }
>(function DeckCardTagRadial(
  { open, tags, assignedTagIds, onToggleTag, onClose, anchorLabel, highlightedTagId = null },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(
    ref,
    () => ({
      hitTest(clientX: number, clientY: number): string | null {
        const container = containerRef.current
        if (!container || tags.length === 0) return null

        const rect = container.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return null

        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const dx = clientX - centerX
        const dy = clientY - centerY
        const radiusPercent = (Math.hypot(dx, dy) / rect.width) * 100
        if (radiusPercent < HUB_RADIUS_PERCENT || radiusPercent > OUTER_RADIUS_PERCENT) return null

        const sliceAngleDeg = 360 / tags.length
        const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
        const relativeDeg = (((angleDeg + 90) % 360) + 360) % 360
        const index = Math.round(relativeDeg / sliceAngleDeg) % tags.length
        return tags[index]?.id ?? null
      },
    }),
    [tags],
  )

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const assignedTagIdSet = new Set(assignedTagIds)
  const sliceAngleDeg = tags.length > 0 ? 360 / tags.length : 0
  const groupLabel = anchorLabel ? `${anchorLabel} custom tags` : "Custom tags"

  return (
    <div
      ref={containerRef}
      className="absolute left-1/2 top-1/2 z-[140] h-44 w-44 -translate-x-1/2 -translate-y-1/2"
      role="group"
      aria-label={groupLabel}
    >
      <div className="absolute inset-0 rounded-full bg-base-300/85 backdrop-blur" />

      {tags.length > 0 ? (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
          <circle
            cx={50}
            cy={50}
            r={OUTER_RADIUS_PERCENT}
            className="fill-none stroke-base-content/15"
            strokeWidth={0.5}
          />
          {tags.length > 1
            ? tags.map((tag, index) => {
                const boundaryDeg = index * sliceAngleDeg - 90 - sliceAngleDeg / 2
                const rad = (boundaryDeg * Math.PI) / 180
                return (
                  <line
                    key={tag.id}
                    x1={50 + HUB_RADIUS_PERCENT * Math.cos(rad)}
                    y1={50 + HUB_RADIUS_PERCENT * Math.sin(rad)}
                    x2={50 + OUTER_RADIUS_PERCENT * Math.cos(rad)}
                    y2={50 + OUTER_RADIUS_PERCENT * Math.sin(rad)}
                    className="stroke-base-content/15"
                    strokeWidth={0.5}
                  />
                )
              })
            : null}
          {tags.map((tag, index) => {
            const midDeg = index * sliceAngleDeg - 90
            const startDeg = midDeg - sliceAngleDeg / 2
            const endDeg = midDeg + sliceAngleDeg / 2
            const isAssigned = assignedTagIdSet.has(tag.id)
            const isHighlighted = highlightedTagId === tag.id
            return (
              <path
                key={tag.id}
                d={arcPath(startDeg, endDeg, OUTER_RADIUS_PERCENT, tags.length)}
                fill="none"
                stroke={tag.color}
                strokeWidth={isHighlighted ? 3.5 : isAssigned ? 2.5 : 1.5}
                strokeLinecap="round"
                opacity={isHighlighted || isAssigned ? 1 : 0.75}
              />
            )
          })}
        </svg>
      ) : null}

      {tags.map((tag, index) => {
        const midDeg = index * sliceAngleDeg - 90
        const startDeg = midDeg - sliceAngleDeg / 2
        const endDeg = midDeg + sliceAngleDeg / 2
        const isAssigned = assignedTagIdSet.has(tag.id)
        const isHighlighted = highlightedTagId === tag.id
        const midRad = (midDeg * Math.PI) / 180
        const labelRadiusPercent = (HUB_RADIUS_PERCENT + OUTER_RADIUS_PERCENT) / 2
        const labelLeftPercent = 50 + labelRadiusPercent * Math.cos(midRad)
        const labelTopPercent = 50 + labelRadiusPercent * Math.sin(midRad)

        return (
          <button
            key={tag.id}
            type="button"
            aria-label={`${isAssigned ? "Remove" : "Add"} ${tag.name} tag`}
            className={cn(
              "absolute inset-0 cursor-pointer border-0 p-0 transition-colors",
              "focus-visible:outline focus-visible:outline-2",
              "focus-visible:outline-offset-2 focus-visible:outline-primary",
            )}
            style={{
              clipPath: wedgeClipPath(startDeg, endDeg, tags.length),
              backgroundColor: isHighlighted
                ? "rgba(255, 255, 255, 0.12)"
                : isAssigned
                  ? "rgba(255, 255, 255, 0.06)"
                  : "transparent",
            }}
            onClick={() => onToggleTag(tag.id)}
          >
            <span
              className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
              style={{ left: `${labelLeftPercent}%`, top: `${labelTopPercent}%` }}
            >
              {isAssigned ? (
                <Check
                  className="h-3.5 w-3.5 shrink-0 text-base-content drop-shadow"
                  aria-hidden="true"
                />
              ) : null}
              <span
                className={cn(
                  "block max-w-[3.25rem] truncate text-[0.65rem] font-semibold drop-shadow",
                  isAssigned || isHighlighted ? "text-base-content" : "text-base-content/70",
                )}
              >
                {tag.name}
              </span>
            </span>
          </button>
        )
      })}

      <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        {tags.length === 0 ? (
          <p className="pointer-events-none max-w-[7rem] px-2 text-center text-[0.7rem] leading-snug text-base-content/70">
            No tags yet — add one in the sidebar
          </p>
        ) : null}
        <button
          type="button"
          aria-label="Close tag menu"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-base-100 text-base-content shadow-lg ring-1 ring-base-content/10 hover:bg-base-200"
          onClick={onClose}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
})

function wedgeClipPath(startDeg: number, endDeg: number, tagCount: number): string {
  if (tagCount <= 1) return `circle(${OUTER_RADIUS_PERCENT}% at 50% 50%)`

  const steps = Math.max(2, Math.ceil((endDeg - startDeg) / 12))
  const points: Array<[number, number]> = [[50, 50]]
  for (let step = 0; step <= steps; step++) {
    const deg = startDeg + ((endDeg - startDeg) * step) / steps
    const rad = (deg * Math.PI) / 180
    points.push([
      50 + OUTER_RADIUS_PERCENT * Math.cos(rad),
      50 + OUTER_RADIUS_PERCENT * Math.sin(rad),
    ])
  }

  return `polygon(${points.map(([x, y]) => `${x}% ${y}%`).join(", ")})`
}

function arcPath(startDeg: number, endDeg: number, radius: number, tagCount: number): string {
  if (tagCount <= 1) {
    return [
      `M ${50 - radius} 50`,
      `A ${radius} ${radius} 0 1 1 ${50 + radius} 50`,
      `A ${radius} ${radius} 0 1 1 ${50 - radius} 50`,
    ].join(" ")
  }

  const startRad = (startDeg * Math.PI) / 180
  const endRad = (endDeg * Math.PI) / 180
  const x1 = 50 + radius * Math.cos(startRad)
  const y1 = 50 + radius * Math.sin(startRad)
  const x2 = 50 + radius * Math.cos(endRad)
  const y2 = 50 + radius * Math.sin(endRad)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`
}
