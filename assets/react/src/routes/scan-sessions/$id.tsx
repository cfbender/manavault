import { createFileRoute } from "@tanstack/react-router"
import { ScanSessionPage } from "../../pages/scans"

export const Route = createFileRoute("/scan-sessions/$id")({
  component: ScanSessionPage,
})
