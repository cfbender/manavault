import { createFileRoute } from "@tanstack/react-router"
import { CollectionPage } from "../../pages/collection"

export const Route = createFileRoute("/collection/")({
  component: CollectionPage,
})
