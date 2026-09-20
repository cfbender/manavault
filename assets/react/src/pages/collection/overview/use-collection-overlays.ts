import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  subscribeSharedImport,
  takePendingNativeSharedImport,
  type SharedImportPayload,
} from "../../../lib/native-shared-import"
import type { CollectionSelectionTarget } from "../item-target"
import type {
  AutoSortCollectionResult,
  CollectionExportFormat,
  LocationSummary,
} from "../types"

export type CollectionOverlay =
  | { type: "none" }
  | { type: "add-item" }
  | { type: "add-location" }
  | { type: "import"; initialImport: SharedImportPayload | null }
  | { type: "export-collection" }
  | { type: "sell-cards" }
  | { type: "auto-sort-setup" }
  | { type: "auto-sort-summary"; result: AutoSortCollectionResult }
  | { type: "edit-location"; location: LocationSummary }
  | { type: "delete-location"; location: LocationSummary }
  | { type: "export-location"; format: CollectionExportFormat; location: LocationSummary }
  | { type: "bulk-deck"; target: CollectionSelectionTarget }
  | { type: "bulk-list"; target: CollectionSelectionTarget }
  | { type: "bulk-move"; target: CollectionSelectionTarget }
  | { type: "bulk-edit"; target: CollectionSelectionTarget }
  | { type: "bulk-delete"; target: CollectionSelectionTarget }

const NO_OVERLAY: CollectionOverlay = { type: "none" }

export function useCollectionOverlays(importFile: boolean) {
  const navigate = useNavigate()
  const [overlay, setOverlay] = useState<CollectionOverlay>(NO_OVERLAY)
  const [quickCheckOpen, setQuickCheckOpen] = useState(false)

  useEffect(() => {
    if (!importFile) return
    let ignore = false
    void takePendingNativeSharedImport().then((initialImport) => {
      if (ignore) return
      setOverlay({ type: "import", initialImport })
      void navigate({
        to: "/collection",
        search: { importFile: false },
        replace: true,
      })
    })
    return () => {
      ignore = true
    }
  }, [importFile, navigate])

  useEffect(
    () =>
      subscribeSharedImport((initialImport) => {
        setOverlay({ type: "import", initialImport })
      }),
    [],
  )

  return {
    closeOverlay: () => setOverlay(NO_OVERLAY),
    overlay,
    quickCheckOpen,
    setOverlay,
    setQuickCheckOpen,
  }
}
