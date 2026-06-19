import { createFileRoute } from "@tanstack/react-router"
import { DeckDetailPage, type EDHRecTab } from "../../pages/decks"

type DeckSearch = {
  edhrec?: EDHRecTab
  edhrecExcludeLands?: boolean
}

const EDHREC_TABS: EDHRecTab[] = ["recs", "cuts", "commander"]

export const Route = createFileRoute("/decks/$id")({
  validateSearch: (search: Record<string, unknown>): DeckSearch => ({
    edhrec:
      typeof search.edhrec === "string" && EDHREC_TABS.includes(search.edhrec as EDHRecTab)
        ? (search.edhrec as EDHRecTab)
        : undefined,
    edhrecExcludeLands:
      search.edhrecExcludeLands === true ||
      search.edhrecExcludeLands === "true" ||
      search.edhrecExcludeLands === "1"
        ? true
        : undefined,
  }),
  component: DeckRoute,
})

function DeckRoute() {
  const { id } = Route.useParams()
  const search = Route.useSearch()
  return (
    <DeckDetailPage
      id={id}
      edhrecExcludeLands={Boolean(search.edhrecExcludeLands)}
      edhrecTab={search.edhrec}
    />
  )
}
