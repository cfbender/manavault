import { createFileRoute } from "@tanstack/react-router"
import { ScanSessionsPage } from "../../pages/scans"

export const Route = createFileRoute("/scan-sessions/")({
  component: ScanSessionsPage,
})
