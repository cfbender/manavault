import { Edit3 } from "lucide-react"
import type { FormEvent } from "react"
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
import { RARITY_OPTIONS } from "../collection/constants"
import {
  AUTO_SORT_COLOR_MODES,
  AUTO_SORT_COLORS,
  AUTO_SORT_RELEASE_DATE_OPERATORS,
  AUTO_SORT_SET_OPERATORS,
  colorModeUsesSelectedColors,
  disabledColorHelp,
  normalizeAutoSortColorMode,
  normalizeAutoSortReleaseDateOperator,
  normalizeAutoSortSetOperator,
  type AutoSortRuleFormRow,
  type StorageLocation,
} from "./collection-auto-sort-model"
import { Field } from "./ui"

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

type CollectionAutoSortRuleDialogProps = {
  draftRow: AutoSortRuleFormRow | null
  storageLocations: readonly StorageLocation[]
  onClose: () => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onToggleValue: (field: "colors" | "rarities", value: string, selected: boolean) => void
  onUpdate: (changes: Partial<AutoSortRuleFormRow>) => void
}

export function CollectionAutoSortRuleDialog({
  draftRow,
  storageLocations,
  onClose,
  onSave,
  onToggleValue,
  onUpdate,
}: CollectionAutoSortRuleDialogProps) {
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
                      onUpdate({ setOperator: normalizeAutoSortSetOperator(event.target.value) })
                    }
                  >
                    {AUTO_SORT_SET_OPERATORS.map((operator) => (
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
                        releaseDateOperator: normalizeAutoSortReleaseDateOperator(
                          event.target.value,
                        ),
                      })
                    }
                  >
                    {AUTO_SORT_RELEASE_DATE_OPERATORS.map((operator) => (
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
                    const colorMode = normalizeAutoSortColorMode(event.target.value)
                    onUpdate({
                      colorMode,
                      ...(colorModeUsesSelectedColors(colorMode) ? {} : { colors: [] }),
                    })
                  }}
                >
                  {AUTO_SORT_COLOR_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-base-content/60">
                  Double-faced cards use their front-face colors when the catalog provides them.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {AUTO_SORT_COLORS.map((color) => {
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
