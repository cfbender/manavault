import { ArrowDownUp } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export type SortDirection = "asc" | "desc"

export type SortState<F extends string = string> = {
  field: F
  direction: SortDirection
}

export type SortOption<F extends string = string> = {
  field: F
  label: string
}

export function SortDropdown<F extends string>({
  onSortChange,
  options,
  sort,
}: {
  onSortChange: (sort: SortState<F>) => void
  options: SortOption<F>[]
  sort: SortState<F>
}) {
  const currentOption = options.find((option) => option.field === sort.field) || options[0]
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
            {options.map((option) => (
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
