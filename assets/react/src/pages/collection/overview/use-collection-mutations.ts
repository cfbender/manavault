import { useApolloClient, useMutation } from "@apollo/client/react"
import { useState } from "react"
import { useToast } from "../../../components/ui/toast"
import { pluralize } from "../../../lib/utils"
import { AutoSortCollectionDocument } from "../auto-sort/documents"
import { hasEnabledAutoSortRules } from "../auto-sort-setup-dialog"
import { invalidateCollectionViews } from "../collection-navigation"
import { DeleteLocationDocument } from "../locations/documents"
import type { CollectionItemSelection } from "../selection-grid"
import type { LocationSummary } from "../types"
import type { CollectionOverlay } from "./use-collection-overlays"

export function useCollectionMutations({
  autoSortRules,
  selection,
  setOverlay,
}: {
  autoSortRules: Array<{ enabled: boolean }>
  selection: CollectionItemSelection
  setOverlay: (overlay: CollectionOverlay) => void
}) {
  const client = useApolloClient()
  const { showToast } = useToast()
  const [autoSortError, setAutoSortError] = useState<string | null>(null)
  const [deleteLocationMutation] = useMutation(DeleteLocationDocument)
  const [autoSortMutation, autoSortStatus] = useMutation(AutoSortCollectionDocument)

  function finishBulkAction() {
    void invalidateCollectionViews(client)
    selection.clearSelection()
  }

  function deleteLocation(location: LocationSummary) {
    void deleteLocationMutation({
      variables: { id: location.id },
      onCompleted: () => {
        void invalidateCollectionViews(client)
        showToast(`Deleted location ${location.name}`)
      },
    })
  }

  function runAutoSort(dryRun: boolean) {
    void autoSortMutation({
      variables: { input: { sourceLocationId: null, dryRun } },
      onCompleted: (data) => {
        const result = data.autoSortCollection?.autoSortResult
        if (dryRun && result) {
          setOverlay({ type: "auto-sort-summary", result })
        } else if (!dryRun) {
          void invalidateCollectionViews(client)
          selection.clearSelection()
          showToast(`${pluralize(result?.movedCount ?? 0, "card")} auto-sorted`)
          setOverlay({ type: "none" })
        }
        setAutoSortError(null)
      },
      onError: (error) => {
        setOverlay({ type: "none" })
        setAutoSortError(error instanceof Error ? error.message : "Could not auto-sort collection")
      },
    })
  }

  function previewAutoSort() {
    setAutoSortError(null)
    if (!hasEnabledAutoSortRules(autoSortRules)) {
      setOverlay({ type: "auto-sort-setup" })
      return
    }
    runAutoSort(true)
  }

  return {
    applyAutoSort: () => runAutoSort(false),
    autoSortError,
    autoSortPending: autoSortStatus.loading,
    deleteLocation,
    finishBulkAction,
    previewAutoSort,
  }
}
