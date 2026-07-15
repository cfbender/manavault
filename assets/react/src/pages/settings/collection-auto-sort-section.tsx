import { Plus, Save, SlidersHorizontal, WandSparkles } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { PageSection } from "../../components/app-shell"
import { Button } from "../../components/ui/button"
import type {
  CollectionAutoSortRuleInput,
  CollectionAutoSortSettingsLocation,
  CollectionAutoSortSettingsRule,
} from "./data"
import {
  autoSortRuleInputsEqual,
  cloneAutoSortRuleRow,
  formRowsEqual,
  formRowsToAutoSortRuleInput,
  isAutoSortStorageLocation,
  moveAutoSortRuleRow,
  newAutoSortRuleRow,
  rulesToFormRows,
  type AutoSortRuleFormRow,
} from "./collection-auto-sort-model"
import { CollectionAutoSortRuleDialog } from "./collection-auto-sort-rule-dialog"
import { CollectionAutoSortRuleRow } from "./collection-auto-sort-rule-row"

type CollectionAutoSortSectionProps = {
  isLoading: boolean
  isPreviewing: boolean
  isSaving: boolean
  locations: readonly CollectionAutoSortSettingsLocation[]
  rules: readonly CollectionAutoSortSettingsRule[]
  onPreview: (input: CollectionAutoSortRuleInput[]) => void
  onSave: (input: CollectionAutoSortRuleInput[]) => void
  onValidationError: (message: string) => void
}

export function CollectionAutoSortSection({
  isLoading,
  isPreviewing,
  isSaving,
  locations,
  rules,
  onPreview,
  onSave,
  onValidationError,
}: CollectionAutoSortSectionProps) {
  const storageLocations = useMemo(() => locations.filter(isAutoSortStorageLocation), [locations])
  const incomingRows = useMemo(
    () => rulesToFormRows(rules, storageLocations),
    [rules, storageLocations],
  )
  const [rows, setRows] = useState<AutoSortRuleFormRow[]>([])
  const [committedRows, setCommittedRows] = useState<AutoSortRuleFormRow[]>([])
  const [draftRow, setDraftRow] = useState<AutoSortRuleFormRow | null>(null)
  const pendingSaveInputRef = useRef<CollectionAutoSortRuleInput[] | null>(null)
  const isDirty = !formRowsEqual(rows, committedRows)

  useEffect(() => {
    if (!isDirty) {
      setRows(incomingRows)
      setCommittedRows(incomingRows)
      return
    }

    const pendingSaveInput = pendingSaveInputRef.current
    const incomingInput = formRowsToAutoSortRuleInput(incomingRows)
    if (
      pendingSaveInput &&
      !isSaving &&
      Array.isArray(incomingInput) &&
      autoSortRuleInputsEqual(incomingInput, pendingSaveInput)
    ) {
      pendingSaveInputRef.current = null
      setRows(incomingRows)
      setCommittedRows(incomingRows)
    }
  }, [incomingRows, isDirty, isSaving])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const result = formRowsToAutoSortRuleInput(rows)
    if (typeof result === "string") {
      onValidationError(result)
      return
    }

    pendingSaveInputRef.current = result
    onSave(result)
  }

  function previewRules() {
    const result = formRowsToAutoSortRuleInput(rows)
    if (typeof result === "string") {
      onValidationError(result)
      return
    }

    onPreview(result)
  }

  function addRule() {
    const targetLocation = storageLocations[0]
    if (!targetLocation) {
      onValidationError("Add a box or binder before creating an auto-sort rule.")
      return
    }

    setDraftRow(newAutoSortRuleRow(targetLocation))
  }

  function openEditor(row: AutoSortRuleFormRow) {
    setDraftRow(cloneAutoSortRuleRow(row))
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draftRow) return

    const targetLocation = storageLocations.find(
      (location) => location.id === draftRow.targetLocationId,
    )
    const nextDraft = {
      ...draftRow,
      name: draftRow.name.trim(),
      targetLocationKind: targetLocation?.kind ?? draftRow.targetLocationKind,
      targetLocationName: targetLocation?.name ?? draftRow.targetLocationName,
    }

    setRows((current) => {
      const existingIndex = current.findIndex((row) => row.key === nextDraft.key)
      if (existingIndex < 0) return [...current, nextDraft]

      const nextRows = [...current]
      nextRows[existingIndex] = nextDraft
      return nextRows
    })
    setDraftRow(null)
  }

  function deleteRule(ruleKey: string) {
    setRows((current) => current.filter((row) => row.key !== ruleKey))
    setDraftRow((current) => (current?.key === ruleKey ? null : current))
  }

  function updateDraft(changes: Partial<AutoSortRuleFormRow>) {
    setDraftRow((current) => (current ? { ...current, ...changes } : current))
  }

  function toggleDraftValue(field: "colors" | "rarities", value: string, selected: boolean) {
    setDraftRow((current) => {
      if (!current) return current

      const values = selected
        ? [...current[field], value]
        : current[field].filter((item) => item !== value)

      return { ...current, [field]: values }
    })
  }

  function moveRule(ruleKey: string, offset: -1 | 1) {
    setRows((current) => moveAutoSortRuleRow(current, ruleKey, offset))
  }

  return (
    <PageSection title="Collection auto-sort" count={`${rows.length} rules`}>
      <form onSubmit={submit} className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-6 p-6">
          <div className="flex items-start gap-3">
            <SlidersHorizontal className="mt-1 h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-black tracking-normal">Collection auto-sort</h2>
              <p className="mt-1 text-sm text-base-content/60">
                Create ordered rules that choose a box or binder destination. Auto-sort checks
                enabled rules from top to bottom and moves each matching card to the first matching
                destination. Cards that match no rule are left alone, so unfiled cards remain
                Unfiled unless a rule matches them.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving || isLoading}
              onClick={addRule}
            >
              <Plus className="h-4 w-4" />
              Add rule
            </Button>
            <p className="text-sm text-base-content/60">
              Only boxes and binders can be selected as destinations. Priority numbers are assigned
              from this order when saved.
            </p>
          </div>

          {isLoading ? (
            <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4 text-sm text-base-content/60">
              Loading auto-sort rules...
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4 text-sm text-base-content/60">
              No rules yet. Add a rule to choose criteria and a box or binder destination.
            </div>
          ) : (
            <ol className="space-y-3">
              {rows.map((row, index) => (
                <CollectionAutoSortRuleRow
                  key={row.key}
                  index={index}
                  isSaving={isSaving}
                  row={row}
                  totalRows={rows.length}
                  onDelete={() => deleteRule(row.key)}
                  onEdit={() => openEditor(row)}
                  onMoveDown={() => moveRule(row.key, 1)}
                  onMoveUp={() => moveRule(row.key, -1)}
                />
              ))}
            </ol>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving || isPreviewing || isLoading || rows.length === 0}
              onClick={previewRules}
            >
              <WandSparkles className="h-4 w-4" />
              {isPreviewing ? "Previewing..." : "Preview auto-sort"}
            </Button>
            <Button type="submit" disabled={isSaving || isLoading}>
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save rules"}
            </Button>
            <p className="text-sm text-base-content/60">
              Preview uses the rows shown here. Saving replaces the collection auto-sort rule list.
            </p>
          </div>
        </div>
      </form>

      <CollectionAutoSortRuleDialog
        draftRow={draftRow}
        storageLocations={storageLocations}
        onClose={() => setDraftRow(null)}
        onSave={saveDraft}
        onToggleValue={toggleDraftValue}
        onUpdate={updateDraft}
      />
    </PageSection>
  )
}
