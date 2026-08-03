import { CheckSquare, Trash2, XCircle } from "lucide-react"
import { useState } from "react"

import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import type { DeckCardUpdateInput } from "../../gql/graphql"
import { DECK_CARD_TAGS, MOVE_TARGET_ZONES, type DeckCardTag, type DeckZone } from "./deck-types"
import { ZoneToggle } from "./zone-toggle"

type DeckDetailSelectionBarProps = {
  allSelected: boolean
  bulkQuantity: number
  error: string | null
  isPending: boolean
  onClear: () => void
  onDeallocate: () => void
  onDelete: () => void
  onOpenSelectFromList: () => void
  onQuantityChange: (quantity: number) => void
  onSelectAll: () => void
  onTag: (tag: DeckCardTag | null) => void
  onUpdate: (input: DeckCardUpdateInput) => void
  selectedAllocatedCount: number
  selectedCount: number
  totalCount: number
}

export function DeckDetailSelectionBar({
  allSelected,
  bulkQuantity,
  error,
  isPending,
  onClear,
  onDeallocate,
  onDelete,
  onOpenSelectFromList,
  onQuantityChange,
  onSelectAll,
  onTag,
  onUpdate,
  selectedAllocatedCount,
  selectedCount,
  totalCount,
}: DeckDetailSelectionBarProps) {
  const [moveZone, setMoveZone] = useState<DeckZone>(MOVE_TARGET_ZONES[0])

  return (
    <div className="grid gap-3 rounded-box border border-base-300 bg-base-100 p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="font-semibold">{selectedCount} selected</span>
          <span className="text-xs text-base-content/60">Shift-click selects a range.</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!totalCount || allSelected}
            onClick={onSelectAll}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!totalCount}
            onClick={onOpenSelectFromList}
          >
            Select from list
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            {selectedCount > 0 ? "Clear" : "Done"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!selectedAllocatedCount || isPending}
            onClick={onDeallocate}
          >
            <XCircle className="h-4 w-4" />
            Deallocate
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!selectedCount || isPending}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ZoneToggle
          zones={MOVE_TARGET_ZONES}
          value={moveZone}
          onChange={setMoveZone}
          disabled={!selectedCount || isPending}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedCount || isPending}
          onClick={() => onUpdate({ zone: moveZone })}
        >
          Move
        </Button>

        <label className="join h-8 items-stretch">
          <span className="join-item flex h-8 min-h-8 items-center border border-base-300 bg-base-200 px-2 text-xs font-semibold">
            Qty
          </span>
          <Input
            className="join-item h-8 min-h-8 w-20"
            type="number"
            min={1}
            value={bulkQuantity}
            disabled={!selectedCount || isPending}
            onChange={(event) =>
              onQuantityChange(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
            }
          />
          <Button
            type="button"
            className="join-item h-8 min-h-8 px-3"
            size="sm"
            disabled={!selectedCount || isPending}
            onClick={() => onUpdate({ quantity: bulkQuantity })}
          >
            Set
          </Button>
        </label>

        <select
          className="select select-bordered select-sm w-44"
          aria-label="Tag selected cards"
          disabled={!selectedCount || isPending}
          defaultValue=""
          onChange={(event) => {
            const value = event.currentTarget.value as DeckCardTag | "clear" | ""
            if (value === "clear") onTag(null)
            else if (value) onTag(value)
            event.currentTarget.value = ""
          }}
        >
          <option value="">Tag selected...</option>
          {DECK_CARD_TAGS.map((tag) => (
            <option key={tag.value} value={tag.value}>
              {tag.label}
            </option>
          ))}
          <option value="clear">Clear tag</option>
        </select>
      </div>
      {error ? (
        <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
