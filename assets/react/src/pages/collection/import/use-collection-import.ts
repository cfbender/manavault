import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react"
import { useToast } from "../../../components/ui/toast"
import { refetchActiveQueries } from "../../../lib/apollo"
import type { SharedImportPayload } from "../../../lib/native-shared-import"
import { pluralize, present } from "../../../lib/utils"
import { hasEnabledAutoSortRules } from "../auto-sort-setup-dialog"
import { CollectionItemFormOptionsDocument } from "../items/documents"
import {
  applyTotalSpend,
  collectionImportCounts,
  commitImportRow,
  importFormatFromSource,
} from "../import-export-helpers"
import { parseCurrencyInputCents } from "../form-helpers"
import type {
  AutoSortCollectionResult,
  CollectionImportCandidate,
  CollectionImportFormat,
  CollectionImportPreview,
  CollectionImportPurchaseMode,
  PreviewCollectionImportValues,
} from "../types"
import {
  CommitCollectionImportDocument,
  PreviewCollectionImportAutoSortDocument,
  PreviewCollectionImportDocument,
} from "./documents"

export type CollectionImportState = {
  autoSortPreview: AutoSortCollectionResult | null
  commitPendingAutoSort: boolean
  error: string | null
  fileName: string
  format: CollectionImportFormat
  importText: string
  locationId: string
  purchaseMode: CollectionImportPurchaseMode
  purchasePrice: string
  sharedFileName: string | null
  preview: CollectionImportPreview | null
  setupOpen: boolean
}

type ImportAction =
  | { type: "reset" }
  | { type: "update"; values: Partial<CollectionImportState> }
  | { type: "source"; fileName: string; format: CollectionImportFormat; text: string; shared: boolean }
  | { type: "preview"; preview: CollectionImportPreview | null }

const initialState: CollectionImportState = {
  autoSortPreview: null,
  commitPendingAutoSort: false,
  error: null,
  fileName: "",
  format: "auto",
  importText: "",
  locationId: "",
  purchaseMode: "per_card",
  purchasePrice: "",
  sharedFileName: null,
  preview: null,
  setupOpen: false,
}

function importReducer(state: CollectionImportState, action: ImportAction): CollectionImportState {
  if (action.type === "reset") return initialState
  if (action.type === "preview") {
    return { ...state, autoSortPreview: null, error: null, preview: action.preview }
  }
  if (action.type === "source") {
    return {
      ...state,
      autoSortPreview: null,
      error: null,
      fileName: action.fileName,
      format: action.format,
      importText: action.text,
      preview: null,
      sharedFileName: action.shared ? action.fileName : null,
    }
  }
  return { ...state, ...action.values }
}

export function useCollectionImport({
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
  const [state, dispatch] = useReducer(importReducer, initialState)
  const loadedInitialImport = useRef<SharedImportPayload | null>(null)
  const optionsQuery = useQuery(CollectionItemFormOptionsDocument, {
    skip: !open,
    fetchPolicy: "cache-and-network",
  })
  const locations = useMemo(
    () => optionsQuery.data?.locations?.edges?.map((edge) => edge?.node).filter(present) || [],
    [optionsQuery.data],
  )
  const autoSortRules = optionsQuery.data?.collectionAutoSortRules ?? []
  const [previewMutation, previewStatus] = useMutation(PreviewCollectionImportDocument)
  const [previewAutoSortMutation, previewAutoSortStatus] = useMutation(
    PreviewCollectionImportAutoSortDocument,
  )
  const [commitMutation, commitStatus] = useMutation(CommitCollectionImportDocument)

  const previewImport = useCallback(
    (values?: PreviewCollectionImportValues) => {
      const purchasePrice = values?.purchasePrice ?? state.purchasePrice
      const purchasePriceCents = parseCurrencyInputCents(purchasePrice)
      if (purchasePriceCents === undefined) {
        dispatch({ type: "update", values: { error: purchaseAmountError(state.purchaseMode) } })
        return
      }

      void previewMutation({
        variables: {
          input: {
            text: values?.text ?? state.importText,
            format: values?.format ?? state.format,
            fileName: (values?.fileName ?? state.fileName) || null,
            locationId: (values?.locationId ?? state.locationId) || null,
            purchasePriceCents: state.purchaseMode === "per_card" ? purchasePriceCents : null,
          },
        },
        onCompleted: (data) => {
          const preview = data.previewCollectionImport?.importPreview || null
          dispatch({
            type: "preview",
            preview:
              preview && state.purchaseMode === "total_spend" && purchasePriceCents !== null
                ? { ...preview, rows: applyTotalSpend(preview.rows, purchasePriceCents) }
                : preview,
          })
        },
        onError: (error) =>
          dispatch({
            type: "update",
            values: {
              error: error instanceof Error ? error.message : "Could not preview collection import",
            },
          }),
      })
    },
    [previewMutation, state],
  )

  useEffect(() => {
    if (!open) {
      loadedInitialImport.current = null
      dispatch({ type: "reset" })
    }
  }, [open])

  useEffect(() => {
    if (!open || !initialImport?.text || loadedInitialImport.current === initialImport) return
    loadedInitialImport.current = initialImport
    const fileName = initialImport.fileName || "Shared list"
    const format = importFormatFromSource(initialImport.fileName || "", initialImport.mimeType || "")
    dispatch({ type: "source", fileName, format, text: initialImport.text, shared: true })
    previewImport({ fileName, format, locationId: state.locationId, text: initialImport.text })
  }, [initialImport, open, previewImport, state.locationId])

  function update(values: Partial<CollectionImportState>) {
    const invalidatesPreview =
      "importText" in values || "purchaseMode" in values || "purchasePrice" in values
    dispatch({
      type: "update",
      values: {
        ...values,
        ...(invalidatesPreview ? { autoSortPreview: null, preview: null } : {}),
      },
    })
  }

  async function chooseFile(file: File | undefined) {
    const fileName = file?.name || ""
    dispatch({
      type: "source",
      fileName,
      format: file ? importFormatFromSource(file.name, file.type) : "auto",
      text: file ? await file.text() : "",
      shared: false,
    })
  }

  function submitPreview() {
    dispatch({ type: "update", values: { error: null } })
    if (!state.importText.trim()) {
      dispatch({ type: "update", values: { error: "Choose or paste a CSV or TXT file to import" } })
      return
    }
    previewImport()
  }

  function selectCandidate(rowNumber: number, candidate: CollectionImportCandidate) {
    if (!state.preview) return
    let rows = state.preview.rows.map((row) =>
      row.rowNumber === rowNumber
        ? {
            ...row,
            status: "exact" as const,
            attrs: { ...row.attrs, scryfallId: candidate.id },
            printing: candidate,
            candidates: [],
          }
        : row,
    )
    const totalSpendCents = parseCurrencyInputCents(state.purchasePrice)
    if (state.purchaseMode === "total_spend" && totalSpendCents != null) {
      rows = applyTotalSpend(rows, totalSpendCents)
    }
    dispatch({
      type: "preview",
      preview: { ...state.preview, ...collectionImportCounts(rows), rows },
    })
  }

  function previewAutoSort() {
    dispatch({ type: "update", values: { error: null } })
    if (!hasEnabledAutoSortRules(autoSortRules)) {
      dispatch({ type: "update", values: { setupOpen: true } })
      return
    }
    if (!state.preview) {
      dispatch({ type: "update", values: { error: "Preview a file before previewing auto-sort" } })
      return
    }
    void previewAutoSortMutation({
      variables: { input: { rows: state.preview.rows.map(commitImportRow) } },
      onCompleted: (data) =>
        dispatch({
          type: "update",
          values: {
            autoSortPreview: data.previewCollectionImportAutoSort?.autoSortResult ?? null,
            error: null,
          },
        }),
      onError: (error) =>
        dispatch({
          type: "update",
          values: {
            error: error instanceof Error ? error.message : "Could not preview import auto-sort",
          },
        }),
    })
  }

  function commit(autoSort: boolean) {
    dispatch({ type: "update", values: { error: null } })
    if (autoSort && !hasEnabledAutoSortRules(autoSortRules)) {
      dispatch({ type: "update", values: { setupOpen: true } })
      return
    }
    if (!state.preview) {
      dispatch({ type: "update", values: { error: "Preview a file before importing" } })
      return
    }
    dispatch({ type: "update", values: { commitPendingAutoSort: autoSort } })
    void commitMutation({
      variables: {
        input: {
          rows: state.preview.rows.map(commitImportRow),
          ...(autoSort ? { autoSort: true } : {}),
        },
      },
      onCompleted: (data) => {
        const imported = data.commitCollectionImport?.importResult?.imported ?? state.preview?.exact ?? 0
        const sorted = data.commitCollectionImport?.importResult?.autoSorted ?? 0
        showToast(
          `${pluralize(imported, "card")} imported${sorted ? `; ${pluralize(sorted, "card")} auto-sorted` : ""}`,
        )
        void refetchActiveQueries(client)
        dispatch({ type: "reset" })
        onOpenChange(false)
      },
      onError: (error) =>
        dispatch({
          type: "update",
          values: {
            commitPendingAutoSort: false,
            error: error instanceof Error ? error.message : "Could not import collection file",
          },
        }),
    })
  }

  function close() {
    if (previewStatus.loading || previewAutoSortStatus.loading || commitStatus.loading) return
    dispatch({ type: "reset" })
    onOpenChange(false)
  }

  return {
    chooseFile,
    close,
    commit,
    commitStatus,
    locations,
    optionsQuery,
    previewAutoSort,
    previewAutoSortStatus,
    previewStatus,
    selectCandidate,
    state,
    submitPreview,
    update,
  }
}

function purchaseAmountError(mode: CollectionImportPurchaseMode) {
  return mode === "total_spend"
    ? "Total amount spent must be a dollar amount"
    : "Purchase price must be a dollar amount"
}
