import { createFileRoute } from "@tanstack/react-router"
import { DeckDetailPage, type EDHRecTab } from "../../pages/decks"

type DeckSearch = {
  edhrec?: EDHRecTab
  edhrecCommander?: string
  edhrecExcludeLands?: boolean
  edhrecTheme?: string
}

const EDHREC_TABS: EDHRecTab[] = ["recs", "cuts", "commander"]

export const Route = createFileRoute("/decks/$id")({
  staticData: { title: "Deck" },
  validateSearch: (search: Record<string, unknown>): DeckSearch => {
    const commanderName =
      typeof search.edhrecCommander === "string" ? search.edhrecCommander.trim() : ""
    const themeSlug =
      typeof search.edhrecTheme === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(search.edhrecTheme)
        ? search.edhrecTheme
        : ""

    return {
      edhrec:
        typeof search.edhrec === "string" && EDHREC_TABS.includes(search.edhrec as EDHRecTab)
          ? (search.edhrec as EDHRecTab)
          : undefined,
      edhrecCommander: commanderName && themeSlug ? commanderName : undefined,
      edhrecExcludeLands:
        search.edhrecExcludeLands === true ||
        search.edhrecExcludeLands === "true" ||
        search.edhrecExcludeLands === "1"
          ? true
          : undefined,
      edhrecTheme: commanderName && themeSlug ? themeSlug : undefined,
    }
  },
  component: DeckRoute,
})

function DeckRoute() {
  const { id } = Route.useParams()
  const search = Route.useSearch()
  return (
    <DeckDetailPage
      id={id}
      edhrecExcludeLands={Boolean(search.edhrecExcludeLands)}
      edhrecCommander={search.edhrecCommander}
      edhrecTab={search.edhrec}
      edhrecTheme={search.edhrecTheme}
    />
  )
}
