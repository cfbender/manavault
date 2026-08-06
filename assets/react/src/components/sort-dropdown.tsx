import { ArrowDownUp } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="btn btn-outline min-w-44 justify-between gap-2"
          aria-label={`Sort by ${currentOption.label}, ${directionLabel}`}
        >
          <span className="flex items-center gap-2">
            <ArrowDownUp className="h-4 w-4" />
            Sort
          </span>
          <span className="flex items-center gap-1">
            <span className="badge badge-ghost text-xs">{currentOption.label}</span>
            <span className="badge badge-ghost text-xs">{directionLabel}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={16}
        sideOffset={8}
        className="w-[min(18rem,calc(100vw-2rem))] p-3 shadow-2xl"
      >
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-box bg-base-200 p-1">
          {(["asc", "desc"] as const).map((direction) => (
            <DropdownMenuItem
              asChild
              key={direction}
              className={[
                "justify-center rounded-btn px-3 py-2 text-sm font-bold transition-colors",
                sort.direction === direction
                  ? "bg-primary text-primary-content shadow-sm"
                  : "text-base-content/70 hover:bg-base-100",
              ].join(" ")}
              onSelect={() => onSortChange({ ...sort, direction })}
            >
              <button type="button">{direction === "asc" ? "Ascending" : "Descending"}</button>
            </DropdownMenuItem>
          ))}
        </div>

        <div className="grid gap-1">
          {options.map((option) => (
            <DropdownMenuItem
              asChild
              key={option.field}
              className={[
                "flex items-center justify-between rounded-btn px-3 py-2 text-left text-sm transition-colors",
                sort.field === option.field ? "bg-primary/15 text-primary" : "hover:bg-base-200",
              ].join(" ")}
              onSelect={() => onSortChange({ ...sort, field: option.field })}
            >
              <button type="button">
                <span className="font-semibold">{option.label}</span>
                {sort.field === option.field ? (
                  <span className="badge badge-primary badge-sm">{directionLabel}</span>
                ) : null}
              </button>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
