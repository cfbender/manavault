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
