import { createFileRoute } from "@tanstack/react-router"
import { EmptyState } from "../../components/card-image"

type CollectionNewSearch = {
  printing_id?: string
}

export const Route = createFileRoute("/collection/new")({
  staticData: { title: "Add Collection Item" },
  validateSearch: (search: Record<string, unknown>): CollectionNewSearch => ({
    printing_id: typeof search.printing_id === "string" ? search.printing_id : undefined,
  }),
  component: () => <EmptyState title="Collection form pending" />,
})
