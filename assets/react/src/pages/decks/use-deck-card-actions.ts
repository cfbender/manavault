import { useApolloClient, useMutation } from "@apollo/client/react"
import { useRef, useState } from "react"

import type { DeckCardInput, DeckCardUpdateInput, DeckQuery } from "../../gql/graphql"
import {
  updateDeckCardCustomTagsInDeckQuery,
  updateDeckCardTagsInDeckQuery,
  type DeckCustomTagPatch,
  type DeckTagPatch,
} from "./deck-query-cache"
import {
  NO_DECK_DETAIL_OVERLAY,
  type DeckDetailOverlay,
  updateCardWorkflowError,
} from "./deck-detail-overlay"
import type { DeckCardEntry, DeckCardTag } from "./deck-types"
import {
  AddDeckCardDocument,
  AssignDeckCardTagDocument,
  DeckDocument,
  DeleteDeckCardDocument,
  SetDeckCommanderDocument,
  UnassignDeckCardTagDocument,
  UpdateDeckCardDocument,
  UpdateDeckCardsTagDocument,
} from "./queries"

type CardWorkflow = "edit-card" | "move-card" | "tag"
type OverlaySetter = (update: DeckDetailOverlay | ((current: DeckDetailOverlay) => DeckDetailOverlay)) => void

type UseDeckCardActionsOptions = {
  deckId: string
  onRefetch: () => void
  onToast: (message: string) => void
  setOverlay: OverlaySetter
}

function deckCardTagValue(tag: string | null | undefined): DeckCardTag | null | undefined {
  if (tag === null) return null
  if (tag === "getting" || tag === "consider_cutting") return tag
  return undefined
}

function isTagOnlyDeckCardUpdate(input: DeckCardUpdateInput) {
  const keys = Object.keys(input)
  return keys.length === 1 && keys[0] === "tag"
}

function deckCardTagFromDeckQuery(data: DeckQuery | undefined, deckCardId: string) {
  for (const edge of data?.deck?.deckCards?.edges ?? []) {
    const deckCard = edge?.node
    if (deckCard?.id === deckCardId) return deckCardTagValue(deckCard.tag)
  }

  return undefined
}

function rollbackDeckCardTagPatches(
  data: DeckQuery | undefined,
  deckCardIds: readonly string[],
  optimisticTag: DeckCardTag | null,
) {
  const patches: DeckTagPatch[] = []

  for (const deckCardId of deckCardIds) {
    const previousTag = deckCardTagFromDeckQuery(data, deckCardId)
    if (previousTag !== undefined) {
      patches.push({ currentTag: optimisticTag, id: deckCardId, tag: previousTag })
    }
  }

  return patches
}

export function useDeckCardActions({
  deckId,
  onRefetch,
  onToast,
  setOverlay,
}: UseDeckCardActionsOptions) {
  const client = useApolloClient()
  const customTagOpSeqRef = useRef<Map<string, number>>(new Map())
  const [tagError, setTagError] = useState<string | null>(null)

  function readDeckQuery(): DeckQuery | undefined {
    return client.cache.readQuery({ query: DeckDocument, variables: { id: deckId } }) ?? undefined
  }

  function writeDeckQuery(data: DeckQuery | undefined) {
    if (data) client.cache.writeQuery({ query: DeckDocument, variables: { id: deckId }, data })
  }

  function updateDeckCacheTags(patches: readonly DeckTagPatch[]) {
    writeDeckQuery(updateDeckCardTagsInDeckQuery(readDeckQuery(), patches))
  }

  function updateDeckCacheCustomTags(
    cardPatches: readonly DeckCustomTagPatch[],
    tagCountPatches: readonly { id: string; cardCount: number }[],
  ) {
    writeDeckQuery(
      updateDeckCardCustomTagsInDeckQuery(readDeckQuery(), cardPatches, tagCountPatches),
    )
  }

  const [updateDeckCardMutation, updateDeckCardResult] = useMutation(UpdateDeckCardDocument)
  const [updateDeckCardsTagMutation, updateDeckCardsTagResult] = useMutation(UpdateDeckCardsTagDocument)
  const [assignDeckCardTagMutation] = useMutation(AssignDeckCardTagDocument)
  const [unassignDeckCardTagMutation] = useMutation(UnassignDeckCardTagDocument)
  const [deleteDeckCardMutation, deleteDeckCardResult] = useMutation(DeleteDeckCardDocument)
  const [setDeckCommanderMutation, setDeckCommanderResult] = useMutation(SetDeckCommanderDocument)
  const [addDeckCardMutation, addDeckCardResult] = useMutation(AddDeckCardDocument)

  function updateDeckCard(
    deckCardId: string,
    input: DeckCardUpdateInput,
    workflow: CardWorkflow = "tag",
  ) {
    const isTagOnly = isTagOnlyDeckCardUpdate(input)
    const optimisticTag = isTagOnly ? deckCardTagValue(input.tag) : undefined
    const rollbackPatches =
      optimisticTag === undefined
        ? []
        : rollbackDeckCardTagPatches(readDeckQuery(), [deckCardId], optimisticTag)

    if (optimisticTag !== undefined) updateDeckCacheTags([{ id: deckCardId, tag: optimisticTag }])

    void updateDeckCardMutation({
      variables: { id: deckCardId, input },
      onCompleted: (data) => {
        const updatedDeckCard = data.updateDeckCard?.deckCard
        const serverTag = deckCardTagValue(updatedDeckCard?.tag)

        if (isTagOnly && updatedDeckCard && serverTag !== undefined) {
          updateDeckCacheTags([
            {
              currentTag: optimisticTag,
              id: updatedDeckCard.id,
              tag: serverTag,
            },
          ])
        } else if (!isTagOnly) {
          onRefetch()
        }

        if (workflow === "edit-card") {
          onToast("Card edited")
          setOverlay((overlay) =>
            overlay.kind === "edit-card" ? NO_DECK_DETAIL_OVERLAY : overlay,
          )
        } else if (workflow === "move-card") {
          onToast("Card moved")
          setOverlay((overlay) =>
            overlay.kind === "move-card" ? NO_DECK_DETAIL_OVERLAY : overlay,
          )
        }
        setTagError(null)
      },
      onError: (error) => {
        if (rollbackPatches.length) updateDeckCacheTags(rollbackPatches)

        const message = error instanceof Error ? error.message : "Could not update deck card"
        if (workflow === "edit-card" || workflow === "move-card") {
          setOverlay((overlay) => updateCardWorkflowError(overlay, workflow, message))
        } else {
          setTagError(message)
        }
      },
    })
  }

  function tagDeckCard(deckCard: DeckCardEntry, tag: DeckCardTag | null) {
    setTagError(null)
    updateDeckCard(deckCard.id, { tag })
  }

  function updateSelectedDeckCardsTag(deckCardIds: string[], tag: DeckCardTag | null, onSuccess: () => void) {
    const rollbackPatches = rollbackDeckCardTagPatches(readDeckQuery(), deckCardIds, tag)
    updateDeckCacheTags(deckCardIds.map((id) => ({ id, tag })))

    void updateDeckCardsTagMutation({
      variables: { deckCardIds, tag },
      onCompleted: (data) => {
        const patches = (data.updateDeckCardsTag?.deckCards ?? [])
          .map((deckCard): DeckTagPatch | null => {
            const nextTag = deckCardTagValue(deckCard.tag)
            return nextTag === undefined ? null : { currentTag: tag, id: deckCard.id, tag: nextTag }
          })
          .filter((patch): patch is DeckTagPatch => patch !== null)
        if (patches.length) updateDeckCacheTags(patches)
        setTagError(null)
        onSuccess()
      },
      onError: (error) => {
        if (rollbackPatches.length) updateDeckCacheTags(rollbackPatches)
        setTagError(error instanceof Error ? error.message : "Could not tag selected cards")
      },
    })
  }

  function assignDeckCardTag(deckCard: DeckCardEntry, tagId: string) {
    const previousTagIds = deckCard.tagIds ?? []
    if (previousTagIds.includes(tagId)) return

    const previousCardCount = readDeckQuery()?.deck?.tags?.find((tag) => tag.id === tagId)?.cardCount ?? 0
    const opSeq = (customTagOpSeqRef.current.get(deckCard.id) ?? 0) + 1
    customTagOpSeqRef.current.set(deckCard.id, opSeq)
    updateDeckCacheCustomTags(
      [{ id: deckCard.id, tagIds: [...previousTagIds, tagId] }],
      [{ id: tagId, cardCount: previousCardCount + deckCard.quantity }],
    )

    void assignDeckCardTagMutation({
      variables: { deckCardId: deckCard.id, tagId },
      onCompleted: (data) => {
        if (customTagOpSeqRef.current.get(deckCard.id) !== opSeq) return
        const assignedDeckCard = data.assignDeckCardTag?.deckCard
        if (assignedDeckCard) {
          updateDeckCacheCustomTags(
            [{ id: assignedDeckCard.id, tagIds: assignedDeckCard.tagIds }],
            data.assignDeckCardTag?.deckTags ?? [],
          )
        }
      },
      onError: (error) => {
        if (customTagOpSeqRef.current.get(deckCard.id) !== opSeq) return
        updateDeckCacheCustomTags(
          [{ id: deckCard.id, tagIds: previousTagIds }],
          [{ id: tagId, cardCount: previousCardCount }],
        )
        onToast(error instanceof Error ? error.message : "Could not assign tag")
      },
    })
  }

  function unassignDeckCardTag(deckCard: DeckCardEntry, tagId: string) {
    const previousTagIds = deckCard.tagIds ?? []
    if (!previousTagIds.includes(tagId)) return

    const previousCardCount = readDeckQuery()?.deck?.tags?.find((tag) => tag.id === tagId)?.cardCount ?? 0
    const opSeq = (customTagOpSeqRef.current.get(deckCard.id) ?? 0) + 1
    customTagOpSeqRef.current.set(deckCard.id, opSeq)
    updateDeckCacheCustomTags(
      [{ id: deckCard.id, tagIds: previousTagIds.filter((id) => id !== tagId) }],
      [{ id: tagId, cardCount: Math.max(previousCardCount - deckCard.quantity, 0) }],
    )

    void unassignDeckCardTagMutation({
      variables: { deckCardId: deckCard.id, tagId },
      onCompleted: (data) => {
        if (customTagOpSeqRef.current.get(deckCard.id) !== opSeq) return
        const unassignedDeckCard = data.unassignDeckCardTag?.deckCard
        if (unassignedDeckCard) {
          updateDeckCacheCustomTags(
            [{ id: unassignedDeckCard.id, tagIds: unassignedDeckCard.tagIds }],
            data.unassignDeckCardTag?.deckTags ?? [],
          )
        }
      },
      onError: (error) => {
        if (customTagOpSeqRef.current.get(deckCard.id) !== opSeq) return
        updateDeckCacheCustomTags(
          [{ id: deckCard.id, tagIds: previousTagIds }],
          [{ id: tagId, cardCount: previousCardCount }],
        )
        onToast(error instanceof Error ? error.message : "Could not remove tag")
      },
    })
  }

  function deleteDeckCard(deckCardId: string) {
    void deleteDeckCardMutation({
      variables: { id: deckCardId },
      onCompleted: () => {
        onRefetch()
        onToast("Card deleted from deck")
        setOverlay((overlay) => overlay.kind === "delete-card" ? NO_DECK_DETAIL_OVERLAY : overlay)
      },
      onError: () => undefined,
    })
  }

  function setDeckCommander(deckCardId: string) {
    void setDeckCommanderMutation({
      variables: { id: deckCardId },
      onCompleted: onRefetch,
      onError: (error) => setTagError(error instanceof Error ? error.message : "Could not set commander"),
    })
  }

  function addDeckCard(input: DeckCardInput) {
    void addDeckCardMutation({
      variables: { deckId, input },
      onCompleted: () => {
        onRefetch()
        onToast("Card added to deck")
      },
      onError: () => undefined,
    })
  }

  return {
    addDeckCard,
    addCardError: addDeckCardResult.error instanceof Error ? addDeckCardResult.error.message : null,
    assignDeckCardTag,
    clearTagError: () => setTagError(null),
    deleteDeckCard,
    deleteError: deleteDeckCardResult.error instanceof Error ? deleteDeckCardResult.error.message : null,
    isPending:
      updateDeckCardResult.loading ||
      updateDeckCardsTagResult.loading ||
      deleteDeckCardResult.loading ||
      setDeckCommanderResult.loading,
    isAddingCard: addDeckCardResult.loading,
    isDeletingCard: deleteDeckCardResult.loading,
    isUpdatingCard: updateDeckCardResult.loading,
    setDeckCommander,
    tagDeckCard,
    tagError,
    unassignDeckCardTag,
    updateDeckCard,
    updateSelectedDeckCardsTag,
  }
}
