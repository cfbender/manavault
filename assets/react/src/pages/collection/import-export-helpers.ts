import { titleize } from "../../lib/utils"
import type { CollectionImportFormat, CollectionImportRow } from "./types"

export function importFormatFromSource(
  fileName: string,
  mimeType?: string | null,
): CollectionImportFormat {
  const extension = fileName.trim().toLowerCase().split(".").pop()
  if (extension === "csv") return "csv"
  if (extension === "txt") return "txt"

  const normalizedMime = (mimeType || "").toLowerCase()
  if (normalizedMime.includes("csv") || normalizedMime.includes("excel")) return "csv"
  if (normalizedMime.includes("plain") || normalizedMime.includes("text")) return "txt"

  return "auto"
}

export function collectionImportCounts(rows: CollectionImportRow[]) {
  return {
    exact: rows.filter((row) => row.status === "exact").length,
    ambiguous: rows.filter((row) => row.status === "ambiguous").length,
    unresolved: rows.filter((row) => row.status === "unresolved").length,
  }
}

export function commitImportRow(row: CollectionImportRow) {
  return {
    rowNumber: row.rowNumber,
    status: row.status,
    attrs: {
      name: row.attrs.name,
      setCode: row.attrs.setCode,
      collectorNumber: row.attrs.collectorNumber,
      quantity: row.attrs.quantity,
      finish: row.attrs.finish,
      condition: row.attrs.condition,
      language: row.attrs.language,
      scryfallId: row.attrs.scryfallId,
      locationId: row.attrs.locationId,
      purchasePriceCents: row.attrs.purchasePriceCents,
    },
  }
}

export function importStatusLabel(status: string) {
  if (status === "exact") return "Exact"
  if (status === "ambiguous") return "Review"
  if (status === "unresolved") return "Unresolved"
  return titleize(status)
}

export function importStatusTone(status: string): "neutral" | "success" | "warning" | "error" {
  if (status === "exact") return "success"
  if (status === "ambiguous") return "warning"
  if (status === "unresolved") return "error"
  return "neutral"
}
