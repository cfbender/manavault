import { createFileRoute } from "@tanstack/react-router"
import { SetsPage } from "../../../pages/sets"
import {
  deserializeSetCategories,
  deserializeSetListSort,
  serializeSetCategories,
  serializeSetListSort,
} from "../../../pages/sets/set-list"

type SetsSearch = {
  q?: string
  types?: string
  sort?: string
  owned?: boolean
}

export const Route = createFileRoute("/cards/sets/")({
  staticData: { title: "Sets" },
  validateSearch: (search: Record<string, unknown>): SetsSearch => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    types: serializeSetCategories(deserializeSetCategories(search.types)),
    sort: serializeSetListSort(deserializeSetListSort(search.sort)),
    owned: search.owned === true || search.owned === "true" || search.owned === "1" || undefined,
  }),
  component: SetsRoute,
})

function SetsRoute() {
  const search = Route.useSearch()
  return (
    <SetsPage
      query={search.q || ""}
      categories={deserializeSetCategories(search.types)}
      sort={deserializeSetListSort(search.sort)}
      ownedOnly={Boolean(search.owned)}
    />
  )
}
