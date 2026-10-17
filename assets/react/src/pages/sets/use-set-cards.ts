import { useQuery } from "@apollo/client/react"
import { useMemo } from "react"
import type { CardSetQuery } from "../../gql/graphql"
import { CardSetDocument } from "./data"
import type { FlipPrinting } from "./set-flip-view"
import type { RiffleItem } from "./set-riffle"
import { setSections } from "./set-sections"
import type { SetSort } from "./set-sort"

function largeImageUrl(imageUris: unknown): string | null {
  const uris = Array.isArray(imageUris) ? imageUris[0] : imageUris
  if (!uris || typeof uris !== "object") return null
  const large = (uris as Record<string, unknown>).large
  return typeof large === "string" ? large : null
}

function nameMatches(printing: FlipPrinting, term: string) {
  return (printing.card?.name ?? "").toLowerCase().includes(term)
}

/**
 * A set and its printings (filtered by catalog syntax on the server and by
 * name here), split into treatment sections, and laid out for flipping: each
 * section's cards after its divider.
 */
export function useSetCards({
  code,
  grouped,
  nameFilter,
  query,
  sort,
}: {
  code: string
  grouped: boolean
  nameFilter: string
  query: string
  sort: SetSort
}) {
  const { data, loading, error } = useQuery(CardSetDocument, {
    variables: { code, q: query || null, sort },
    fetchPolicy: "cache-and-network",
  })
  const set: CardSetQuery["cardSet"] | undefined = data?.cardSet
  const printings = set?.printings

  const allPrintings = useMemo<FlipPrinting[]>(
    () =>
      (printings ?? []).map((printing) => ({
        ...printing,
        largeImageUrl: largeImageUrl(printing.imageUris),
      })),
    [printings],
  )
  const term = nameFilter.trim().toLowerCase()
  const visible = useMemo(
    () => (term ? allPrintings.filter((printing) => nameMatches(printing, term)) : allPrintings),
    [allPrintings, term],
  )
  const sections = useMemo(() => setSections(visible, grouped), [visible, grouped])
  const items = useMemo(() => {
    const withDividers = sections.length > 1
    return sections.flatMap((section, sectionIndex): RiffleItem<FlipPrinting>[] => [
      ...(withDividers
        ? [{ kind: "divider" as const, key: `divider:${section.key}`, sectionIndex }]
        : []),
      ...section.printings.map((printing) => ({
        kind: "card" as const,
        key: printing.scryfallId,
        printing,
        sectionIndex,
      })),
    ])
  }, [sections])

  return {
    error,
    items,
    loading: loading && !set,
    sections,
    set,
    visible,
    totalPrintings: allPrintings.length,
  }
}
