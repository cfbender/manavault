import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router"
import { ScanSessionPage } from "../../pages/scans"

export const Route = createFileRoute("/scan-sessions/$id")({
  component: ScanSessionRoute,
})

function ScanSessionRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  if (pathname.endsWith("/scanner")) return <Outlet />

  return <ScanSessionPage />
}
