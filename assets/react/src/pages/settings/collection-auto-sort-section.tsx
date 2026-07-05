import {
  ArrowDown,
  ArrowUp,
  Edit3,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
  WandSparkles,
} from "lucide-react"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { PageSection } from "../../components/app-shell"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { cn, titleize } from "../../lib/utils"
import { centsToCurrencyInput, parseCurrencyInputCents } from "../collection/form-helpers"
import { COLOR_OPTIONS, RARITY_OPTIONS } from "../collection/constants"
import type {
  CollectionAutoSortRuleInput,
  CollectionAutoSortSettingsLocation,
  CollectionAutoSortSettingsRule,
} from "./data"
import { Field } from "./ui"

type AutoSortRuleFormRow = {
  colorMode: string
  colors: string[]
  enabled: boolean
  id: string | null
  key: string
  maxPrice: string
  minPrice: string
  name: string
  rarities: string[]
  releaseDate: string
  releaseDateOperator: string
  setCodes: string
  setOperator: string
  targetLocationId: string
  targetLocationKind: string
  targetLocationName: string
  typeLineExcludes: string
  typeLineIncludes: string
}

type StorageLocation = {
  id: string
  kind: string
  name: string
}

type NullableStringList = readonly (string | null | undefined)[] | null | undefined

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

const COLORS = COLOR_OPTIONS.filter((color) => color.value !== "c").map((color) => ({
  label: color.label,
  symbol: color.symbol,
  value: color.value.toUpperCase(),
}))

const COLOR_MODES = [
  { label: "Ignore color", value: "any" },
  { label: "Has any selected color", value: "include_any" },
  { label: "Has all selected colors", value: "include_all" },
  { label: "Has exactly selected colors", value: "exact" },
  { label: "No colors (colorless)", value: "colorless" },
  { label: "Two or more colors (multicolor)", value: "multicolor" },
]

const SET_OPERATORS = [
  { label: "Set is in", value: "in" },
  { label: "Set is not in", value: "not_in" },
]

const RELEASE_DATE_OPERATORS = [
  { label: "Released before", value: "before" },
  { label: "Released after", value: "after" },
]

const RARITIES = [
  {
    ...RARITY_OPTIONS[0],
    activeClassName: "border-zinc-300 bg-zinc-300/15 ring-zinc-300/35",
  },
  {
    ...RARITY_OPTIONS[1],
    activeClassName: "border-slate-400 bg-slate-400/15 ring-slate-400/35",
  },
  {
    ...RARITY_OPTIONS[2],
    activeClassName: "border-yellow-400 bg-yellow-400/15 ring-yellow-400/35",
  },
  {
    ...RARITY_OPTIONS[3],
    activeClassName: "border-orange-400 bg-orange-400/15 ring-orange-400/35",
  },
  {
    value: "special",
    label: "Special",
    className: "bg-fuchsia-300",
    activeClassName: "border-fuchsia-300 bg-fuchsia-300/15 ring-fuchsia-300/35",
  },
  {
    value: "bonus",
    label: "Bonus",
    className: "bg-cyan-300",
    activeClassName: "border-cyan-300 bg-cyan-300/15 ring-cyan-300/35",
  },
]
const RARITY_VALUES = RARITIES.map((rarity) => rarity.value)

let newRuleCounter = 0

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
  const [rows, setRows] = useState<AutoSortRuleFormRow[]>([])
  const [draftRow, setDraftRow] = useState<AutoSortRuleFormRow | null>(null)

  useEffect(() => {
    setRows(
      [...rules].sort(compareRulesByPriority).map((rule) => ruleToFormRow(rule, storageLocations)),
    )
  }, [rules, storageLocations])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const result = formRowsToInput(rows)
    if (typeof result === "string") {
      onValidationError(result)
      return
    }

    onSave(result)
  }

  function previewRules() {
    const result = formRowsToInput(rows)
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

    setDraftRow(newRuleRow(targetLocation))
  }

  function openEditor(row: AutoSortRuleFormRow) {
    setDraftRow(cloneRow(row))
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
    setRows((current) => moveRowByOffset(current, ruleKey, offset))
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
                <PriorityRuleRow
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

      <AutoSortRuleDialog
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

function PriorityRuleRow({
  index,
  isSaving,
  row,
  totalRows,
  onDelete,
  onEdit,
  onMoveDown,
  onMoveUp,
}: {
  index: number
  isSaving: boolean
  row: AutoSortRuleFormRow
  totalRows: number
  onDelete: () => void
  onEdit: () => void
  onMoveDown: () => void
  onMoveUp: () => void
}) {
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

function AutoSortRuleDialog({
  draftRow,
  storageLocations,
  onClose,
  onSave,
  onToggleValue,
  onUpdate,
}: {
  draftRow: AutoSortRuleFormRow | null
  storageLocations: readonly StorageLocation[]
  onClose: () => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onToggleValue: (field: "colors" | "rarities", value: string, selected: boolean) => void
  onUpdate: (changes: Partial<AutoSortRuleFormRow>) => void
}) {
  const fieldId = draftRow
    ? `auto-sort-${draftRow.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`
    : "auto-sort-rule"
  const colorsDisabled = !draftRow || !colorModeUsesSelectedColors(draftRow.colorMode)

  return (
    <Dialog open={Boolean(draftRow)} onOpenChange={(open) => !open && onClose()}>
      {draftRow ? (
        <DialogContent
          className="max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_2rem)] max-w-4xl overflow-y-auto sm:max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_4rem)]"
          labelledBy={`${fieldId}-title`}
        >
          <DialogHeader>
            <div>
              <DialogTitle id={`${fieldId}-title`}>Edit auto-sort rule</DialogTitle>
              <p className="mt-1 text-sm text-base-content/60">
                These criteria are staged locally. Save the rule list to apply them.
              </p>
            </div>
            <DialogClose onClose={onClose} />
          </DialogHeader>

          <form className="space-y-5 p-5" onSubmit={onSave}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Rule name" htmlFor={`${fieldId}-name`}>
                <Input
                  id={`${fieldId}-name`}
                  required
                  value={draftRow.name}
                  onChange={(event) => onUpdate({ name: event.target.value })}
                  placeholder="Mythic rares"
                />
              </Field>

              <Field
                label="Destination"
                htmlFor={`${fieldId}-target`}
                help="Only boxes and binders can receive auto-sorted cards."
              >
                <select
                  id={`${fieldId}-target`}
                  className="select select-bordered w-full bg-base-100"
                  required
                  value={draftRow.targetLocationId}
                  onChange={(event) => {
                    const targetLocation = storageLocations.find(
                      (location) => location.id === event.target.value,
                    )
                    onUpdate({
                      targetLocationId: event.target.value,
                      targetLocationKind: targetLocation?.kind ?? "",
                      targetLocationName: targetLocation?.name ?? "",
                    })
                  }}
                >
                  {storageLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} ({titleize(location.kind)})
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <label className="flex items-center gap-3 rounded-box border border-base-300 bg-base-200/50 p-3 text-sm font-bold">
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={draftRow.enabled}
                onChange={(event) => onUpdate({ enabled: event.target.checked })}
              />
              Enable this rule
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Minimum price"
                htmlFor={`${fieldId}-min-price`}
                help="Blank means no minimum."
              >
                <Input
                  id={`${fieldId}-min-price`}
                  inputMode="decimal"
                  value={draftRow.minPrice}
                  onChange={(event) => onUpdate({ minPrice: event.target.value })}
                  placeholder="3"
                />
              </Field>

              <Field
                label="Maximum price"
                htmlFor={`${fieldId}-max-price`}
                help="Blank means no maximum."
              >
                <Input
                  id={`${fieldId}-max-price`}
                  inputMode="decimal"
                  value={draftRow.maxPrice}
                  onChange={(event) => onUpdate({ maxPrice: event.target.value })}
                  placeholder="25"
                />
              </Field>

              <Field
                label="Sets"
                htmlFor={`${fieldId}-set-codes`}
                help="Comma-separated set codes. Blank ignores set."
              >
                <div className="input input-bordered flex w-full items-center overflow-hidden bg-base-100 p-0 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
                  <select
                    aria-label="Set operator"
                    className="h-full max-w-44 shrink-0 bg-transparent px-3 py-0 text-sm font-semibold text-base-content/60 outline-none"
                    value={draftRow.setOperator}
                    onChange={(event) =>
                      onUpdate({ setOperator: setOperatorValue(event.target.value) })
                    }
                  >
                    {SET_OPERATORS.map((operator) => (
                      <option key={operator.value} value={operator.value}>
                        {operator.label}
                      </option>
                    ))}
                  </select>
                  <input
                    id={`${fieldId}-set-codes`}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 py-0 outline-none placeholder:text-base-content/40"
                    value={draftRow.setCodes}
                    onChange={(event) => onUpdate({ setCodes: event.target.value })}
                    placeholder="lea, dmu, lci"
                  />
                </div>
              </Field>

              <Field
                label="Release date"
                htmlFor={`${fieldId}-release-date`}
                help="Blank ignores release date."
              >
                <div className="input input-bordered flex w-full items-center overflow-hidden bg-base-100 p-0 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
                  <select
                    aria-label="Release date operator"
                    className="h-full max-w-48 shrink-0 bg-transparent px-3 py-0 text-sm font-semibold text-base-content/60 outline-none"
                    value={draftRow.releaseDateOperator}
                    onChange={(event) =>
                      onUpdate({
                        releaseDateOperator: releaseDateOperatorValue(event.target.value),
                      })
                    }
                  >
                    {RELEASE_DATE_OPERATORS.map((operator) => (
                      <option key={operator.value} value={operator.value}>
                        {operator.label}
                      </option>
                    ))}
                  </select>
                  <input
                    id={`${fieldId}-release-date`}
                    type="date"
                    className="h-full min-w-0 flex-1 bg-transparent px-3 py-0 outline-none placeholder:text-base-content/40"
                    value={draftRow.releaseDate}
                    onChange={(event) => onUpdate({ releaseDate: event.target.value })}
                  />
                </div>
              </Field>

              <Field
                label="Type line includes"
                htmlFor={`${fieldId}-type-includes`}
                help="Comma-separated; every value must match."
              >
                <Input
                  id={`${fieldId}-type-includes`}
                  value={draftRow.typeLineIncludes}
                  onChange={(event) => onUpdate({ typeLineIncludes: event.target.value })}
                  placeholder="creature, legendary"
                />
              </Field>

              <Field
                label="Type line excludes"
                htmlFor={`${fieldId}-type-excludes`}
                help="Comma-separated; any match rejects the card."
              >
                <Input
                  id={`${fieldId}-type-excludes`}
                  value={draftRow.typeLineExcludes}
                  onChange={(event) => onUpdate({ typeLineExcludes: event.target.value })}
                  placeholder="token, basic"
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <fieldset className="rounded-box border border-base-300 bg-base-100/70 p-3">
                <legend className="px-1 text-sm font-bold text-base-content">Colors</legend>
                <label
                  htmlFor={`${fieldId}-color-mode`}
                  className="mt-2 block text-sm font-bold text-base-content"
                >
                  Color rule
                </label>
                <select
                  id={`${fieldId}-color-mode`}
                  className="select select-bordered mt-2 w-full bg-base-100"
                  value={draftRow.colorMode}
                  onChange={(event) => {
                    const colorMode = colorModeValue(event.target.value)
                    onUpdate({
                      colorMode,
                      ...(colorModeUsesSelectedColors(colorMode) ? {} : { colors: [] }),
                    })
                  }}
                >
                  {COLOR_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-base-content/60">
                  Double-faced cards use their front-face colors when the catalog provides them.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {COLORS.map((color) => {
                    const active = draftRow.colors.includes(color.value)

                    return (
                      <button
                        key={color.value}
                        type="button"
                        aria-pressed={active}
                        title={color.label}
                        disabled={colorsDisabled}
                        className={cn(
                          "flex min-h-11 items-center gap-2 rounded-box border px-2.5 py-2 text-left text-sm font-bold transition-[border-color,background-color,box-shadow,opacity,transform]",
                          active
                            ? "border-accent bg-accent/10 text-base-content shadow-sm ring-1 ring-accent/35"
                            : "border-base-300 bg-base-100/75 text-base-content/75 hover:border-base-content/25 hover:bg-base-200/70 hover:text-base-content",
                          colorsDisabled &&
                            "cursor-not-allowed opacity-45 hover:border-base-300 hover:bg-base-100/75 hover:text-base-content/75",
                        )}
                        onClick={() => onToggleValue("colors", color.value, !active)}
                      >
                        <img
                          src={`/scryfall-assets/symbols/${color.symbol}.svg`}
                          alt=""
                          className="h-7 w-7 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{color.label}</span>
                      </button>
                    )
                  })}
                </div>
                {colorsDisabled ? (
                  <p className="mt-2 text-xs text-base-content/60">
                    {disabledColorHelp(draftRow.colorMode)}
                  </p>
                ) : null}
              </fieldset>

              <fieldset className="rounded-box border border-base-300 bg-base-100/70 p-3">
                <legend className="px-1 text-sm font-bold text-base-content">Rarities</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {RARITIES.map((rarity) => {
                    const active = draftRow.rarities.includes(rarity.value)

                    return (
                      <button
                        key={rarity.value}
                        type="button"
                        aria-pressed={active}
                        className={cn(
                          "flex min-h-11 items-center gap-2 rounded-box border px-3 py-2 text-left text-sm font-bold transition-[border-color,background-color,box-shadow,transform]",
                          active
                            ? `${rarity.activeClassName} text-base-content shadow-sm ring-1`
                            : "border-base-300 bg-base-100/75 text-base-content/75 hover:border-base-content/25 hover:bg-base-200/70 hover:text-base-content",
                        )}
                        onClick={() => onToggleValue("rarities", rarity.value, !active)}
                      >
                        <span
                          className={cn(
                            "h-3 w-3 shrink-0 rounded-full shadow-sm ring-1 ring-black/15",
                            rarity.className,
                          )}
                        />
                        <span>{rarity.label}</span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            </div>

            <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                <Edit3 className="h-4 w-4" />
                Done
              </Button>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

function isAutoSortStorageLocation(
  location: CollectionAutoSortSettingsLocation,
): location is StorageLocation {
  return location.kind === "box" || location.kind === "binder"
}

function compareRulesByPriority(
  left: CollectionAutoSortSettingsRule,
  right: CollectionAutoSortSettingsRule,
) {
  return (
    (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER) ||
    left.name.localeCompare(right.name)
  )
}

function ruleToFormRow(
  rule: CollectionAutoSortSettingsRule,
  storageLocations: readonly StorageLocation[],
): AutoSortRuleFormRow {
  const targetLocation = storageLocations.find(
    (location) => location.id === rule.targetLocation?.id,
  )
  const targetLocationId = targetLocation?.id ?? rule.targetLocation?.id ?? ""

  return {
    colorMode: colorModeValue(rule.colorMode),
    colors: selectedValues(
      COLORS.map((color) => color.value),
      rule.colors,
    ),
    enabled: rule.enabled,
    id: rule.id,
    key: rule.id,
    maxPrice: centsToCurrencyInput(rule.maxPriceCents),
    minPrice: centsToCurrencyInput(rule.minPriceCents),
    name: rule.name,
    rarities: selectedValues(RARITY_VALUES, rule.rarities),
    releaseDate: rule.releaseDate ?? "",
    releaseDateOperator: releaseDateOperatorValue(rule.releaseDateOperator),
    targetLocationId,
    targetLocationKind: targetLocation?.kind ?? rule.targetLocation?.kind ?? "",
    targetLocationName: targetLocation?.name ?? rule.targetLocation?.name ?? "",
    typeLineExcludes: joinCommaField(rule.typeLineExcludes),
    typeLineIncludes: joinCommaField(rule.typeLineIncludes),
    setCodes: joinCommaField(rule.setCodes),
    setOperator: setOperatorValue(rule.setOperator),
  }
}

function newRuleRow(targetLocation: StorageLocation): AutoSortRuleFormRow {
  newRuleCounter += 1

  return {
    colorMode: "any",
    colors: [],
    enabled: true,
    id: null,
    key: `new-${Date.now()}-${newRuleCounter}`,
    maxPrice: "",
    minPrice: "",
    name: "New auto-sort rule",
    rarities: [],
    releaseDate: "",
    releaseDateOperator: "after",
    targetLocationId: targetLocation.id,
    setCodes: "",
    setOperator: "in",
    targetLocationKind: targetLocation.kind,
    targetLocationName: targetLocation.name,
    typeLineExcludes: "",
    typeLineIncludes: "",
  }
}

function cloneRow(row: AutoSortRuleFormRow): AutoSortRuleFormRow {
  return { ...row, colors: [...row.colors], rarities: [...row.rarities] }
}

function formRowsToInput(rows: AutoSortRuleFormRow[]): CollectionAutoSortRuleInput[] | string {
  const input: CollectionAutoSortRuleInput[] = []

  for (const [index, row] of rows.entries()) {
    const name = row.name.trim()
    if (!name) return "Each auto-sort rule needs a name."
    if (!row.targetLocationId) return `${name}: choose a box or binder destination.`

    const minPriceCents = parseCurrencyInputCents(row.minPrice)
    if (minPriceCents === undefined) return `${name}: minimum price must be a dollar amount.`

    const maxPriceCents = parseCurrencyInputCents(row.maxPrice)
    if (maxPriceCents === undefined) return `${name}: maximum price must be a dollar amount.`

    if (
      typeof minPriceCents === "number" &&
      typeof maxPriceCents === "number" &&
      minPriceCents > maxPriceCents
    ) {
      return `${name}: minimum price cannot be greater than maximum price.`
    }

    const releaseDate = dateInputValue(row.releaseDate)
    if (releaseDate === undefined) return `${name}: release date must be a valid date.`

    input.push({
      ...(row.id ? { id: row.id } : {}),
      colorMode: colorModeValue(row.colorMode),
      colors: colorModeUsesSelectedColors(row.colorMode)
        ? selectedValues(
            COLORS.map((color) => color.value),
            row.colors,
          )
        : [],
      enabled: row.enabled,
      maxPriceCents,
      minPriceCents,
      name,
      priority: index + 1,
      rarities: selectedValues(RARITY_VALUES, row.rarities),
      releaseDate,
      releaseDateOperator: releaseDateOperatorValue(row.releaseDateOperator),
      targetLocationId: row.targetLocationId,
      typeLineExcludes: splitCommaField(row.typeLineExcludes),
      setCodes: splitCommaField(row.setCodes),
      setOperator: setOperatorValue(row.setOperator),
      typeLineIncludes: splitCommaField(row.typeLineIncludes),
    })
  }

  return input
}

function moveRowByOffset(rows: AutoSortRuleFormRow[], ruleKey: string, offset: -1 | 1) {
  const index = rows.findIndex((row) => row.key === ruleKey)
  if (index < 0) return rows

  const nextIndex = index + offset
  if (nextIndex < 0 || nextIndex >= rows.length) return rows

  const nextRows = [...rows]
  const [row] = nextRows.splice(index, 1)
  nextRows.splice(nextIndex, 0, row)
  return nextRows
}

function colorModeValue(value: string | null | undefined) {
  return COLOR_MODES.find((mode) => mode.value === value)?.value ?? "any"
}

function colorModeLabel(value: string) {
  return COLOR_MODES.find((mode) => mode.value === value)?.label ?? "Any color"
}

function setOperatorValue(value: string | null | undefined) {
  return SET_OPERATORS.find((operator) => operator.value === value)?.value ?? "in"
}

function setOperatorLabel(value: string) {
  return SET_OPERATORS.find((operator) => operator.value === value)?.label ?? "Set is in"
}

function releaseDateOperatorValue(value: string | null | undefined) {
  return RELEASE_DATE_OPERATORS.find((operator) => operator.value === value)?.value ?? "after"
}

function releaseDateOperatorLabel(value: string) {
  return (
    RELEASE_DATE_OPERATORS.find((operator) => operator.value === value)?.label ?? "Released after"
  )
}

function colorModeUsesSelectedColors(colorMode: string) {
  return colorMode !== "any" && colorMode !== "colorless" && colorMode !== "multicolor"
}

function disabledColorHelp(colorMode: string) {
  if (colorMode === "any")
    return "Ignore color already matches every card, so selected colors are ignored."
  if (colorMode === "colorless")
    return "No colors means the card has no card colors, so selected colors are ignored."
  if (colorMode === "multicolor")
    return "Two or more colors checks color count, so selected colors are ignored."
  return ""
}

function criteriaSummary(row: AutoSortRuleFormRow) {
  if (!row.enabled) return ["Rule disabled"]

  const items = [
    colorModeSummary(row),
    priceSummary(row),
    setSummary(row),
    releaseDateSummary(row),
    listSummary("Types", splitCommaField(row.typeLineIncludes)),
    listSummary("Excludes", splitCommaField(row.typeLineExcludes)),
    listSummary("Rarities", row.rarities.map(titleize)),
  ].filter((item): item is string => Boolean(item))

  return items.length ? items : ["Matches all cards"]
}

function colorModeSummary(row: AutoSortRuleFormRow) {
  if (row.colorMode === "any" || row.colorMode === "colorless" || row.colorMode === "multicolor") {
    return colorModeLabel(row.colorMode)
  }

  return row.colors.length
    ? `${colorModeLabel(row.colorMode)}: ${row.colors.join("/")}`
    : colorModeLabel(row.colorMode)
}

function priceSummary(row: AutoSortRuleFormRow) {
  const minPrice = row.minPrice.trim().replace(/^\$/, "") || null
  const maxPrice = row.maxPrice.trim().replace(/^\$/, "") || null

  if (minPrice && maxPrice) return `$${minPrice}-$${maxPrice}`
  if (minPrice) return `≥ $${minPrice}`
  if (maxPrice) return `≤ $${maxPrice}`
  return null
}

function setSummary(row: AutoSortRuleFormRow) {
  const setCodes = splitCommaField(row.setCodes).map((code) => code.toUpperCase())
  if (!setCodes.length) return null
  return `${setOperatorLabel(row.setOperator)}: ${setCodes.join(", ")}`
}

function releaseDateSummary(row: AutoSortRuleFormRow) {
  const releaseDate = row.releaseDate.trim()
  if (!releaseDate) return null
  return `${releaseDateOperatorLabel(row.releaseDateOperator)} ${releaseDate}`
}

function listSummary(label: string, values: string[]) {
  return values.length ? `${label}: ${values.join(", ")}` : null
}

function splitCommaField(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function dateInputValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined

  const date = new Date(`${trimmed}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    return undefined
  }

  return trimmed
}

function joinCommaField(values: NullableStringList) {
  return values?.filter((value) => typeof value === "string").join(", ") ?? ""
}

function selectedValues(allowed: readonly string[], values: NullableStringList) {
  return allowed.filter((value) => values?.includes(value) ?? false)
}
