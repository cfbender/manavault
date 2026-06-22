import { createFileRoute } from "@tanstack/react-router"
import { CollectionPage } from "../../pages/collection"

export const Route = createFileRoute("/collection/")({
  validateSearch: (search: Record<string, unknown>) => ({
    importFile: search.importFile === true || search.importFile === "true" || search.importFile === "1",
  }),
  component: CollectionRoute,
})

function CollectionRoute() {
  const search = Route.useSearch()
  return <CollectionPage importFile={search.importFile} />
}
