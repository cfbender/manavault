import type * as React from "react"
import { useEffect, useRef, useState } from "react"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import {
  buildCollectionFilterQuery,
  cloneCollectionFilters,
  countActiveCollectionFilters,
  type CollectionFilterState,
  type ColorOperator,
  type ComparisonOperator,
  type FinishFilter,
  type ManaColor,
  type RarityFilter,
} from "../../lib/collection-filters"
import { cn, pluralize } from "../../lib/utils"
import {
  COLOR_OPERATOR_OPTIONS,
  COLOR_OPTIONS,
  COMPARISON_OPTIONS,
  RARITY_OPTIONS,
  TYPE_OPTIONS,
} from "./constants"
import { createEmptyCollectionFilters } from "./storage"
import { SetCombobox } from "./set-combobox"

export function CollectionFilterModal({
  filters,
  onApply,
  onClear,
  onClose,
  open,
}: {
  filters: CollectionFilterState
  onApply: (filters: CollectionFilterState) => void
  onClear: () => void
  onClose: () => void
  open: boolean
}) {
  const [draft, setDraft] = useState<CollectionFilterState>(() => cloneCollectionFilters(filters))
  const syntax = buildCollectionFilterQuery(draft)
  const activeCount = countActiveCollectionFilters(draft)
  const { showToast } = useToast()

  useEffect(() => {
    if (open) setDraft(cloneCollectionFilters(filters))
  }, [filters, open])

  if (!open) return null

  function update<K extends keyof CollectionFilterState>(key: K, value: CollectionFilterState[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function resetDraft() {
    setDraft(createEmptyCollectionFilters())
  }

  function clearAndClose() {
    resetDraft()
    onClear()
    showToast("Filters cleared", { tone: "info" })
    onClose()
  }

  function applyDraft() {
    showToast(`${pluralize(activeCount, "filter")} applied`)
    onApply(draft)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent labelledBy="collection-filter-title" className="max-w-4xl">
        <DialogHeader>
          <div>
            <DialogTitle id="collection-filter-title">Filter collection</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Build a Scryfall query from supported collection fields.
            </p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="grid max-h-[calc(100dvh-11rem)] overflow-y-auto lg:grid-cols-[1fr_19rem]">
          <div className="divide-y divide-base-300">
            <FilterSection label="Name" syntax='name:"Black Lotus"'>
              <Input
                value={draft.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Card name"
              />
            </FilterSection>

            <FilterSection label="Oracle text" syntax="oracle:draw">
              <Input
                value={draft.oracle}
                onChange={(event) => update("oracle", event.target.value)}
                placeholder="Rules text"
              />
            </FilterSection>

            <FilterSection label="Type" syntax="type:legendary">
              <TypeCombobox
                value={draft.typeLine}
                onValueChange={(value) => update("typeLine", value)}
              />
            </FilterSection>

            <FilterSection label="Colors" syntax="c:w, c>=uw, c:c">
              <ColorFilterControl
                operator={draft.colorOperator}
                selected={draft.colors}
                onOperatorChange={(operator) => update("colorOperator", operator)}
                onSelectedChange={(colors) => update("colors", colors)}
              />
            </FilterSection>

            <FilterSection label="Color identity" syntax="id:u, id<=esper, id:c">
              <ColorFilterControl
                operator={draft.identityOperator}
                selected={draft.identity}
                onOperatorChange={(operator) => update("identityOperator", operator)}
                onSelectedChange={(identity) => update("identity", identity)}
              />
            </FilterSection>

            <FilterSection label="Mana value" syntax="mv>=3">
              <ComparisonFilterControl
                inputMode="decimal"
                operator={draft.manaValueOperator}
                value={draft.manaValue}
                onOperatorChange={(operator) => update("manaValueOperator", operator)}
                onValueChange={(value) => update("manaValue", value)}
              />
            </FilterSection>

            <FilterSection label="Rarity" syntax="rarity:rare">
              <RarityFilterControl
                selected={draft.rarities}
                onSelectedChange={(rarities) => update("rarities", rarities)}
              />
            </FilterSection>

            <FilterSection label="Printing" syntax="set:lea number:232 lang:ja">
              <div className="grid gap-3 sm:grid-cols-2">
                <SetCombobox value={draft.set} onValueChange={(value) => update("set", value)} />
                <ComparisonFilterControl
                  className="sm:col-start-1"
                  inputMode="numeric"
                  operator={draft.collectorOperator}
                  value={draft.collectorNumber}
                  onOperatorChange={(operator) => update("collectorOperator", operator)}
                  onValueChange={(value) => update("collectorNumber", value)}
                />
                <Input
                  value={draft.language}
                  onChange={(event) => update("language", event.target.value)}
                  placeholder="Language"
                />
              </div>
            </FilterSection>

            <FilterSection label="Finish" syntax="is:foil">
              <SegmentedFilter
                options={[
                  { value: "any", label: "Any" },
                  { value: "foil", label: "Foil" },
                  { value: "nonfoil", label: "Non-foil" },
                  { value: "etched", label: "Etched" },
                ]}
                value={draft.finish}
                onChange={(finish) => update("finish", finish as FinishFilter)}
              />
            </FilterSection>

            <FilterSection label="USD price" syntax="usd<10">
              <ComparisonFilterControl
                inputMode="decimal"
                operator={draft.priceOperator}
                value={draft.priceUsd}
                onOperatorChange={(operator) => update("priceOperator", operator)}
                onValueChange={(value) => update("priceUsd", value)}
              />
            </FilterSection>

            <FilterSection label="Release date" syntax="date>=2020-01-01 year=2024">
              <div className="grid gap-3 sm:grid-cols-2">
                <ComparisonFilterControl
                  className="sm:col-span-2"
                  operator={draft.dateOperator}
                  type="date"
                  value={draft.releasedDate}
                  onOperatorChange={(operator) => update("dateOperator", operator)}
                  onValueChange={(value) => update("releasedDate", value)}
                />
                <ComparisonFilterControl
                  inputMode="numeric"
                  operator={draft.yearOperator}
                  value={draft.releasedYear}
                  onOperatorChange={(operator) => update("yearOperator", operator)}
                  onValueChange={(value) => update("releasedYear", value)}
                  placeholder="Year"
                />
              </div>
            </FilterSection>
          </div>

          <aside className="border-t border-base-300 bg-base-200/40 p-5 lg:border-l lg:border-t-0">
            <div className="sticky top-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black uppercase tracking-[0.22em] text-primary">
                  Scryfall syntax
                </h3>
                <Badge tone={activeCount ? "primary" : "neutral"}>{activeCount} active</Badge>
              </div>
              <div className="min-h-24 rounded-box border border-base-300 bg-base-100 p-3 font-mono text-sm leading-6 text-base-content/80">
                {syntax || (
                  <span className="font-sans text-base-content/45">No filters selected</span>
                )}
              </div>
              <div className="grid gap-2">
                <Button type="button" disabled={!syntax} onClick={applyDraft}>
                  Apply filters
                </Button>
                <Button type="button" variant="outline" onClick={resetDraft}>
                  Reset form
                </Button>
                <Button type="button" variant="ghost" onClick={clearAndClose}>
                  Clear applied filters
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FilterSection({
  children,
  label,
  syntax,
}: {
  children: React.ReactNode
  label: string
  syntax: string
}) {
  return (
    <section className="grid gap-3 px-5 py-4 sm:grid-cols-[9rem_1fr]">
      <div>
        <h3 className="text-[0.68rem] font-black uppercase tracking-[0.28em] text-accent">
          {label}
        </h3>
        <p className="mt-2 font-mono text-[0.68rem] text-base-content/45">{syntax}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function TypeCombobox({
  onValueChange,
  value,
}: {
  onValueChange: (value: string) => void
  value: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const query = value.trim().toLowerCase()
  const options = TYPE_OPTIONS.filter((option) => option.toLowerCase().includes(query))

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  function selectType(type: string) {
    onValueChange(type)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Type or pick..."
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && options.length > 0}
      />
      {open && options.length ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-2xl"
          role="listbox"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              className="block w-full rounded-btn px-3 py-2 text-left text-sm transition-colors hover:bg-base-200"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectType(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ComparisonFilterControl({
  className,
  inputMode,
  onOperatorChange,
  onValueChange,
  operator,
  placeholder = "Value",
  type = "text",
  value,
}: {
  className?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  onOperatorChange: (operator: ComparisonOperator) => void
  onValueChange: (value: string) => void
  operator: ComparisonOperator
  placeholder?: string
  type?: string
  value: string
}) {
  return (
    <div className={cn("grid grid-cols-[5rem_minmax(0,1fr)] gap-2", className)}>
      <select
        className="select select-bordered w-full bg-base-100"
        value={operator}
        onChange={(event) => onOperatorChange(event.target.value as ComparisonOperator)}
        aria-label="Comparison"
      >
        {COMPARISON_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <Input
        inputMode={inputMode}
        type={type}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function ColorFilterControl({
  onOperatorChange,
  onSelectedChange,
  operator,
  selected,
}: {
  onOperatorChange: (operator: ColorOperator) => void
  onSelectedChange: (colors: ManaColor[]) => void
  operator: ColorOperator
  selected: ManaColor[]
}) {
  function toggleColor(color: ManaColor) {
    if (color === "c") {
      onSelectedChange(selected.includes("c") ? [] : ["c"])
      return
    }

    const withoutColorless = selected.filter((value) => value !== "c")
    const next = withoutColorless.includes(color)
      ? withoutColorless.filter((value) => value !== color)
      : [...withoutColorless, color]
    onSelectedChange(next)
  }

  const colorlessSelected = selected.includes("c")

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className="select select-bordered min-w-36 bg-base-100"
        value={operator}
        onChange={(event) => onOperatorChange(event.target.value as ColorOperator)}
        aria-label="Color comparison"
        disabled={colorlessSelected}
      >
        {COLOR_OPERATOR_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        {COLOR_OPTIONS.map((color) => {
          const active = selected.includes(color.value)

          return (
            <button
              key={color.value}
              type="button"
              aria-pressed={active}
              title={color.label}
              className={cn(
                "grid h-9 w-9 place-items-center rounded-full border bg-transparent p-0.5 shadow-sm transition-all",
                active
                  ? "scale-105 border-accent ring-2 ring-accent/60"
                  : "border-transparent opacity-60 hover:opacity-95",
              )}
              onClick={() => toggleColor(color.value)}
            >
              <img
                src={`/scryfall-assets/symbols/${color.symbol}.svg`}
                alt={color.label}
                className="h-8 w-8"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RarityFilterControl({
  onSelectedChange,
  selected,
}: {
  onSelectedChange: (rarities: RarityFilter[]) => void
  selected: RarityFilter[]
}) {
  function toggleRarity(rarity: RarityFilter) {
    onSelectedChange(
      selected.includes(rarity)
        ? selected.filter((value) => value !== rarity)
        : [...selected, rarity],
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {RARITY_OPTIONS.map((rarity) => {
        const active = selected.includes(rarity.value)

        return (
          <button
            key={rarity.value}
            type="button"
            aria-pressed={active}
            className={cn(
              "btn btn-outline btn-sm gap-2",
              active ? "border-primary bg-primary/15 text-primary" : "text-base-content/75",
            )}
            onClick={() => toggleRarity(rarity.value)}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", rarity.className)} />
            {rarity.label}
          </button>
        )
      })}
    </div>
  )
}

function SegmentedFilter<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  value: T
}) {
  return (
    <div className="inline-grid overflow-hidden rounded-btn border border-base-300 sm:auto-cols-fr sm:grid-flow-col">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "border-base-300 px-4 py-2 text-sm font-bold transition-colors [&:not(:last-child)]:border-r",
            value === option.value
              ? "bg-primary text-primary-content"
              : "bg-base-100 text-base-content/65 hover:bg-base-200",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
