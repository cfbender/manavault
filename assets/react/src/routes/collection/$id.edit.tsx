import { createFileRoute } from "@tanstack/react-router"
import { EmptyState } from "../../components/card-image"

export const Route = createFileRoute("/collection/$id/edit")({
  staticData: { title: "Edit Collection Item" },
  component: () => <EmptyState title="Collection form pending" />,
})
