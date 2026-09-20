import { useApolloClient } from "@apollo/client/react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "../../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { Textarea } from "../../../components/ui/textarea"
import { useToast } from "../../../components/ui/toast"
import type { CollectionExportFilters, CollectionExportFormat } from "../types"
import { CollectionExportCsvDocument, CollectionExportTextDocument } from "./documents"

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
        if (!ignore) {
          setError(
            error instanceof Error ? error.message : `Could not export ${format.toUpperCase()}`,
          )
        }
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
  const match = /^(.*?)(\.[^.]+)?$/.exec(fileName.trim())
  const baseName = (match?.[1] || "collection")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${baseName || "collection"}${match?.[2]?.toLowerCase() || ".csv"}`
}
