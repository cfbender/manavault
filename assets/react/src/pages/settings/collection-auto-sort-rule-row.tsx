import { ArrowDown, ArrowUp, Edit3, Trash2 } from "lucide-react"
import { Button } from "../../components/ui/button"
import { cn, titleize } from "../../lib/utils"
import { criteriaSummary, type AutoSortRuleFormRow } from "./collection-auto-sort-model"

type CollectionAutoSortRuleRowProps = {
  index: number
  isSaving: boolean
  row: AutoSortRuleFormRow
  totalRows: number
  onDelete: () => void
  onEdit: () => void
  onMoveDown: () => void
  onMoveUp: () => void
}

export function CollectionAutoSortRuleRow({
  index,
  isSaving,
  row,
  totalRows,
  onDelete,
  onEdit,
  onMoveDown,
  onMoveUp,
}: CollectionAutoSortRuleRowProps) {
  const criteria = criteriaSummary(row)

  return (
    <li className="rounded-box border border-base-300 bg-base-100 shadow-sm">
      <div className="grid gap-3 p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-black text-primary">
          {index + 1}
        </span>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-black tracking-normal">{row.name}</h3>
            <span
              className={cn(
                "badge text-xs font-bold",
                row.enabled ? "badge-primary" : "badge-ghost",
              )}
            >
              {row.enabled ? "Enabled" : "Disabled"}
            </span>
            <span className="badge border-transparent bg-base-200 text-xs font-bold">
              To {row.targetLocationName || "Choose destination"}
            </span>
            {row.targetLocationKind ? (
              <span className="badge border-transparent bg-base-200 text-xs font-bold">
                {titleize(row.targetLocationKind)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {criteria.map((item) => (
              <span
                key={item}
                className="rounded-full border border-base-300 bg-base-200/70 px-2.5 py-1 text-xs font-semibold text-base-content/70"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${row.name} up`}
            disabled={isSaving || index === 0}
            onClick={onMoveUp}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${row.name} down`}
            disabled={isSaving || index === totalRows - 1}
            onClick={onMoveDown}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={isSaving} onClick={onEdit}>
            <Edit3 className="h-4 w-4" />
            Edit
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
    </li>
  )
}
