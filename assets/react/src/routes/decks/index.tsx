import { createFileRoute } from "@tanstack/react-router"
import { DecksPage } from "../../pages/decks"

export const Route = createFileRoute("/decks/")({
  component: DecksPage,
})
