import { SortDropdown as GenericSortDropdown } from "../../components/sort-dropdown"
import { SORT_OPTIONS } from "./constants"
import type { CollectionSort } from "./types"

export function SortDropdown({
  onSortChange,
  sort,
}: {
  onSortChange: (sort: CollectionSort) => void
  sort: CollectionSort
}) {
  return <GenericSortDropdown options={SORT_OPTIONS} sort={sort} onSortChange={onSortChange} />
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
