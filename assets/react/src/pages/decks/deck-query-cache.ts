import type { DeckQuery } from "../../gql/graphql"
import type { DeckCardTag } from "./deck-types"

export type DeckTagPatch = {
  currentTag?: DeckCardTag | null
  id: string
  tag: DeckCardTag | null
}

type DeckData = NonNullable<DeckQuery["deck"]>
type DeckCardsConnection = NonNullable<DeckData["deckCards"]>
type DeckCardEdge = NonNullable<NonNullable<DeckCardsConnection["edges"]>[number]>
type DeckCardNode = NonNullable<DeckCardEdge["node"]>
type RuntimeDeckCardEdge = Omit<DeckCardEdge, "node"> & {
  node?: DeckCardNode | null
}
type RuntimeDeckCardsConnection = {
  edges?: ReadonlyArray<RuntimeDeckCardEdge | null> | null
}

export function updateDeckCardTagsInDeckQuery(
  data: DeckQuery | undefined,
  patches: readonly DeckTagPatch[],
): DeckQuery | undefined {
  if (!data || patches.length === 0) return data

  const deck = data.deck
  if (!deck) return data

  const originalDeckCards = deck.deckCards
  const deckCards = originalDeckCards as RuntimeDeckCardsConnection | null | undefined
  const edges = deckCards?.edges
  if (!originalDeckCards || !deckCards || !edges?.length) return data

  const patchesById = new Map<string, DeckTagPatch>()
  for (const patch of patches) patchesById.set(patch.id, patch)

  let changed = false
  const nextEdges = edges.map((edge) => {
    const node = edge?.node
    if (!node) return edge

    const patch = patchesById.get(node.id)
    if (
      !patch ||
      ("currentTag" in patch && node.tag !== patch.currentTag) ||
      node.tag === patch.tag
    ) {
      return edge
    }

    changed = true
    return { ...edge, node: { ...node, tag: patch.tag } }
  })

  if (!changed) return data

  return {
    ...data,
    deck: {
      ...deck,
      deckCards: {
        ...originalDeckCards,
        edges: nextEdges as DeckCardsConnection["edges"],
      },
    },
  }
}
