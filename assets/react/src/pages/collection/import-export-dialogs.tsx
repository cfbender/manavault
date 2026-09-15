import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
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
import {
  SELECT_NONE_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import { Textarea } from "../../components/ui/textarea"
import { useToast } from "../../components/ui/toast"
import { refetchActiveQueries } from "../../lib/apollo"
import type { SharedImportPayload } from "../../lib/native-shared-import"
import { pluralize, present, titleize } from "../../lib/utils"
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
import { centsToCurrencyInput, parseCurrencyInputCents, printingSetLabel } from "./form-helpers"
import {
  applyTotalSpend,
  collectionImportCounts,
  commitImportRow,
  importedCardQuantity,
  importFormatFromSource,
  importStatusLabel,
  importStatusTone,
  totalSpendPerCardCents,
} from "./import-export-helpers"
import { isUnfiledLocation } from "./location-summary"
import type {
  AutoSortCollectionResult,
  CollectionExportFilters,
  CollectionExportFormat,
  CollectionImportCandidate,
  CollectionImportFormat,
  CollectionImportPurchaseMode,
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
  const client = useApolloClient()
  const { showToast } = useToast()
  const [importText, setImportText] = useState("")
  const [fileName, setFileName] = useState("")
  const [sharedFileName, setSharedFileName] = useState<string | null>(null)
  const [format, setFormat] = useState<CollectionImportFormat>("auto")
  const [locationId, setLocationId] = useState("")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [purchaseMode, setPurchaseMode] = useState<CollectionImportPurchaseMode>("per_card")
  const [preview, setPreview] = useState<CollectionImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAutoSortSetupOpen, setIsAutoSortSetupOpen] = useState(false)
  const [autoSortPreview, setAutoSortPreview] = useState<AutoSortCollectionResult | null>(null)
  const [commitPendingAutoSort, setCommitPendingAutoSort] = useState(false)
  const optionsQuery = useQuery(CollectionItemFormOptionsDocument, {
    skip: !open,
    fetchPolicy: "cache-and-network",
  })
  const locations = useMemo(
    () => optionsQuery.data?.locations?.edges?.map((edge) => edge?.node).filter(present) || [],
    [optionsQuery.data],
  )
  const autoSortRules = optionsQuery.data?.collectionAutoSortRules ?? []
  const [previewImportMutation, previewImport] = useMutation(PreviewCollectionImportDocument)
  const [previewImportAutoSortMutation, previewImportAutoSort] = useMutation(
    PreviewCollectionImportAutoSortDocument,
  )
  const [commitImportMutation, commitImport] = useMutation(CommitCollectionImportDocument)

  useEffect(() => {
    if (!open) reset()
  }, [open])

  useEffect(() => {
    if (open && initialImport?.text) loadSharedImport(initialImport)
  }, [open, initialImport])

  function previewImportFile(values?: PreviewCollectionImportValues) {
    const priceInput = values?.purchasePrice ?? purchasePrice
    const purchasePriceCents = parseCurrencyInputCents(priceInput)

    if (purchasePriceCents === undefined) {
      setError(purchaseAmountError(purchaseMode))
      return
    }

    void previewImportMutation({
      variables: {
        input: {
          text: values?.text ?? importText,
          format: values?.format ?? format,
          fileName: (values?.fileName ?? fileName) || null,
          locationId: (values?.locationId ?? locationId) || null,
          purchasePriceCents: purchaseMode === "per_card" ? purchasePriceCents : null,
        },
      },
      onCompleted: (data) => {
        const nextPreview = data.previewCollectionImport?.importPreview || null
        setPreview(
          nextPreview && purchaseMode === "total_spend" && purchasePriceCents !== null
            ? { ...nextPreview, rows: applyTotalSpend(nextPreview.rows, purchasePriceCents) }
            : nextPreview,
        )
        clearAutoSortPreview()
        setError(null)
      },
      onError: (error) =>
        setError(error instanceof Error ? error.message : "Could not preview collection import"),
    })
  }

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
    previewImportFile({
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

  function updatePurchasePrice(value: string) {
    setPurchasePrice(value)
    setPreview(null)
    clearAutoSortPreview()
  }

  function updatePurchaseMode(value: string) {
    setPurchaseMode(value as CollectionImportPurchaseMode)
    setPreview(null)
    clearAutoSortPreview()
    setError(null)
  }

  function submitPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!importText.trim()) {
      setError("Choose or paste a CSV or TXT file to import")
      return
    }

    if (parseCurrencyInputCents(purchasePrice) === undefined) {
      setError(purchaseAmountError(purchaseMode))
      return
    }

    previewImportFile()
  }

  function selectCandidate(rowNumber: number, candidate: CollectionImportCandidate) {
    if (!preview) return

    let rows = preview.rows.map((row) =>
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

    const totalSpendCents = parseCurrencyInputCents(purchasePrice)
    if (
      purchaseMode === "total_spend" &&
      totalSpendCents !== null &&
      totalSpendCents !== undefined
    ) {
      rows = applyTotalSpend(rows, totalSpendCents)
    }

    setPreview({ ...preview, ...collectionImportCounts(rows), rows })
    clearAutoSortPreview()
  }

  function previewAutoSortBeforeImport() {
    setError(null)

    if (!hasEnabledAutoSortRules(autoSortRules)) {
      setIsAutoSortSetupOpen(true)
      return
    }

    if (!preview) {
      setError("Preview a file before previewing auto-sort")
      return
    }

    void previewImportAutoSortMutation({
      variables: {
        input: {
          rows: preview.rows.map(commitImportRow),
        },
      },
      onCompleted: (data) => {
        setAutoSortPreview(data.previewCollectionImportAutoSort?.autoSortResult ?? null)
        setError(null)
      },
      onError: (error) =>
        setError(error instanceof Error ? error.message : "Could not preview import auto-sort"),
    })
  }

  function commitPreview(autoSort: boolean) {
    setError(null)

    if (autoSort && !hasEnabledAutoSortRules(autoSortRules)) {
      setIsAutoSortSetupOpen(true)
      return
    }

    if (!preview) {
      setError("Preview a file before importing")
      return
    }

    setCommitPendingAutoSort(autoSort)
    void commitImportMutation({
      variables: {
        input: {
          rows: preview.rows.map(commitImportRow),
          ...(autoSort ? { autoSort: true } : {}),
        },
      },
      onCompleted: (data) => {
        const result = data.commitCollectionImport?.importResult
        const importedCount = result?.imported ?? preview.exact
        const autoSortedCount = result?.autoSorted ?? 0
        const autoSortSuffix =
          autoSortedCount > 0 ? `; ${pluralize(autoSortedCount, "card")} auto-sorted` : ""

        showToast(`${pluralize(importedCount, "card")} imported${autoSortSuffix}`)
        void refetchActiveQueries(client)
        setCommitPendingAutoSort(false)
        reset()
        onOpenChange(false)
      },
      onError: (error) => {
        setCommitPendingAutoSort(false)
        setError(error instanceof Error ? error.message : "Could not import collection file")
      },
    })
  }
  function close() {
    if (previewImport.loading || previewImportAutoSort.loading || commitImport.loading) return
    reset()
    onOpenChange(false)
  }

  function reset() {
    setImportText("")
    setFileName("")
    setSharedFileName(null)
    setFormat("auto")
    setLocationId("")
    setPurchasePrice("")
    setPurchaseMode("per_card")
    setPreview(null)
    setAutoSortPreview(null)
    setError(null)
    setIsAutoSortSetupOpen(false)
    setCommitPendingAutoSort(false)
  }

  function clearAutoSortPreview() {
    setAutoSortPreview(null)
  }

  const autoSortPreviewButtonLabel = optionsQuery.loading
    ? "Loading rules..."
    : previewImportAutoSort.loading
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
                <Select
                  value={locationId || SELECT_NONE_VALUE}
                  onValueChange={(value) => setLocationId(value === SELECT_NONE_VALUE ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>No location</SelectItem>
                    {locations
                      .filter((location) => !isUnfiledLocation(location))
                      .map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name} ({titleize(location.kind)})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  Purchase pricing
                </span>
                <Select value={purchaseMode} onValueChange={updatePurchaseMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_card">Price per card</SelectItem>
                    <SelectItem value="total_spend">Total amount spent</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  {purchaseMode === "total_spend"
                    ? "Total amount spent"
                    : "Purchase price per card"}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input input-bordered w-full bg-base-100"
                  value={purchasePrice}
                  onChange={(event) => updatePurchasePrice(event.target.value)}
                  placeholder={purchaseMode === "total_spend" ? "$439.00" : "$1.00"}
                />
                <p className="text-sm text-base-content/55">
                  {purchaseMode === "total_spend"
                    ? "Divided by the quantity of exact cards in the import and rounded to the nearest cent."
                    : "Optional default for rows without a purchase price column."}
                </p>
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
                  <p className="rounded-box border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                    Opened from another app: “{sharedFileName}”. Review the preview below before
                    importing — nothing is added to your collection until you choose Import. (The
                    Android file picker may still say no file chosen; the shared text is in the box
                    below.)
                  </p>
                ) : fileName ? (
                  <p className="text-sm text-base-content/55">{fileName}</p>
                ) : null}
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  File type
                </span>
                <Select
                  value={format}
                  onValueChange={(value) => setFormat(value as CollectionImportFormat)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="txt">TXT list</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  Import text
                </span>
                <Textarea
                  className="min-h-40 font-mono text-sm"
                  value={importText}
                  onChange={(event) => updateImportText(event.target.value)}
                  placeholder={"1x Jund Charm (C13) 195\n1x Zuko's Exile (TLA) 3 *F*"}
                />
              </label>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={previewImport.loading}>
                  <Upload className="h-4 w-4" />
                  {previewImport.loading ? "Previewing..." : "Preview import"}
                </Button>
              </div>
            </form>

            {preview ? (
              <div className="space-y-3">
                {purchaseMode === "total_spend" ? (
                  <ImportSpendSummary preview={preview} totalSpend={purchasePrice} />
                ) : null}
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
                        <th>Purchase</th>
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
                          <td>{importPurchasePriceText(row.attrs.purchasePriceCents)}</td>
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
                disabled={
                  preview.exact === 0 || previewImportAutoSort.loading || commitImport.loading
                }
                onClick={() => commitPreview(false)}
              >
                <Upload className="h-4 w-4" />
                {commitImport.loading && !commitPendingAutoSort
                  ? "Importing..."
                  : "Import exact rows"}
              </Button>
              <Button
                type="button"
                disabled={
                  preview.exact === 0 ||
                  previewImportAutoSort.loading ||
                  commitImport.loading ||
                  optionsQuery.loading
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
      <AutoSortSetupDialog open={isAutoSortSetupOpen} onOpenChange={setIsAutoSortSetupOpen} />
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

function ImportSpendSummary({
  preview,
  totalSpend,
}: {
  preview: CollectionImportPreview
  totalSpend: string
}) {
  const totalSpendCents = parseCurrencyInputCents(totalSpend)
  if (totalSpendCents === null || totalSpendCents === undefined) return null

  const cardQuantity = importedCardQuantity(preview.rows)
  const purchasePriceCents = totalSpendPerCardCents(totalSpendCents, cardQuantity)

  if (purchasePriceCents === null) {
    return (
      <p className="rounded-box border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
        No exact cards are ready to import, so the total spend cannot be divided yet.
      </p>
    )
  }

  return (
    <div className="rounded-box border border-base-300 bg-base-100 px-4 py-3">
      <p className="text-sm font-bold">Purchase price calculated</p>
      <p className="mt-1 font-mono text-sm tabular-nums text-base-content/70">
        {importPurchasePriceText(totalSpendCents)} ÷ {pluralize(cardQuantity, "card")} ={" "}
        <strong className="text-base-content">
          {importPurchasePriceText(purchasePriceCents)} per card
        </strong>
      </p>
    </div>
  )
}

function purchaseAmountError(mode: CollectionImportPurchaseMode) {
  return mode === "total_spend"
    ? "Total amount spent must be a dollar amount"
    : "Purchase price must be a dollar amount"
}

function importPurchasePriceText(cents?: number | null) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "-"
  return `$${centsToCurrencyInput(cents)}`
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
  const client = useApolloClient()
  const [exportText, setExportText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const { showToast } = useToast()
  const isCsvExport = format === "csv"
  const exportFilters = useMemo(() => filters, [filters.locationId, filters.q])

  useEffect(() => {
    if (!open) {
      setExportText("")
      setError(null)
      setIsExporting(false)
      return
    }

    let ignore = false
    setIsExporting(true)
    setError(null)

    const exportTextPromise = isCsvExport
      ? client
          .query({
            query: CollectionExportCsvDocument,
            variables: { filters: exportFilters },
            fetchPolicy: "network-only",
          })
          .then(({ data }) => data?.collectionExportCsv ?? "")
      : client
          .query({
            query: CollectionExportTextDocument,
            variables: { filters: exportFilters },
            fetchPolicy: "network-only",
          })
          .then(({ data }) => data?.collectionExportText ?? "")

    void exportTextPromise
      .then((text) => {
        if (ignore) return

        if (isCsvExport) {
          downloadCollectionExport(text, fileName, "text/csv;charset=utf-8")
          setExportText("")
          setError(null)
          showToast(`Downloaded ${fileName}`)
          onOpenChange(false)
          return
        }

        setExportText(text)
        setError(null)
        showToast(`${fileName} ready to copy`, { tone: "info" })
      })
      .catch((error) => {
        if (ignore) return
        setError(
          error instanceof Error ? error.message : `Could not export ${format.toUpperCase()}`,
        )
      })
      .finally(() => {
        if (!ignore) setIsExporting(false)
      })

    return () => {
      ignore = true
    }
  }, [client, exportFilters, fileName, format, isCsvExport, open])

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
            <Textarea
              className="min-h-72 font-mono text-xs"
              readOnly
              value={isExporting ? "Exporting..." : exportText}
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
