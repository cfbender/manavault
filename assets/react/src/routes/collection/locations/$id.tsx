import { createFileRoute } from "@tanstack/react-router"
import { LocationPage } from "../../../pages/collection"

export const Route = createFileRoute("/collection/locations/$id")({
  component: LocationRoute,
})

function LocationRoute() {
  const { id } = Route.useParams()
  return <LocationPage id={id} />
}
