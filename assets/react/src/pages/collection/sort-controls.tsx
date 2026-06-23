import { ArrowDownUp } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { SORT_OPTIONS } from "./constants"
import type { CollectionSort } from "./types"

export function SortDropdown({
  onSortChange,
  sort,
}: {
  onSortChange: (sort: CollectionSort) => void
  sort: CollectionSort
}) {
  const currentOption =
    SORT_OPTIONS.find((option) => option.field === sort.field) || SORT_OPTIONS[1]
  const directionLabel = sort.direction === "asc" ? "Asc" : "Desc"
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeOnOutsideClick)
  }, [open])

  return (
    <div ref={ref} className="dropdown dropdown-end">
      <button
        type="button"
        className="btn btn-outline min-w-44 justify-between gap-2"
        aria-label={`Sort by ${currentOption.label}, ${directionLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex items-center gap-2">
          <ArrowDownUp className="h-4 w-4" />
          Sort
        </span>
        <span className="flex items-center gap-1">
          <span className="badge badge-ghost text-[0.65rem]">{currentOption.label}</span>
          <span className="badge badge-ghost text-[0.65rem]">{directionLabel}</span>
        </span>
      </button>
      {open ? (
        <div className="dropdown-content z-50 mt-2 w-72 rounded-box border border-base-300 bg-base-100 p-3 shadow-2xl">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-box bg-base-200 p-1">
            {(["asc", "desc"] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                className={[
                  "rounded-btn px-3 py-2 text-sm font-bold transition-colors",
                  sort.direction === direction
                    ? "bg-primary text-primary-content shadow-sm"
                    : "text-base-content/70 hover:bg-base-100",
                ].join(" ")}
                onClick={() => {
                  onSortChange({ ...sort, direction })
                  setOpen(false)
                }}
              >
                {direction === "asc" ? "Ascending" : "Descending"}
              </button>
            ))}
          </div>

          <div className="grid gap-1">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.field}
                type="button"
                className={[
                  "flex items-center justify-between rounded-btn px-3 py-2 text-left text-sm transition-colors",
                  sort.field === option.field ? "bg-primary/15 text-primary" : "hover:bg-base-200",
                ].join(" ")}
                onClick={() => {
                  onSortChange({ ...sort, field: option.field })
                  setOpen(false)
                }}
              >
                <span className="font-semibold">{option.label}</span>
                {sort.field === option.field ? (
                  <span className="badge badge-primary badge-sm">{directionLabel}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function CollectionTabButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean
  count: number
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={[
        "relative flex items-center gap-2 px-4 pb-3 pt-1 text-sm font-bold transition-colors",
        active ? "text-primary" : "text-base-content/60 hover:text-base-content",
      ].join(" ")}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={active ? "badge badge-primary badge-sm" : "badge badge-ghost badge-sm"}>
        {count}
      </span>
      {active ? (
        <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-primary" />
      ) : null}
    </button>
  )
}
