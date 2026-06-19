import { createFileRoute } from "@tanstack/react-router"
import { ScannerPage } from "../../pages/scans"

export const Route = createFileRoute("/scan-sessions/$id/scanner")({
  component: ScannerPage,
})
