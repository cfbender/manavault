import { ListFilter, Search } from "lucide-react"
import type { FormEvent } from "react"
import { CardNameSearchField } from "../../components/card-name-search-field"
import { Button } from "../../components/ui/button"

export function CardSearchForm({
  activeFilterCount,
  onFilterClick,
  q,
  setQ,
  onSearch,
}: {
  activeFilterCount: number
  onFilterClick: () => void
  q: string
  setQ: (value: string) => void
  onSearch: (value?: string) => void
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch(q)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="control-toolbar mb-7 grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-[1fr_auto_auto]"
    >
      <CardNameSearchField
        name="q"
        value={q}
        onValueChange={setQ}
        onClear={() => onSearch("")}
        onSuggestionSelect={onSearch}
        placeholder="Card name"
      />
      <Button type="button" variant="outline" className="relative" onClick={onFilterClick}>
        <ListFilter className="h-4 w-4" />
        Filter
        {activeFilterCount ? (
          <span className="badge badge-primary badge-sm absolute -right-2 -top-2 min-w-5">
            {activeFilterCount}
          </span>
        ) : null}
      </Button>
      <Button type="submit">
        <Search className="h-4 w-4" />
        Search
      </Button>
    </form>
  )
}
