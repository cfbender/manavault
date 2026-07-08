import { Check, X } from "lucide-react"
import { useEffect } from "react"

import { cn } from "../../lib/utils"
import type { DeckCustomTag } from "./deck-types"

const OUTER_RADIUS_PERCENT = 48
const HUB_RADIUS_PERCENT = 14

export function DeckCardTagRadial({
  open,
  tags,
  assignedTagIds,
  onToggleTag,
  onClose,
  anchorLabel,
  acceptDrop = true,
}: {
  open: boolean
  tags: DeckCustomTag[]
  assignedTagIds: string[]
  onToggleTag: (tagId: string) => void
  onClose: () => void
  anchorLabel?: string
  acceptDrop?: boolean
}) {
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
      className="absolute left-1/2 top-1/2 z-[140] h-44 w-44 -translate-x-1/2 -translate-y-1/2"
      role="group"
      aria-label={groupLabel}
    >
      <div className="absolute inset-0 rounded-full bg-base-300/85 backdrop-blur" />

      {tags.length > 0 ? (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
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
        </svg>
      ) : null}

      {tags.map((tag, index) => {
        const midDeg = index * sliceAngleDeg - 90
        const startDeg = midDeg - sliceAngleDeg / 2
        const endDeg = midDeg + sliceAngleDeg / 2
        const isAssigned = assignedTagIdSet.has(tag.id)
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
              "absolute inset-0 cursor-pointer border-0 p-0 transition-opacity",
              "hover:opacity-90 focus-visible:outline focus-visible:outline-2",
              "focus-visible:outline-offset-2 focus-visible:outline-primary",
            )}
            style={{
              clipPath: wedgeClipPath(startDeg, endDeg, tags.length),
              backgroundColor: tag.color,
              opacity: isAssigned ? 0.95 : 0.4,
            }}
            onClick={() => onToggleTag(tag.id)}
            onDragOver={(event) => {
              if (!acceptDrop) return
              event.preventDefault()
            }}
            onDrop={(event) => {
              if (!acceptDrop) return
              event.preventDefault()
              onToggleTag(tag.id)
            }}
          >
            <span
              className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
              style={{ left: `${labelLeftPercent}%`, top: `${labelTopPercent}%` }}
            >
              {isAssigned ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-white drop-shadow" aria-hidden="true" />
              ) : null}
              <span className="block max-w-[3.25rem] truncate text-[0.65rem] font-semibold text-white drop-shadow">
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
}

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
