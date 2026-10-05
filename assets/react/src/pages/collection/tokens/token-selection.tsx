import { CheckSquare, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"

/**
 * Selecting owned tokens for bulk removal. The token list is small and unpaginated, so
 * "Select all" is just every loaded ID, unlike the collection's all-minus-excluded selection.
 */
export function useTokenSelection(ids: readonly string[], resetKey: string) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())

  const clearSelection = useCallback(() => {
    setSelectionMode(false)
    setSelected(new Set())
  }, [])

  // The filter changed: what was selected may no longer be shown, so start over.
  const lastResetKey = useRef(resetKey)
  useEffect(() => {
    if (lastResetKey.current === resetKey) return
    lastResetKey.current = resetKey
    clearSelection()
  }, [clearSelection, resetKey])

  const loaded = useMemo(() => new Set(ids), [ids])
  const selectedIds = useMemo(
    () => [...selected].filter((id) => loaded.has(id)),
    [loaded, selected],
  )
  const selectionActive = selectionMode || selectedIds.length > 0

  const toggle = useCallback((id: string) => {
    setSelectionMode(true)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectionMode(true)
    setSelected(new Set(ids))
  }, [ids])

  const toggleSelectionMode = useCallback(() => {
    if (selectionActive) clearSelection()
    else setSelectionMode(true)
  }, [clearSelection, selectionActive])

  return {
    allSelected: ids.length > 0 && selectedIds.length === ids.length,
    clearSelection,
    isSelected: (id: string) => selected.has(id),
    selectAll,
    selectedIds,
    selectionActive,
    toggle,
    toggleSelectionMode,
  }
}

export type TokenSelection = ReturnType<typeof useTokenSelection>

export function TokenBulkActionBar({
  onDelete,
  selection,
}: {
  onDelete: () => void
  selection: TokenSelection
}) {
  if (!selection.selectionActive) return null
  const count = selection.selectedIds.length

  return (
    <div className="sticky top-2 z-40 rounded-box border border-primary/30 bg-base-100/95 p-3 shadow-xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={count > 0 ? "primary" : "neutral"}>{count} selected</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={selection.allSelected}
            onClick={selection.selectAll}
          >
            <CheckSquare className="h-4 w-4" />
            Select all
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={selection.clearSelection}>
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={count === 0}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          Remove
        </Button>
      </div>
    </div>
  )
}
