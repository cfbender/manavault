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

type DeckTagsList = NonNullable<DeckData["tags"]>
type RuntimeDeckCardNode = DeckCardNode & { tagIds?: readonly string[] | null }
type RuntimeDeckData = DeckData & { tags?: DeckTagsList | null }

export type DeckCustomTagPatch = { id: string; tagIds: string[] }

export function updateDeckCardCustomTagsInDeckQuery(
  data: DeckQuery | undefined,
  cardPatches: readonly DeckCustomTagPatch[],
  tagCountPatches: readonly { id: string; cardCount: number }[],
): DeckQuery | undefined {
  if (!data || (cardPatches.length === 0 && tagCountPatches.length === 0)) return data

  const deck = data.deck
  if (!deck) return data

  let changed = false

  const originalDeckCards = deck.deckCards
  const deckCards = originalDeckCards as RuntimeDeckCardsConnection | null | undefined
  const edges = deckCards?.edges

  const cardPatchesById = new Map<string, DeckCustomTagPatch>()
  for (const patch of cardPatches) cardPatchesById.set(patch.id, patch)

  let nextEdges = edges
  if (originalDeckCards && deckCards && edges?.length && cardPatchesById.size > 0) {
    let edgesChanged = false
    const mappedEdges = edges.map((edge) => {
      const node = edge?.node as RuntimeDeckCardNode | null | undefined
      if (!node) return edge

      const patch = cardPatchesById.get(node.id)
      if (!patch) return edge

      edgesChanged = true
      return { ...edge, node: { ...node, tagIds: patch.tagIds } }
    })

    if (edgesChanged) {
      changed = true
      nextEdges = mappedEdges
    }
  }

  const runtimeDeck = deck as RuntimeDeckData
  const originalTags = runtimeDeck.tags
  let nextTags = originalTags
  if (originalTags?.length && tagCountPatches.length > 0) {
    const tagPatchesById = new Map<string, number>()
    for (const patch of tagCountPatches) tagPatchesById.set(patch.id, patch.cardCount)

    let tagsChanged = false
    const mappedTags = originalTags.map((tag) => {
      const cardCount = tagPatchesById.get(tag.id)
      if (cardCount === undefined || tag.cardCount === cardCount) return tag

      tagsChanged = true
      return { ...tag, cardCount }
    })

    if (tagsChanged) {
      changed = true
      nextTags = mappedTags
    }
  }

  if (!changed) return data

  return {
    ...data,
    deck: {
      ...deck,
      tags: nextTags as DeckTagsList,
      deckCards: originalDeckCards
        ? {
            ...originalDeckCards,
            edges: nextEdges as DeckCardsConnection["edges"],
          }
        : originalDeckCards,
    },
  }
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
