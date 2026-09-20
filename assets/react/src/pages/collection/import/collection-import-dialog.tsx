import { Upload, WandSparkles } from "lucide-react"
import type { SharedImportPayload } from "../../../lib/native-shared-import"
import { Button } from "../../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { AutoSortSetupDialog } from "../auto-sort-setup-dialog"
import { AutoSortSummaryDialog } from "../auto-sort-summary-dialog"
import { CollectionImportForm } from "./collection-import-form"
import { CollectionImportPreview } from "./collection-import-preview"
import { useCollectionImport } from "./use-collection-import"

export function ImportCollectionDialog({
  initialImport,
  onOpenChange,
  open,
}: {
  initialImport?: SharedImportPayload | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const importFlow = useCollectionImport({ initialImport, onOpenChange, open })
  const { state } = importFlow
  const autoSortPreviewButtonLabel = importFlow.optionsQuery.loading
    ? "Loading rules..."
    : importFlow.previewAutoSortStatus.loading
      ? "Previewing auto-sort..."
      : "Preview auto-sort"

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : importFlow.close())}
      >
        <DialogContent
          className="manavault-import-dialog flex min-h-0 max-w-5xl flex-col"
          labelledBy="import-collection-title"
        >
          <DialogHeader>
            <div>
              <DialogTitle id="import-collection-title">Import collection</DialogTitle>
              <p className="mt-1 text-sm text-base-content/60">
                Preview CSV or TXT rows before adding exact matches to your collection.
              </p>
            </div>
            <DialogClose onClose={importFlow.close} />
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <CollectionImportForm
              chooseFile={importFlow.chooseFile}
              close={importFlow.close}
              locations={importFlow.locations}
              previewPending={importFlow.previewStatus.loading}
              state={state}
              submitPreview={importFlow.submitPreview}
              update={importFlow.update}
            />
            {state.preview ? (
              <CollectionImportPreview
                preview={state.preview}
                purchaseMode={state.purchaseMode}
                purchasePrice={state.purchasePrice}
                selectCandidate={importFlow.selectCandidate}
              />
            ) : null}
            {state.error ? (
              <p
                role="alert"
                className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
              >
                {state.error}
              </p>
            ) : null}
          </div>

          {state.preview ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 bg-base-100 px-5 py-4">
              <Button
                type="button"
                variant="outline"
                disabled={
                  state.preview.exact === 0 ||
                  importFlow.previewAutoSortStatus.loading ||
                  importFlow.commitStatus.loading
                }
                onClick={() => importFlow.commit(false)}
              >
                <Upload className="h-4 w-4" />
                {importFlow.commitStatus.loading && !state.commitPendingAutoSort
                  ? "Importing..."
                  : "Import exact rows"}
              </Button>
              <Button
                type="button"
                disabled={
                  state.preview.exact === 0 ||
                  importFlow.previewAutoSortStatus.loading ||
                  importFlow.commitStatus.loading ||
                  importFlow.optionsQuery.loading
                }
                onClick={importFlow.previewAutoSort}
              >
                <WandSparkles className="h-4 w-4" />
                {autoSortPreviewButtonLabel}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <AutoSortSetupDialog
        open={state.setupOpen}
        onOpenChange={(setupOpen) => importFlow.update({ setupOpen })}
      />
      <AutoSortSummaryDialog
        open={Boolean(state.autoSortPreview)}
        result={state.autoSortPreview}
        onOpenChange={(open) => !open && importFlow.update({ autoSortPreview: null })}
        applyLabel="Auto-sort and import"
        applyPending={state.commitPendingAutoSort}
        applyPendingLabel="Importing and sorting..."
        onApply={() => importFlow.commit(true)}
        disableApplyWhenNoMoves={false}
        showItemMetadata={false}
      />
    </>
  )
}
