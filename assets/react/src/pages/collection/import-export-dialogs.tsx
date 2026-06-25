import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Upload, WandSparkles } from "lucide-react"
import type * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { request } from "../../lib/graphql"
import type { SharedImportPayload } from "../../lib/native-shared-import"
import { present, titleize } from "../../lib/utils"
import { AutoSortSetupDialog, hasEnabledAutoSortRules } from "./auto-sort-setup-dialog"
import { AutoSortSummaryDialog } from "./auto-sort-summary-dialog"
import {
  CollectionExportCsvDocument,
  CollectionExportTextDocument,
  CollectionItemFormOptionsDocument,
  CommitCollectionImportDocument,
  PreviewCollectionImportAutoSortDocument,
  PreviewCollectionImportDocument,
} from "./documents"
import { printingSetLabel } from "./form-helpers"
import {
  collectionImportCounts,
  commitImportRow,
  importFormatFromSource,
  importStatusLabel,
  importStatusTone,
} from "./import-export-helpers"
import { isUnfiledLocation } from "./location-summary"
import type {
  AutoSortCollectionResult,
  CollectionExportFilters,
  CollectionExportFormat,
  CollectionImportCandidate,
  CollectionImportFormat,
  CollectionImportPreview,
  PreviewCollectionImportValues,
} from "./types"

export function ImportCollectionDialog({
  initialImport,
  onOpenChange,
  open,
}: {
  initialImport?: SharedImportPayload | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const queryClient = useQueryClient()
  const [importText, setImportText] = useState("")
  const [fileName, setFileName] = useState("")
  const [sharedFileName, setSharedFileName] = useState<string | null>(null)
  const [format, setFormat] = useState<CollectionImportFormat>("auto")
  const [locationId, setLocationId] = useState("")
  const [preview, setPreview] = useState<CollectionImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAutoSortSetupOpen, setIsAutoSortSetupOpen] = useState(false)
  const [autoSortPreview, setAutoSortPreview] = useState<AutoSortCollectionResult | null>(null)
  const optionsQuery = useQuery({
    queryKey: ["collection-item-form-options"],
    queryFn: () => request(CollectionItemFormOptionsDocument),
    enabled: open,
  })
  const locations = useMemo(
    () => optionsQuery.data?.locations?.edges?.map((edge) => edge?.node).filter(present) || [],
    [optionsQuery.data],
  )
  const autoSortRules = optionsQuery.data?.collectionAutoSortRules ?? []
  const previewImport = useMutation({
    mutationFn: (values?: PreviewCollectionImportValues) =>
      request(PreviewCollectionImportDocument, {
        input: {
          text: values?.text ?? importText,
          format: values?.format ?? format,
          fileName: (values?.fileName ?? fileName) || null,
          locationId: (values?.locationId ?? locationId) || null,
        },
      }),
    onSuccess: (data) => {
      setPreview(data.previewCollectionImport?.importPreview || null)
      clearAutoSortPreview()
      setError(null)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not preview collection import"),
  })
  const previewImportAutoSort = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("Preview a file before previewing auto-sort")

      return request(PreviewCollectionImportAutoSortDocument, {
        input: {
          rows: preview.rows.map(commitImportRow),
        },
      })
    },
    onSuccess: (data) => {
      setAutoSortPreview(data.previewCollectionImportAutoSort?.autoSortResult ?? null)
      setError(null)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not preview import auto-sort"),
  })
  const commitImport = useMutation({
    mutationFn: ({ autoSort = false }: { autoSort?: boolean } = {}) => {
      if (!preview) throw new Error("Preview a file before importing")
      return request(CommitCollectionImportDocument, {
        input: {
          rows: preview.rows.map(commitImportRow),
          ...(autoSort ? { autoSort: true } : {}),
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection"] })
      queryClient.invalidateQueries({ queryKey: ["collection-items"] })
      queryClient.invalidateQueries({ queryKey: ["location"] })
      queryClient.invalidateQueries({ queryKey: ["home"] })
      reset()
      onOpenChange(false)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not import collection file"),
  })

  useEffect(() => {
    if (!open) reset()
  }, [open])

  useEffect(() => {
    if (open && initialImport?.text) loadSharedImport(initialImport)
  }, [open, initialImport])

  async function chooseFile(file: File | undefined) {
    setError(null)
    setPreview(null)
    setFileName(file?.name || "")
    setSharedFileName(null)
    setFormat(file ? importFormatFromSource(file.name, file.type) : "auto")
    setImportText(file ? await file.text() : "")
    clearAutoSortPreview()
  }

  function loadSharedImport(payload: SharedImportPayload) {
    const nextFileName = payload.fileName || "Shared list"
    const nextFormat = importFormatFromSource(payload.fileName || "", payload.mimeType || "")

    setError(null)
    setPreview(null)
    clearAutoSortPreview()
    setFileName(nextFileName)
    setSharedFileName(nextFileName)
    setFormat(nextFormat)
    setImportText(payload.text)
    previewImport.mutate({
      fileName: nextFileName,
      format: nextFormat,
      locationId,
      text: payload.text,
    })
  }

  function updateImportText(value: string) {
    setImportText(value)
    setPreview(null)
    clearAutoSortPreview()
  }

  function submitPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!importText.trim()) {
      setError("Choose or paste a CSV or TXT file to import")
      return
    }

    previewImport.mutate(undefined)
  }

  function selectCandidate(rowNumber: number, candidate: CollectionImportCandidate) {
    if (!preview) return

    const rows = preview.rows.map((row) =>
      row.rowNumber === rowNumber
        ? {
            ...row,
            status: "exact",
            attrs: { ...row.attrs, scryfallId: candidate.id },
            printing: candidate,
            candidates: [],
          }
        : row,
    )

    setPreview({ ...preview, ...collectionImportCounts(rows), rows })
    clearAutoSortPreview()
  }

  function previewAutoSortBeforeImport() {
    setError(null)

    if (!hasEnabledAutoSortRules(autoSortRules)) {
      setIsAutoSortSetupOpen(true)
      return
    }

    previewImportAutoSort.mutate()
  }

  function commitPreview(autoSort: boolean) {
    setError(null)

    if (autoSort && !hasEnabledAutoSortRules(autoSortRules)) {
      setIsAutoSortSetupOpen(true)
      return
    }

    commitImport.mutate({ autoSort })
  }
  function close() {
    if (previewImport.isPending || previewImportAutoSort.isPending || commitImport.isPending) return
    reset()
    onOpenChange(false)
  }

  function reset() {
    setImportText("")
    setFileName("")
    setSharedFileName(null)
    setFormat("auto")
    setLocationId("")
    setPreview(null)
    setAutoSortPreview(null)
    setError(null)
    setIsAutoSortSetupOpen(false)
  }

  function clearAutoSortPreview() {
    setAutoSortPreview(null)
  }

  const commitPendingAutoSort = commitImport.variables?.autoSort === true
  const autoSortPreviewButtonLabel = optionsQuery.isLoading
    ? "Loading rules..."
    : previewImportAutoSort.isPending
      ? "Previewing auto-sort..."
      : "Preview auto-sort"
  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
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
          <DialogClose onClose={close} />
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <form className="space-y-4" onSubmit={submitPreview}>
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Import location
              </span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">No location</option>
                {locations
                  .filter((location) => !isUnfiledLocation(location))
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} ({titleize(location.kind)})
                    </option>
                  ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                CSV or TXT file
              </span>
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain,text/comma-separated-values,application/vnd.ms-excel"
                className="file-input file-input-bordered w-full bg-base-100"
                onChange={(event) => void chooseFile(event.target.files?.[0])}
              />
              {sharedFileName ? (
                <p className="rounded-box border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  Loaded shared file: {sharedFileName}. The Android file picker may still say no
                  file chosen; the shared TXT is in the import text box below.
                </p>
              ) : fileName ? (
                <p className="text-sm text-base-content/55">{fileName}</p>
              ) : null}
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                File type
              </span>
              <select
                className="select select-bordered w-full bg-base-100"
                value={format}
                onChange={(event) => setFormat(event.target.value as CollectionImportFormat)}
              >
                <option value="auto">Auto-detect</option>
                <option value="csv">CSV</option>
                <option value="txt">TXT list</option>
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Import text
              </span>
              <textarea
                className="textarea textarea-bordered min-h-40 w-full bg-base-100 font-mono text-sm"
                value={importText}
                onChange={(event) => updateImportText(event.target.value)}
                placeholder={"1x Jund Charm (C13) 195\n1x Zuko's Exile (TLA) 3 *F*"}
              />
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={previewImport.isPending}>
                <Upload className="h-4 w-4" />
                {previewImport.isPending ? "Previewing..." : "Preview import"}
              </Button>
            </div>
          </form>

          {preview ? (
            <div className="space-y-3">
              <div className="stats stats-vertical w-full border border-base-300 bg-base-100 shadow-sm sm:stats-horizontal">
                <div className="stat">
                  <div className="stat-title">Rows</div>
                  <div className="stat-value text-2xl">{preview.total}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Exact</div>
                  <div className="stat-value text-2xl text-success">{preview.exact}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Needs review</div>
                  <div className="stat-value text-2xl text-warning">
                    {preview.ambiguous + preview.unresolved}
                  </div>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-box border border-base-300">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Status</th>
                      <th>Card</th>
                      <th>Qty</th>
                      <th>Finish</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>
                          <Badge tone={importStatusTone(row.status)}>
                            {importStatusLabel(row.status)}
                          </Badge>
                        </td>
                        <td>{row.printing?.card?.name || row.attrs.name || "Unknown card"}</td>
                        <td>{row.attrs.quantity}</td>
                        <td>{row.attrs.finish}</td>
                        <td>
                          {row.status === "ambiguous" ? (
                            <div className="flex flex-wrap gap-1">
                              {row.candidates.map((candidate) => (
                                <Button
                                  key={candidate.id}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => selectCandidate(row.rowNumber, candidate)}
                                >
                                  {printingSetLabel({
                                    collectorNumber: candidate.collectorNumber,
                                    rarity: candidate.rarity,
                                    id: candidate.id,
                                    scryfallId: candidate.scryfallId,
                                    setCode: candidate.setCode,
                                    setName: candidate.setName,
                                  })}
                                </Button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-base-content/45">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
            >
              {error}
            </p>
          ) : null}
        </div>
        {preview ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 bg-base-100 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={preview.exact === 0 || previewImportAutoSort.isPending || commitImport.isPending}
              onClick={() => commitPreview(false)}
            >
              <Upload className="h-4 w-4" />
              {commitImport.isPending && !commitPendingAutoSort
                ? "Importing..."
                : "Import exact rows"}
            </Button>
            <Button
              type="button"
              disabled={
                preview.exact === 0 ||
                previewImportAutoSort.isPending ||
                commitImport.isPending ||
                optionsQuery.isLoading
              }
              onClick={previewAutoSortBeforeImport}
            >
              <WandSparkles className="h-4 w-4" />
              {autoSortPreviewButtonLabel}
            </Button>
          </div>
        ) : null}
        </DialogContent>
      </Dialog>
      <AutoSortSetupDialog
        open={isAutoSortSetupOpen}
        onOpenChange={setIsAutoSortSetupOpen}
      />
      <AutoSortSummaryDialog
        open={Boolean(autoSortPreview)}
        result={autoSortPreview}
        onOpenChange={(open) => !open && setAutoSortPreview(null)}
        applyLabel="Auto-sort and import"
        applyPending={commitPendingAutoSort}
        applyPendingLabel="Importing and sorting..."
        onApply={() => commitPreview(true)}
        disableApplyWhenNoMoves={false}
        showItemMetadata={false}
      />
    </>
  )
}

export function ExportCollectionDialog({
  filters,
  format,
  fileName = format === "csv" ? "collection.csv" : "collection.txt",
  onOpenChange,
  open,
  title = format === "csv" ? "Export collection CSV" : "Export collection TXT",
}: {
  fileName?: string
  filters: CollectionExportFilters
  format: CollectionExportFormat
  onOpenChange: (open: boolean) => void
  open: boolean
  title?: string
}) {
  const [exportText, setExportText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const isCsvExport = format === "csv"
  const exportCollection = useMutation({
    mutationFn: async () => {
      if (isCsvExport) {
        const data = await request(CollectionExportCsvDocument, { filters })
        return data.collectionExportCsv
      }

      const data = await request(CollectionExportTextDocument, { filters })
      return data.collectionExportText
    },
    onSuccess: (text) => {
      if (isCsvExport) {
        downloadCollectionExport(text, fileName, "text/csv;charset=utf-8")
        setExportText("")
        setError(null)
        onOpenChange(false)
        return
      }

      setExportText(text)
      setError(null)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : `Could not export ${format.toUpperCase()}`),
  })

  useEffect(() => {
    if (open) exportCollection.mutate()
    else {
      setExportText("")
      setError(null)
    }
  }, [open, format])

  if (isCsvExport && !error) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_2rem)] max-w-4xl overflow-y-auto sm:max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_4rem)]"
        labelledBy="export-collection-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="export-collection-title">{title}</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              {isCsvExport
                ? "The CSV download could not be prepared."
                : "Copy the TXT or save it from the text area."}
            </p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="space-y-4 p-5">
          {isCsvExport ? null : (
            <textarea
              className="textarea textarea-bordered min-h-72 w-full bg-base-100 font-mono text-xs"
              readOnly
              value={exportCollection.isPending ? "Exporting..." : exportText}
            />
          )}
          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function downloadCollectionExport(text: string, fileName: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = sanitizeExportFileName(fileName)
  link.style.display = "none"

  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

function sanitizeExportFileName(fileName: string) {
  const trimmedFileName = fileName.trim()
  const match = /^(.*?)(\.[^.]+)?$/.exec(trimmedFileName)
  const baseName = (match?.[1] || "collection")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const extension = match?.[2]?.toLowerCase() || ".csv"

  return `${baseName || "collection"}${extension}`
}
