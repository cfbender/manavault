import { ConfirmDialog } from "../../../components/ui/confirm-dialog"
import { AutoSortSetupDialog } from "../auto-sort-setup-dialog"
import { AutoSortSummaryDialog } from "../auto-sort-summary-dialog"
import { ExportCollectionDialog } from "../export/collection-export-dialog"
import { ImportCollectionDialog } from "../import/collection-import-dialog"
import {
  AddCollectionItemDialog,
  AddCollectionItemToDeckDialog,
  BulkEditCollectionItemsDialog,
  DeleteCollectionItemDialog,
  MoveCollectionItemDialog,
} from "../item-dialogs"
import { AddLocationDialog, EditLocationDialog } from "../location-dialogs"
import { SellCardsDialog } from "../sell-cards-dialog"
import type { CollectionOverlay } from "./use-collection-overlays"

export function CollectionDialogs({
  applyAutoSort,
  close,
  deleteLocation,
  filters,
  finishBulkAction,
  overlay,
  pendingAutoSort,
}: {
  applyAutoSort: () => void
  close: () => void
  deleteLocation: (location: Extract<CollectionOverlay, { type: "delete-location" }>["location"]) => void
  filters: { q?: string; locationId?: string; unallocatedOnly?: boolean; addedWithinDays?: number }
  finishBulkAction: () => void
  overlay: CollectionOverlay
  pendingAutoSort: boolean
}) {
  return (
    <>
      <AddCollectionItemDialog open={overlay.type === "add-item"} onOpenChange={closeWhenClosed(close)} />
      <AddLocationDialog open={overlay.type === "add-location"} onOpenChange={closeWhenClosed(close)} />
      <ImportCollectionDialog
        initialImport={overlay.type === "import" ? overlay.initialImport : null}
        open={overlay.type === "import"}
        onOpenChange={closeWhenClosed(close)}
      />
      <ExportCollectionDialog
        filters={filters}
        format="csv"
        open={overlay.type === "export-collection"}
        onOpenChange={closeWhenClosed(close)}
        fileName="collection.csv"
      />
      <SellCardsDialog
        open={overlay.type === "sell-cards"}
        onDone={finishBulkAction}
        onOpenChange={closeWhenClosed(close)}
      />
      <ExportCollectionDialog
        filters={overlay.type === "export-location" ? { locationId: overlay.location.id } : {}}
        format={overlay.type === "export-location" ? overlay.format : "csv"}
        title={
          overlay.type === "export-location"
            ? `Export ${overlay.location.name} ${overlay.format.toUpperCase()}`
            : undefined
        }
        fileName={
          overlay.type === "export-location"
            ? `${overlay.location.name}.${overlay.format === "csv" ? "csv" : "txt"}`
            : undefined
        }
        open={overlay.type === "export-location"}
        onOpenChange={closeWhenClosed(close)}
      />
      <ConfirmDialog
        destructive
        confirmLabel={
          overlay.type === "delete-location" && overlay.location.kind === "list"
            ? "Delete list"
            : "Delete location"
        }
        open={overlay.type === "delete-location"}
        title={
          overlay.type === "delete-location"
            ? `Delete ${overlay.location.name}?`
            : "Delete location?"
        }
        onConfirm={() => overlay.type === "delete-location" && deleteLocation(overlay.location)}
        onOpenChange={closeWhenClosed(close)}
      >
        {overlay.type === "delete-location" && overlay.location.kind === "list"
          ? "Cards in this list will be deleted."
          : "Cards in this location will become unfiled."}
      </ConfirmDialog>
      <AutoSortSetupDialog
        open={overlay.type === "auto-sort-setup"}
        onOpenChange={closeWhenClosed(close)}
      />
      <AutoSortSummaryDialog
        open={overlay.type === "auto-sort-summary"}
        result={overlay.type === "auto-sort-summary" ? overlay.result : null}
        onOpenChange={closeWhenClosed(close)}
        applyPending={pendingAutoSort}
        onApply={applyAutoSort}
      />
      <AddCollectionItemToDeckDialog
        item={overlay.type === "bulk-deck" ? overlay.target : null}
        onDone={finishBulkAction}
        onOpenChange={closeWhenClosed(close)}
      />
      <BulkEditCollectionItemsDialog
        item={overlay.type === "bulk-edit" ? overlay.target : null}
        onDone={finishBulkAction}
        onOpenChange={closeWhenClosed(close)}
      />
      <MoveCollectionItemDialog
        item={overlay.type === "bulk-list" ? overlay.target : null}
        listOnly
        onDone={finishBulkAction}
        onOpenChange={closeWhenClosed(close)}
      />
      <MoveCollectionItemDialog
        item={overlay.type === "bulk-move" ? overlay.target : null}
        onDone={finishBulkAction}
        onOpenChange={closeWhenClosed(close)}
      />
      <DeleteCollectionItemDialog
        item={overlay.type === "bulk-delete" ? overlay.target : null}
        onDone={finishBulkAction}
        onOpenChange={closeWhenClosed(close)}
      />
      <EditLocationDialog
        location={overlay.type === "edit-location" ? overlay.location : null}
        onOpenChange={closeWhenClosed(close)}
      />
    </>
  )
}

function closeWhenClosed(close: () => void) {
  return (open: boolean) => {
    if (!open) close()
  }
}
