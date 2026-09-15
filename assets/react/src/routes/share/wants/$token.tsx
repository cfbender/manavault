import { createFileRoute } from "@tanstack/react-router"
import { ShareWantsPage } from "../../../pages/trade"

export const Route = createFileRoute("/share/wants/$token")({
  staticData: { title: "Shared Wants" },
  component: SharedWantsRoute,
})

function SharedWantsRoute() {
  const { token } = Route.useParams()
  return <ShareWantsPage token={token} />
}
