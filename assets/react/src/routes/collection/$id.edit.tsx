import { createFileRoute } from "@tanstack/react-router"
import { EmptyState } from "../../components/card-image"

export const Route = createFileRoute("/collection/$id/edit")({
  component: () => <EmptyState title="Collection form pending" />,
})
