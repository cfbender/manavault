import { ChevronDown, ChevronUp, Plus, Save, Tags, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { PageSection } from "../../components/app-shell"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { cn } from "../../lib/utils"
import { DECK_TAG_COLORS } from "../decks/deck-types"

type DefaultDeckTag = {
  id?: string
  name: string
  color: string
  targetCount: number | null
}

type DefaultDeckTagInput = {
  name: string
  color: string
  targetCount: number | null
}

type DefaultDeckTagRow = {
  key: string
  name: string
  color: string
  targetCountInput: string
}

let newRowCounter = 0

export function DefaultDeckTagsSection({
  tags,
  isLoading,
  isSaving,
  onSave,
}: {
  tags: DefaultDeckTag[]
  isLoading: boolean
  isSaving: boolean
  onSave: (tags: DefaultDeckTagInput[]) => void
}) {
  const [rows, setRows] = useState<DefaultDeckTagRow[]>([])

  useEffect(() => {
    setRows(tags.map(tagToFormRow))
  }, [tags])

  const hasBlankName = rows.some((row) => row.name.trim().length === 0)

  function addRow() {
    setRows((current) => [...current, newFormRow()])
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key))
  }

  function updateRow(key: string, changes: Partial<DefaultDeckTagRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)))
  }

  function moveRow(key: string, offset: -1 | 1) {
    setRows((current) => {
      const index = current.findIndex((row) => row.key === key)
      const targetIndex = index + offset
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current

      const next = [...current]
      const [row] = next.splice(index, 1)
      next.splice(targetIndex, 0, row)
      return next
    })
  }

  function save() {
    onSave(formRowsToInput(rows))
  }

  return (
    <PageSection title="Default Deck Tags" count={`${rows.length} tags`}>
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-6 p-6">
          <div className="flex items-start gap-3">
            <Tags className="mt-1 h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-black tracking-normal">Default Deck Tags</h2>
              <p className="mt-1 text-sm text-base-content/60">
                These tags (for example Ramp, Draw, Interact, Plan) are copied into every deck the
                moment it&apos;s created. Editing this list only changes what future decks start
                with &mdash; it never modifies the tags already on existing decks.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4 text-sm text-base-content/60">
              Loading default tags...
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4 text-sm text-base-content/60">
              No default tags. New decks will start with no tags until you add one.
            </div>
          ) : (
            <ol className="space-y-2">
              {rows.map((row, index) => (
                <DefaultDeckTagRowView
                  key={row.key}
                  row={row}
                  index={index}
                  totalRows={rows.length}
                  isSaving={isSaving}
                  onChange={(changes) => updateRow(row.key, changes)}
                  onRemove={() => removeRow(row.key)}
                  onMoveUp={() => moveRow(row.key, -1)}
                  onMoveDown={() => moveRow(row.key, 1)}
                />
              ))}
            </ol>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" disabled={isSaving} onClick={addRow}>
              <Plus className="h-4 w-4" />
              Add tag
            </Button>
            <Button type="button" disabled={isSaving || isLoading || hasBlankName} onClick={save}>
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save defaults"}
            </Button>
          </div>
        </div>
      </div>
    </PageSection>
  )
}

function DefaultDeckTagRowView({
  row,
  index,
  totalRows,
  isSaving,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  row: DefaultDeckTagRow
  index: number
  totalRows: number
  isSaving: boolean
  onChange: (changes: Partial<DefaultDeckTagRow>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const nameFieldId = `default-deck-tag-name-${row.key}`
  const targetFieldId = `default-deck-tag-target-${row.key}`

  return (
    <li className="rounded-box border border-base-300 bg-base-100 p-3 shadow-sm">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_9rem_auto] md:items-end">
        <label className="grid gap-1" htmlFor={nameFieldId}>
          <span className="text-xs font-bold uppercase tracking-wide text-base-content/60">
            Name
          </span>
          <Input
            id={nameFieldId}
            value={row.name}
            placeholder="Tag name"
            disabled={isSaving}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>

        <div className="grid gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-base-content/60">
            Color
          </span>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={`Color for ${row.name || "tag"}`}
          >
            {DECK_TAG_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Use color ${swatch}`}
                aria-pressed={row.color === swatch}
                disabled={isSaving}
                className={cn(
                  "h-6 w-6 rounded-full border-2 transition-transform",
                  row.color === swatch
                    ? "scale-110 border-base-content"
                    : "border-transparent opacity-80 hover:opacity-100",
                )}
                style={{ backgroundColor: swatch }}
                onClick={() => onChange({ color: swatch })}
              />
            ))}
          </div>
        </div>

        <label className="grid gap-1" htmlFor={targetFieldId}>
          <span className="text-xs font-bold uppercase tracking-wide text-base-content/60">
            Target count
          </span>
          <Input
            id={targetFieldId}
            type="number"
            inputMode="numeric"
            min={0}
            value={row.targetCountInput}
            placeholder="No target"
            disabled={isSaving}
            onChange={(event) => onChange({ targetCountInput: event.target.value })}
          />
        </label>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${row.name || "tag"} up`}
            disabled={isSaving || index === 0}
            onClick={onMoveUp}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${row.name || "tag"} down`}
            disabled={isSaving || index === totalRows - 1}
            onClick={onMoveDown}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${row.name || "tag"}`}
            disabled={isSaving}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </li>
  )
}

function tagToFormRow(tag: DefaultDeckTag): DefaultDeckTagRow {
  newRowCounter += 1

  return {
    key: tag.id ?? `existing-${newRowCounter}`,
    name: tag.name,
    color: tag.color,
    targetCountInput: tag.targetCount != null ? String(tag.targetCount) : "",
  }
}

function newFormRow(): DefaultDeckTagRow {
  newRowCounter += 1

  return {
    key: `new-${Date.now()}-${newRowCounter}`,
    name: "",
    color: DECK_TAG_COLORS[0],
    targetCountInput: "",
  }
}

function formRowsToInput(rows: DefaultDeckTagRow[]): DefaultDeckTagInput[] {
  const input: DefaultDeckTagInput[] = []

  for (const row of rows) {
    const name = row.name.trim()
    if (name.length === 0) continue

    const parsedTarget = row.targetCountInput.trim() === "" ? null : Number(row.targetCountInput)
    const targetCount =
      parsedTarget !== null && Number.isFinite(parsedTarget) && parsedTarget > 0
        ? Math.trunc(parsedTarget)
        : null

    input.push({ name, color: row.color, targetCount })
  }

  return input
}
