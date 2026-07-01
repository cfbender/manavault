import { createFileRoute } from "@tanstack/react-router"
import { SettingsPage } from "../pages/settings"

export const Route = createFileRoute("/settings")({
  staticData: { title: "Settings" },
  component: SettingsPage,
})
