import { useApolloClient, useMutation } from "@apollo/client/react"
import { useState } from "react"
import type { DeckQuery } from "../../gql/graphql"
import type { DeckCustomTag } from "./deck-types"
import {
  CreateDeckTagDocument,
  DeckDocument,
  DeleteDeckTagDocument,
  ReorderDeckTagsDocument,
  UpdateDeckTagDocument,
} from "./queries"

type DeckData = NonNullable<DeckQuery["deck"]>
type DeckTagsList = DeckData["tags"]
type DeckTagEntry = DeckTagsList[number]
type DeckCardsConnection = NonNullable<DeckData["deckCards"]>
type DeckCardEdge = NonNullable<NonNullable<DeckCardsConnection["edges"]>[number]>
type DeckCardNode = NonNullable<DeckCardEdge["node"]>

type DeckTagMutationInput = Pick<DeckCustomTag, "name"> & Partial<Pick<DeckCustomTag, "color" | "targetCount">>

export type UseDeckTagsResult = {
  createTag: (input: DeckTagMutationInput) => void
  updateTag: (id: string, input: DeckTagMutationInput) => void
  deleteTag: (id: string) => void
  reorderTags: (tagIds: string[]) => void
  isPending: boolean
  error: string | null
}

export function useDeckTags(deckId: string): UseDeckTagsResult {
  const client = useApolloClient()
  const [error, setError] = useState<string | null>(null)

  function readDeckQuery(): DeckQuery | undefined {
    return client.cache.readQuery({ query: DeckDocument, variables: { id: deckId } }) ?? undefined
  }

  function writeDeckQuery(data: DeckQuery | undefined) {
    if (!data) return
    client.cache.writeQuery({ query: DeckDocument, variables: { id: deckId }, data })
  }

  function appendTagToCache(tag: DeckTagEntry) {
    const data = readDeckQuery()
    const deck = data?.deck
    if (!data || !deck) return
    writeDeckQuery({ ...data, deck: { ...deck, tags: [...deck.tags, tag] } })
  }

  function replaceTagInCache(tag: DeckTagEntry) {
    const data = readDeckQuery()
    const deck = data?.deck
    if (!data || !deck) return
    writeDeckQuery({
      ...data,
      deck: { ...deck, tags: deck.tags.map((existing) => (existing.id === tag.id ? tag : existing)) },
    })
  }

  function replaceAllTagsInCache(tags: DeckTagsList) {
    const data = readDeckQuery()
    const deck = data?.deck
    if (!data || !deck) return
    writeDeckQuery({ ...data, deck: { ...deck, tags } })
  }

  function removeTagFromCache(tagId: string) {
    const data = readDeckQuery()
    const deck = data?.deck
    if (!data || !deck) return

    const nextTags = deck.tags.filter((tag) => tag.id !== tagId)

    const deckCards = deck.deckCards
    const edges = deckCards?.edges
    let nextEdges = edges
    if (edges?.length) {
      let edgesChanged = false
      const mappedEdges = edges.map((edge) => {
        const node: DeckCardNode | null | undefined = edge?.node
        if (!node || !node.tagIds.includes(tagId)) return edge

        edgesChanged = true
        return { ...edge, node: { ...node, tagIds: node.tagIds.filter((id) => id !== tagId) } }
      })
      if (edgesChanged) nextEdges = mappedEdges
    }

    writeDeckQuery({
      ...data,
      deck: {
        ...deck,
        tags: nextTags,
        deckCards: deckCards ? { ...deckCards, edges: nextEdges as DeckCardsConnection["edges"] } : deckCards,
      },
    })
  }

  const [createTagMutation, createTagResult] = useMutation(CreateDeckTagDocument)
  const [updateTagMutation, updateTagResult] = useMutation(UpdateDeckTagDocument)
  const [deleteTagMutation, deleteTagResult] = useMutation(DeleteDeckTagDocument)
  const [reorderTagsMutation, reorderTagsResult] = useMutation(ReorderDeckTagsDocument)

  function createTag(input: DeckTagMutationInput) {
    setError(null)
    void createTagMutation({
      variables: { deckId, input },
      onCompleted: (data) => {
        setError(null)
        const tag = data.createDeckTag?.deckTag
        if (tag) appendTagToCache(tag)
      },
      onError: (err) => setError(err instanceof Error ? err.message : "Could not create tag"),
    })
  }

  function updateTag(id: string, input: DeckTagMutationInput) {
    setError(null)
    void updateTagMutation({
      variables: { id, input },
      onCompleted: (data) => {
        setError(null)
        const tag = data.updateDeckTag?.deckTag
        if (tag) replaceTagInCache(tag)
      },
      onError: (err) => setError(err instanceof Error ? err.message : "Could not update tag"),
    })
  }

  function deleteTag(id: string) {
    setError(null)
    void deleteTagMutation({
      variables: { id },
      onCompleted: (data) => {
        setError(null)
        const deckTagId = data.deleteDeckTag?.deckTagId
        if (deckTagId) removeTagFromCache(deckTagId)
      },
      onError: (err) => setError(err instanceof Error ? err.message : "Could not delete tag"),
    })
  }

  function reorderTags(tagIds: string[]) {
    setError(null)
    void reorderTagsMutation({
      variables: { deckId, tagIds },
      onCompleted: (data) => {
        setError(null)
        const tags = data.reorderDeckTags?.tags
        if (tags) replaceAllTagsInCache(tags)
      },
      onError: (err) => setError(err instanceof Error ? err.message : "Could not reorder tags"),
    })
  }

  const isPending =
    createTagResult.loading ||
    updateTagResult.loading ||
    deleteTagResult.loading ||
    reorderTagsResult.loading

  return { createTag, updateTag, deleteTag, reorderTags, isPending, error }
}

