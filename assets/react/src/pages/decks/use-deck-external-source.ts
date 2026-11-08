import { useApolloClient, useMutation } from "@apollo/client/react"
import { useState } from "react"

import { useToast } from "../../components/ui/toast"
import { refetchActiveQueries } from "../../lib/apollo"
import { pluralize } from "../../lib/utils"
import {
  LinkDeckExternalSourceDocument,
  SyncDeckExternalSourceDocument,
  UnlinkDeckExternalSourceDocument,
} from "./deck-share-documents"

export const EXTERNAL_SOURCE_LABELS: Record<string, string> = {
  archidekt: "Archidekt",
  moxfield: "Moxfield",
}

export function externalSourceLabel(source: string | null | undefined) {
  return (source && EXTERNAL_SOURCE_LABELS[source]) || "external deck"
}

export function unresolvedToast(prefix: string, unresolved: string[]) {
  if (!unresolved.length) return prefix
  return `${prefix}; ${pluralize(unresolved.length, "card")} not found: ${unresolved
    .slice(0, 3)
    .join(", ")}${unresolved.length > 3 ? "…" : ""}`
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

/**
 * Link / sync / unlink a deck against Moxfield or Archidekt. Every mutation
 * refetches the active deck queries so the decklist and header update.
 */
export function useDeckExternalSource(deckId: string) {
  const client = useApolloClient()
  const { showToast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const [linkMutation, linkResult] = useMutation(LinkDeckExternalSourceDocument)
  const [syncMutation, syncResult] = useMutation(SyncDeckExternalSourceDocument)
  const [unlinkMutation, unlinkResult] = useMutation(UnlinkDeckExternalSourceDocument)

  function link(url: string, onSuccess?: () => void) {
    setError(null)
    void linkMutation({
      variables: { id: deckId, url },
      onCompleted: (data) => {
        const unresolved = data.linkDeckExternalSource?.unresolved ?? []
        void refetchActiveQueries(client)
        showToast(unresolvedToast("Deck linked and imported", unresolved))
        onSuccess?.()
      },
      onError: (error) => setError(errorMessage(error, "Could not link that deck")),
    })
  }

  function sync(onSuccess?: () => void) {
    setError(null)
    void syncMutation({
      variables: { id: deckId },
      onCompleted: (data) => {
        const unresolved = data.syncDeckExternalSource?.unresolved ?? []
        void refetchActiveQueries(client)
        showToast(unresolvedToast("Deck synced", unresolved))
        onSuccess?.()
      },
      onError: (error) => {
        // The server records the failure on the deck, so refresh to show it.
        void refetchActiveQueries(client)
        setError(errorMessage(error, "Could not sync the deck"))
      },
    })
  }

  function unlink(onSuccess?: () => void) {
    setError(null)
    void unlinkMutation({
      variables: { id: deckId },
      onCompleted: () => {
        void refetchActiveQueries(client)
        showToast("Deck unlinked; the decklist is editable again")
        onSuccess?.()
      },
      onError: (error) => setError(errorMessage(error, "Could not unlink the deck")),
    })
  }

  return {
    clearError: () => setError(null),
    error,
    isLinking: linkResult.loading,
    isPending: linkResult.loading || syncResult.loading || unlinkResult.loading,
    isSyncing: syncResult.loading,
    isUnlinking: unlinkResult.loading,
    link,
    sync,
    unlink,
  }
}
