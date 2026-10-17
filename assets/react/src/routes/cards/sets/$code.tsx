import { createFileRoute } from "@tanstack/react-router"
import { SetPage } from "../../../pages/sets"
import { decodeCollectionFilters, encodeCollectionFilters } from "../../../lib/collection-filters"
import { deserializeSetSort, serializeSetSort } from "../../../pages/sets/set-sort"

type SetSearch = {
  filters?: string
  sort?: string
  view?: "grid"
  grouped?: false
}

export const Route = createFileRoute("/cards/sets/$code")({
  staticData: { title: "Set" },
  validateSearch: (search: Record<string, unknown>): SetSearch => ({
    filters: encodeCollectionFilters(decodeCollectionFilters(search.filters)),
    sort: serializeSetSort(deserializeSetSort(search.sort)),
    view: search.view === "grid" ? "grid" : undefined,
    grouped: search.grouped === false || search.grouped === "false" ? false : undefined,
  }),
  component: SetRoute,
})

function SetRoute() {
  const { code } = Route.useParams()
  const search = Route.useSearch()
  return (
    <SetPage
      code={code.toLowerCase()}
      filterSearch={search.filters}
      sort={deserializeSetSort(search.sort)}
      view={search.view ?? "flip"}
      grouped={search.grouped ?? true}
    />
  )
}
