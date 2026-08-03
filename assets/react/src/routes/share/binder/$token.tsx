import { createFileRoute } from "@tanstack/react-router"
import { ShareBinderPage } from "../../../pages/trade"

export const Route = createFileRoute("/share/binder/$token")({
  staticData: { title: "Shared Binder" },
  component: SharedBinderRoute,
})

function SharedBinderRoute() {
  const { token } = Route.useParams()
  return <ShareBinderPage token={token} />
}
