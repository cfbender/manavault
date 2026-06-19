import { createFileRoute } from "@tanstack/react-router"
import { ScanEntryPage } from "../pages/scans"

export const Route = createFileRoute("/scan")({
  component: ScanEntryPage,
})
