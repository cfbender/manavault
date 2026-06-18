import { Link } from "@tanstack/react-router"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { ArrowDownUp, Boxes, Edit3, ListFilter, MoveUpRight, Plus, Search, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { PageHeader, PageSection } from "../components/app-shell"
import { EmptyState } from "../components/card-image"
import { CardNameSearchField } from "../components/card-name-search-field"
import { addToDeckAction, addToListAction, CardTile } from "../components/card-tile"
import { ImageSummaryCard } from "../components/image-summary-card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { graphql } from "../gql"
import { CollectionItemsPageDocument as GeneratedCollectionItemsPageDocument } from "../gql/graphql"
import { request } from "../lib/graphql"
import { cn, compactNumber, present, titleize } from "../lib/utils"

const CollectionDocument = graphql(`
  query Collection($filters: CollectionItemFilters) {
    locations {
      id
      name
      kind
      itemCount
      totalPriceText
      coverPrinting { artCropUrl }
    }
    collectionItemCount(filters: $filters)
  }
`)

const LocationDocument = graphql(`
  query Location($id: ID!) {
    location(id: $id) {
      id
      name
      kind
      description
      itemCount
      totalPriceText
      coverPrinting { artCropUrl }
    }
  }
`)

const LocationCollectionCountDocument = graphql(`
  query LocationCollectionCount($filters: CollectionItemFilters) {
    collectionItemCount(filters: $filters)
  }
`)

const CollectionItemsPageDocument = graphql(`
  query CollectionItemsPage($filters: CollectionItemFilters, $sort: CollectionItemSort, $limit: Int!, $offset: Int!) {
    collectionItems(filters: $filters, sort: $sort, limit: $limit, offset: $offset) {
      id
      quantity
      condition
      language
      finish
      priceText
      allocatedQuantity
      location { id name }
      printing {
        scryfallId
        setCode
        setName
        collectorNumber
        imageUrl
        rarity
        card { oracleId name typeLine }
      }
    }
  }
`) as typeof GeneratedCollectionItemsPageDocument

const COLLECTION_PAGE_SIZE = 48
const CARD_TILE_WIDTH = 228
const CARD_TILE_ROW_HEIGHT = 352
const CARD_TILE_GAP = 24

type CollectionItem = {
  id: string
  allocatedQuantity?: number | null
  condition: string
  priceText?: string | null
  quantity: number
  finish: string
  location?: { id: string; name: string } | null
  printing?: {
    setCode?: string | null
    setName?: string | null
    collectorNumber?: string | null
    imageUrl?: string | null
    rarity?: string | null
    card?: { oracleId: string; name: string; typeLine?: string | null } | null
  } | null
}

type CollectionTab = "locations" | "all"
type CollectionSortField = "quantity" | "name" | "set" | "rarity" | "price"
type CollectionSortDirection = "asc" | "desc"
type CollectionSort = { field: CollectionSortField; direction: CollectionSortDirection }
type ComparisonOperator = "=" | "!=" | ">" | ">=" | "<" | "<="
type ColorOperator = ":" | ">=" | "<="
type FinishFilter = "any" | "foil" | "nonfoil" | "etched"
type RarityFilter = "common" | "uncommon" | "rare" | "mythic"
type ManaColor = "w" | "u" | "b" | "r" | "g" | "c"

export type CollectionFilterState = {
  name: string
  oracle: string
  typeLine: string
  colors: ManaColor[]
  colorOperator: ColorOperator
  identity: ManaColor[]
  identityOperator: ColorOperator
  manaValueOperator: ComparisonOperator
  manaValue: string
  rarities: RarityFilter[]
  set: string
  collectorOperator: ComparisonOperator
  collectorNumber: string
  language: string
  finish: FinishFilter
  priceOperator: ComparisonOperator
  priceUsd: string
  dateOperator: ComparisonOperator
  releasedDate: string
  yearOperator: ComparisonOperator
  releasedYear: string
}

const SORT_OPTIONS: { field: CollectionSortField; label: string }[] = [
  { field: "quantity", label: "Quantity" },
  { field: "name", label: "Card name" },
  { field: "set", label: "Set" },
  { field: "rarity", label: "Rarity" },
  { field: "price", label: "Price" },
]

export const EMPTY_COLLECTION_FILTERS: CollectionFilterState = {
  name: "",
  oracle: "",
  typeLine: "",
  colors: [],
  colorOperator: ":",
  identity: [],
  identityOperator: ":",
  manaValueOperator: "=",
  manaValue: "",
  rarities: [],
  set: "",
  collectorOperator: "=",
  collectorNumber: "",
  language: "",
  finish: "any",
  priceOperator: ">=",
  priceUsd: "",
  dateOperator: ">=",
  releasedDate: "",
  yearOperator: ">=",
  releasedYear: "",
}

const COLOR_OPTIONS: { value: ManaColor; label: string; symbol: string }[] = [
  { value: "w", label: "White", symbol: "W" },
  { value: "u", label: "Blue", symbol: "U" },
  { value: "b", label: "Black", symbol: "B" },
  { value: "r", label: "Red", symbol: "R" },
  { value: "g", label: "Green", symbol: "G" },
  { value: "c", label: "Colorless", symbol: "C" },
]

const RARITY_OPTIONS: { value: RarityFilter; label: string; className: string }[] = [
  { value: "common", label: "Common", className: "bg-zinc-300" },
  { value: "uncommon", label: "Uncommon", className: "bg-slate-400" },
  { value: "rare", label: "Rare", className: "bg-yellow-400" },
  { value: "mythic", label: "Mythic", className: "bg-orange-400" },
]

const COMPARISON_OPTIONS: ComparisonOperator[] = ["=", "!=", ">", ">=", "<", "<="]
const COLOR_OPERATOR_OPTIONS: { value: ColorOperator; label: string }[] = [
  { value: ":", label: "Exactly" },
  { value: ">=", label: "Includes" },
  { value: "<=", label: "At most" },
]

const TYPE_OPTIONS = [
  "Creature",
  "Land",
  "Artifact",
  "Enchantment",
  "Instant",
  "Sorcery",
  "Planeswalker",
  "Battle",
  "Legendary",
  "Basic",
  "Token",
  "Kindred",
]

function VirtualizedCollectionGrid({
  hasNextPage,
  isFetchingNextPage,
  items,
  onLoadMore,
}: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  items: CollectionItem[]
  onLoadMore: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(1)
  const [range, setRange] = useState({ startRow: 0, endRow: 8 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateColumns = () => {
      const width = container.getBoundingClientRect().width
      setColumns(Math.max(1, Math.floor((width + CARD_TILE_GAP) / (CARD_TILE_WIDTH + CARD_TILE_GAP))))
    }

    updateColumns()
    const resizeObserver = new ResizeObserver(updateColumns)
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const scrollParent = document.querySelector(".app-shell-main")
    const scrollTarget = scrollParent || window
    let frame = 0

    const updateRange = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const container = containerRef.current
        if (!container) return

        const rect = container.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        const overscan = CARD_TILE_ROW_HEIGHT * 3
        const visibleTop = Math.max(0, -rect.top - overscan)
        const visibleBottom = Math.min(rowCount * CARD_TILE_ROW_HEIGHT, viewportHeight - rect.top + overscan)
        const startRow = Math.max(0, Math.floor(visibleTop / CARD_TILE_ROW_HEIGHT))
        const endRow = Math.max(startRow + 1, Math.ceil(visibleBottom / CARD_TILE_ROW_HEIGHT))

        setRange({ startRow, endRow })
      })
    }

    updateRange()
    scrollTarget.addEventListener("scroll", updateRange, { passive: true })
    window.addEventListener("resize", updateRange)

    return () => {
      cancelAnimationFrame(frame)
      scrollTarget.removeEventListener("scroll", updateRange)
      window.removeEventListener("resize", updateRange)
    }
  }, [columns, items.length])

  const rowCount = Math.ceil(items.length / columns)
  const totalHeight = Math.max(0, rowCount * CARD_TILE_ROW_HEIGHT - CARD_TILE_GAP)
  const startIndex = range.startRow * columns
  const endIndex = Math.min(items.length, range.endRow * columns)
  const visibleItems = items.slice(startIndex, endIndex)

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && endIndex >= items.length - columns * 4) {
      onLoadMore()
    }
  }, [columns, endIndex, hasNextPage, isFetchingNextPage, items.length, onLoadMore])

  if (!items.length) return <EmptyState title="No collection items found" />

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: totalHeight }}>
      <div
        className="grid justify-center gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(14.25rem,14.25rem))]"
        style={{ transform: `translateY(${range.startRow * CARD_TILE_ROW_HEIGHT}px)` }}
      >
        {visibleItems.map(item => (
          <CollectionItemTile key={item.id} item={item} />
        ))}
      </div>
      {isFetchingNextPage ? <div className="absolute inset-x-0 bottom-0 py-6"><EmptyState title="Loading more..." /></div> : null}
    </div>
  )
}

function CollectionItemTile({ item }: { item: CollectionItem }) {
  return (
    <CardTile
      allocatedLabel={item.allocatedQuantity ? `In deck${item.allocatedQuantity > 1 ? ` x${item.allocatedQuantity}` : ""}` : undefined}
      count={item.quantity}
      defaultActions={[
        { icon: <MoveUpRight className="h-4 w-4" />, label: "Move", disabled: true },
        {
          content: (
            <Link to="/collection/$id/edit" params={{ id: item.id }}>
              <Edit3 className="h-4 w-4" />
              Edit
            </Link>
          ),
          label: "Edit",
        },
        { destructive: true, icon: <Trash2 className="h-4 w-4" />, label: "Delete", disabled: true },
      ]}
      finish={item.finish}
      imageUrl={item.printing?.imageUrl}
      location={item.location?.name}
      menuActions={[addToDeckAction(), addToListAction()]}
      name={
        <Link to="/cards/$id" params={{ id: item.printing?.card?.oracleId || "" }} className="hover:underline">
          {item.printing?.card?.name || "Unknown card"}
        </Link>
      }
      price={item.priceText}
      rarity={item.printing?.rarity}
      setCode={item.printing?.setCode}
      setLabel={`${item.printing?.setCode?.toUpperCase() || "?"} #${item.printing?.collectorNumber || "?"}`}
      setName={item.printing?.setName}
      typeLine={item.printing?.card?.typeLine}
    />
  )
}

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

  useEffect(() => {
    if (open) setDraft(cloneCollectionFilters(filters))
  }, [filters, open])

  if (!open) return null

  function update<K extends keyof CollectionFilterState>(key: K, value: CollectionFilterState[K]) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  function resetDraft() {
    setDraft(cloneCollectionFilters(EMPTY_COLLECTION_FILTERS))
  }

  function clearAndClose() {
    resetDraft()
    onClear()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={nextOpen => !nextOpen && onClose()}>
      <DialogContent labelledBy="collection-filter-title" className="max-w-4xl">
        <DialogHeader>
          <div>
            <DialogTitle id="collection-filter-title">Filter collection</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">Build a Scryfall query from supported collection fields.</p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="grid max-h-[calc(100vh-11rem)] overflow-y-auto lg:grid-cols-[1fr_19rem]">
          <div className="divide-y divide-base-300">
            <FilterSection label="Name" syntax="name:&quot;Black Lotus&quot;">
              <Input value={draft.name} onChange={event => update("name", event.target.value)} placeholder="Card name" />
            </FilterSection>

            <FilterSection label="Oracle text" syntax="oracle:draw">
              <Input value={draft.oracle} onChange={event => update("oracle", event.target.value)} placeholder="Rules text" />
            </FilterSection>

            <FilterSection label="Type" syntax="type:legendary">
              <TypeCombobox value={draft.typeLine} onValueChange={value => update("typeLine", value)} />
            </FilterSection>

            <FilterSection label="Colors" syntax="c:w, c>=uw, c:c">
              <ColorFilterControl
                operator={draft.colorOperator}
                selected={draft.colors}
                onOperatorChange={operator => update("colorOperator", operator)}
                onSelectedChange={colors => update("colors", colors)}
              />
            </FilterSection>

            <FilterSection label="Color identity" syntax="id:u, id<=esper, id:c">
              <ColorFilterControl
                operator={draft.identityOperator}
                selected={draft.identity}
                onOperatorChange={operator => update("identityOperator", operator)}
                onSelectedChange={identity => update("identity", identity)}
              />
            </FilterSection>

            <FilterSection label="Mana value" syntax="mv>=3">
              <ComparisonFilterControl
                inputMode="decimal"
                operator={draft.manaValueOperator}
                value={draft.manaValue}
                onOperatorChange={operator => update("manaValueOperator", operator)}
                onValueChange={value => update("manaValue", value)}
              />
            </FilterSection>

            <FilterSection label="Rarity" syntax="rarity:rare">
              <RarityFilterControl selected={draft.rarities} onSelectedChange={rarities => update("rarities", rarities)} />
            </FilterSection>

            <FilterSection label="Printing" syntax="set:lea number:232 lang:ja">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={draft.set} onChange={event => update("set", event.target.value)} placeholder="Set code or name" />
                <ComparisonFilterControl
                  className="sm:col-start-1"
                  inputMode="numeric"
                  operator={draft.collectorOperator}
                  value={draft.collectorNumber}
                  onOperatorChange={operator => update("collectorOperator", operator)}
                  onValueChange={value => update("collectorNumber", value)}
                />
                <Input value={draft.language} onChange={event => update("language", event.target.value)} placeholder="Language" />
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
                onChange={finish => update("finish", finish as FinishFilter)}
              />
            </FilterSection>

            <FilterSection label="USD price" syntax="usd<10">
              <ComparisonFilterControl
                inputMode="decimal"
                operator={draft.priceOperator}
                value={draft.priceUsd}
                onOperatorChange={operator => update("priceOperator", operator)}
                onValueChange={value => update("priceUsd", value)}
              />
            </FilterSection>

            <FilterSection label="Release date" syntax="date>=2020-01-01 year=2024">
              <div className="grid gap-3 sm:grid-cols-2">
                <ComparisonFilterControl
                  className="sm:col-span-2"
                  operator={draft.dateOperator}
                  type="date"
                  value={draft.releasedDate}
                  onOperatorChange={operator => update("dateOperator", operator)}
                  onValueChange={value => update("releasedDate", value)}
                />
                <ComparisonFilterControl
                  inputMode="numeric"
                  operator={draft.yearOperator}
                  value={draft.releasedYear}
                  onOperatorChange={operator => update("yearOperator", operator)}
                  onValueChange={value => update("releasedYear", value)}
                  placeholder="Year"
                />
              </div>
            </FilterSection>
          </div>

          <aside className="border-t border-base-300 bg-base-200/40 p-5 lg:border-l lg:border-t-0">
            <div className="sticky top-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black uppercase tracking-[0.22em] text-primary">Scryfall syntax</h3>
                <Badge tone={activeCount ? "primary" : "neutral"}>{activeCount} active</Badge>
              </div>
              <div className="min-h-24 rounded-box border border-base-300 bg-base-100 p-3 font-mono text-sm leading-6 text-base-content/80">
                {syntax || <span className="font-sans text-base-content/45">No filters selected</span>}
              </div>
              <div className="grid gap-2">
                <Button type="button" disabled={!syntax} onClick={() => onApply(draft)}>
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
        <h3 className="text-[0.68rem] font-black uppercase tracking-[0.28em] text-accent">{label}</h3>
        <p className="mt-2 font-mono text-[0.68rem] text-base-content/45">{syntax}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function TypeCombobox({ onValueChange, value }: { onValueChange: (value: string) => void; value: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const query = value.trim().toLowerCase()
  const options = TYPE_OPTIONS.filter(option => option.toLowerCase().includes(query))

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
        onChange={event => {
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
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-2xl" role="listbox">
          {options.map(option => (
            <button
              key={option}
              type="button"
              role="option"
              className="block w-full rounded-btn px-3 py-2 text-left text-sm transition-colors hover:bg-base-200"
              onMouseDown={event => event.preventDefault()}
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
        onChange={event => onOperatorChange(event.target.value as ComparisonOperator)}
        aria-label="Comparison"
      >
        {COMPARISON_OPTIONS.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <Input inputMode={inputMode} type={type} value={value} onChange={event => onValueChange(event.target.value)} placeholder={placeholder} />
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

    const withoutColorless = selected.filter(value => value !== "c")
    const next = withoutColorless.includes(color) ? withoutColorless.filter(value => value !== color) : [...withoutColorless, color]
    onSelectedChange(next)
  }

  const colorlessSelected = selected.includes("c")

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className="select select-bordered min-w-36 bg-base-100"
        value={operator}
        onChange={event => onOperatorChange(event.target.value as ColorOperator)}
        aria-label="Color comparison"
        disabled={colorlessSelected}
      >
        {COLOR_OPERATOR_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        {COLOR_OPTIONS.map(color => {
          const active = selected.includes(color.value)

          return (
            <button
              key={color.value}
              type="button"
              aria-pressed={active}
              title={color.label}
              className={cn(
                "grid h-9 w-9 place-items-center rounded-full border bg-transparent p-0.5 shadow-sm transition-all",
                active ? "scale-105 border-accent ring-2 ring-accent/60" : "border-transparent opacity-60 hover:opacity-95"
              )}
              onClick={() => toggleColor(color.value)}
            >
              <img src={`/scryfall-assets/symbols/${color.symbol}.svg`} alt={color.label} className="h-8 w-8" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function buildCollectionFilterQuery(filters: CollectionFilterState) {
  const terms = [
    textPredicate("name", filters.name),
    textPredicate("oracle", filters.oracle),
    textPredicate("type", filters.typeLine),
    colorPredicate("c", filters.colorOperator, filters.colors),
    colorPredicate("id", filters.identityOperator, filters.identity),
    comparisonPredicate("mv", filters.manaValueOperator, filters.manaValue),
    rarityPredicate(filters.rarities),
    textPredicate("set", filters.set),
    comparisonPredicate("number", filters.collectorOperator, filters.collectorNumber),
    textPredicate("lang", filters.language),
    filters.finish === "any" ? "" : `is:${filters.finish}`,
    comparisonPredicate("usd", filters.priceOperator, filters.priceUsd),
    comparisonPredicate("date", filters.dateOperator, filters.releasedDate),
    comparisonPredicate("year", filters.yearOperator, filters.releasedYear),
  ].filter(Boolean)

  return terms.join(" ")
}

export function combineCollectionQueries(...parts: string[]) {
  return parts
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `(${part})`)
    .join(" ")
}

export function countActiveCollectionFilters(filters: CollectionFilterState) {
  return [
    filters.name.trim(),
    filters.oracle.trim(),
    filters.typeLine.trim(),
    filters.colors.length,
    filters.identity.length,
    filters.manaValue.trim(),
    filters.rarities.length,
    filters.set.trim(),
    filters.collectorNumber.trim(),
    filters.language.trim(),
    filters.finish !== "any",
    filters.priceUsd.trim(),
    filters.releasedDate.trim(),
    filters.releasedYear.trim(),
  ].filter(Boolean).length
}

export function cloneCollectionFilters(filters: CollectionFilterState): CollectionFilterState {
  return {
    ...filters,
    colors: [...filters.colors],
    identity: [...filters.identity],
    rarities: [...filters.rarities],
  }
}

function textPredicate(field: string, value: string) {
  const trimmed = value.trim()
  return trimmed ? `${field}:${quoteScryfallValue(trimmed)}` : ""
}

function comparisonPredicate(field: string, operator: ComparisonOperator, value: string) {
  const trimmed = value.trim()
  return trimmed ? `${field}${operator}${quoteScryfallValue(trimmed)}` : ""
}

function colorPredicate(field: "c" | "id", operator: ColorOperator, colors: ManaColor[]) {
  if (!colors.length) return ""
  if (colors.includes("c")) return `${field}:c`

  return `${field}${operator}${colors.join("")}`
}

function rarityPredicate(rarities: RarityFilter[]) {
  if (!rarities.length) return ""

  const terms = rarities.map(rarity => `rarity:${rarity}`)
  return terms.length === 1 ? terms[0] : `(${terms.join(" or ")})`
}

function quoteScryfallValue(value: string) {
  return /[\s()"]/.test(value) ? `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"` : value
}

function RarityFilterControl({
  onSelectedChange,
  selected,
}: {
  onSelectedChange: (rarities: RarityFilter[]) => void
  selected: RarityFilter[]
}) {
  function toggleRarity(rarity: RarityFilter) {
    onSelectedChange(selected.includes(rarity) ? selected.filter(value => value !== rarity) : [...selected, rarity])
  }

  return (
    <div className="flex flex-wrap gap-2">
      {RARITY_OPTIONS.map(rarity => {
        const active = selected.includes(rarity.value)

        return (
          <button
            key={rarity.value}
            type="button"
            aria-pressed={active}
            className={cn(
              "btn btn-outline btn-sm gap-2",
              active ? "border-primary bg-primary/15 text-primary" : "text-base-content/75"
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
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "border-base-300 px-4 py-2 text-sm font-bold transition-colors [&:not(:last-child)]:border-r",
            value === option.value ? "bg-primary text-primary-content" : "bg-base-100 text-base-content/65 hover:bg-base-200"
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function CollectionPage() {
  const [activeTab, setActiveTab] = useState<CollectionTab>("locations")
  const [q, setQ] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [sort, setSort] = useState<CollectionSort>({ field: "name", direction: "asc" })
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [structuredFilters, setStructuredFilters] = useState<CollectionFilterState>(EMPTY_COLLECTION_FILTERS)
  const structuredFilterSyntax = buildCollectionFilterQuery(structuredFilters)
  const combinedCollectionQuery = combineCollectionQueries(appliedSearch, structuredFilterSyntax)
  const filters = useMemo(() => (combinedCollectionQuery ? { q: combinedCollectionQuery } : {}), [combinedCollectionQuery])
  const { data, isLoading } = useQuery({
    queryKey: ["collection", filters],
    queryFn: () => request(CollectionDocument, { filters }),
  })
  const allItemsQuery = useInfiniteQuery({
    queryKey: ["collection-items", "all", filters, sort],
    queryFn: ({ pageParam }) =>
      request(CollectionItemsPageDocument, {
        filters,
        sort,
        limit: COLLECTION_PAGE_SIZE,
        offset: pageParam,
      }),
    enabled: activeTab === "all",
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.collectionItems.length < COLLECTION_PAGE_SIZE ? undefined : lastPageParam + COLLECTION_PAGE_SIZE,
  })
  const allCollectionItems = useMemo(
    () => allItemsQuery.data?.pages.flatMap(page => page.collectionItems).filter(present) || [],
    [allItemsQuery.data]
  )
  const hasCollectionFilters = Boolean(combinedCollectionQuery)
  const activeStructuredFilterCount = countActiveCollectionFilters(structuredFilters)
  const filterBadgeCount = activeStructuredFilterCount
  const collectionCountLabel = `${data?.collectionItemCount || 0} ${hasCollectionFilters ? "shown" : "total"}`
  const loadMoreAllItems = useCallback(() => {
    void allItemsQuery.fetchNextPage()
  }, [allItemsQuery])
  const locationGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof data>["locations"]>()

    for (const location of data?.locations || []) {
      const kind = location.kind || "other"
      groups.set(kind, [...(groups.get(kind) || []), location])
    }

    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right))
  }, [data?.locations])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    applyCollectionSearch(q)
  }

  function applyCollectionSearch(value: string) {
    setQ(value)
    setAppliedSearch(value.trim())
  }

  function updateCollectionSearchDraft(value: string) {
    setQ(value)
    if (!value.trim()) setAppliedSearch("")
  }

  function clearCollectionSearch() {
    setQ("")
    setAppliedSearch("")
  }

  function clearStructuredFilters() {
    setStructuredFilters(EMPTY_COLLECTION_FILTERS)
  }

  function clearAllCollectionFilters() {
    clearCollectionSearch()
    clearStructuredFilters()
  }

  function applyStructuredFilters(nextFilters: CollectionFilterState) {
    setStructuredFilters(nextFilters)
    setIsFilterModalOpen(false)
  }

  function selectTab(tab: CollectionTab) {
    if (activeTab === "all" && tab !== "all") clearAllCollectionFilters()
    setActiveTab(tab)
  }

  return (
    <>
      <PageHeader
        title="Collection"
        eyebrow="ManaVault Inventory"
        description="Your boxes, binders, lists, and owned printings."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/cards">
                <Search className="h-4 w-4" />
                Find cards
              </Link>
            </Button>
            <Button asChild>
              <Link to="/collection/new">
                <Plus className="h-4 w-4" />
                Add item
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-7 flex flex-wrap gap-2 border-b border-base-300" role="tablist" aria-label="Collection view">
        <CollectionTabButton
          active={activeTab === "locations"}
          count={data?.locations?.length || 0}
          label="Locations"
          onClick={() => selectTab("locations")}
        />
        <CollectionTabButton
          active={activeTab === "all"}
          count={data?.collectionItemCount || 0}
          label="All"
          onClick={() => selectTab("all")}
        />
      </div>

      {activeTab === "locations" ? (
        <PageSection count={`${data?.locations?.length || 0} total`}>
          {isLoading ? (
            <EmptyState title="Loading locations..." />
          ) : locationGroups.length ? (
            <div className="space-y-10">
              {locationGroups.map(([kind, locations]) => (
                <section key={kind} className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-black tracking-normal">{titleize(kind)}</h3>
                    <span className="badge border-transparent bg-base-200 text-sm">{locations.length}</span>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    {locations.map(location => (
                      <Link key={location.id} to="/collection/locations/$id" params={{ id: location.id }} className="block">
                        <ImageSummaryCard
                          imageUrl={location.coverPrinting?.artCropUrl}
                          fallback={<Boxes className="h-12 w-12" />}
                          typeLine={<Badge>{titleize(location.kind)}</Badge>}
                          countLine={`${compactNumber(location.itemCount || 0)} cards`}
                          priceLine={location.totalPriceText}
                          nameLine={location.name}
                        />
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState title="No locations found" />
          )}
        </PageSection>
      ) : (
        <div className="space-y-7">
          <form
            onSubmit={submit}
            className="control-toolbar grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-[1fr_auto_auto_auto]"
          >
            <CardNameSearchField
              name="q"
              value={q}
              onValueChange={updateCollectionSearchDraft}
              onClear={clearCollectionSearch}
              onSuggestionSelect={applyCollectionSearch}
              placeholder="Filter collection"
            />
            <SortDropdown sort={sort} onSortChange={setSort} />
            <Button type="button" variant="outline" className="relative" onClick={() => setIsFilterModalOpen(true)}>
              <ListFilter className="h-4 w-4" />
              Filter
              {filterBadgeCount ? <span className="badge badge-primary badge-sm absolute -right-2 -top-2 min-w-5">{filterBadgeCount}</span> : null}
            </Button>
            <Button type="submit">
              <Search className="h-4 w-4" />
              Search
            </Button>
          </form>

          <PageSection count={collectionCountLabel}>
            {allItemsQuery.isLoading ? (
              <EmptyState title="Loading collection..." />
            ) : (
              <VirtualizedCollectionGrid
                hasNextPage={allItemsQuery.hasNextPage}
                isFetchingNextPage={allItemsQuery.isFetchingNextPage}
                items={allCollectionItems}
                onLoadMore={loadMoreAllItems}
              />
            )}
          </PageSection>

          <CollectionFilterModal
            filters={structuredFilters}
            open={isFilterModalOpen}
            onApply={applyStructuredFilters}
            onClear={clearStructuredFilters}
            onClose={() => setIsFilterModalOpen(false)}
          />
        </div>
      )}
    </>
  )
}

function SortDropdown({
  onSortChange,
  sort,
}: {
  onSortChange: (sort: CollectionSort) => void
  sort: CollectionSort
}) {
  const currentOption = SORT_OPTIONS.find(option => option.field === sort.field) || SORT_OPTIONS[1]
  const directionLabel = sort.direction === "asc" ? "Asc" : "Desc"
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeOnOutsideClick)
  }, [open])

  return (
    <div ref={ref} className="dropdown dropdown-end">
      <button
        type="button"
        className="btn btn-outline min-w-44 justify-between gap-2"
        aria-label={`Sort by ${currentOption.label}, ${directionLabel}`}
        onClick={() => setOpen(current => !current)}
      >
        <span className="flex items-center gap-2">
          <ArrowDownUp className="h-4 w-4" />
          Sort
        </span>
        <span className="flex items-center gap-1">
          <span className="badge badge-ghost text-[0.65rem]">{currentOption.label}</span>
          <span className="badge badge-ghost text-[0.65rem]">{directionLabel}</span>
        </span>
      </button>
      {open ? (
        <div className="dropdown-content z-50 mt-2 w-72 rounded-box border border-base-300 bg-base-100 p-3 shadow-2xl">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-box bg-base-200 p-1">
            {(["asc", "desc"] as const).map(direction => (
              <button
                key={direction}
                type="button"
                className={[
                  "rounded-btn px-3 py-2 text-sm font-bold transition-colors",
                  sort.direction === direction ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-100",
                ].join(" ")}
                onClick={() => {
                  onSortChange({ ...sort, direction })
                  setOpen(false)
                }}
              >
                {direction === "asc" ? "Ascending" : "Descending"}
              </button>
            ))}
          </div>

          <div className="grid gap-1">
            {SORT_OPTIONS.map(option => (
              <button
                key={option.field}
                type="button"
                className={[
                  "flex items-center justify-between rounded-btn px-3 py-2 text-left text-sm transition-colors",
                  sort.field === option.field ? "bg-primary/15 text-primary" : "hover:bg-base-200",
                ].join(" ")}
                onClick={() => {
                  onSortChange({ ...sort, field: option.field })
                  setOpen(false)
                }}
              >
                <span className="font-semibold">{option.label}</span>
                {sort.field === option.field ? <span className="badge badge-primary badge-sm">{directionLabel}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CollectionTabButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean
  count: number
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={[
        "relative flex items-center gap-2 px-4 pb-3 pt-1 text-sm font-bold transition-colors",
        active ? "text-primary" : "text-base-content/60 hover:text-base-content",
      ].join(" ")}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={active ? "badge badge-primary badge-sm" : "badge badge-ghost badge-sm"}>{count}</span>
      {active ? <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-primary" /> : null}
    </button>
  )
}

export function LocationPage({ id }: { id: string }) {
  const [q, setQ] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [sort, setSort] = useState<CollectionSort>({ field: "name", direction: "asc" })
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [structuredFilters, setStructuredFilters] = useState<CollectionFilterState>(EMPTY_COLLECTION_FILTERS)
  const structuredFilterSyntax = buildCollectionFilterQuery(structuredFilters)
  const combinedCollectionQuery = combineCollectionQueries(appliedSearch, structuredFilterSyntax)
  const itemFilters = useMemo(
    () => ({
      locationId: id,
      ...(combinedCollectionQuery ? { q: combinedCollectionQuery } : {}),
    }),
    [combinedCollectionQuery, id]
  )
  const { data, isLoading } = useQuery({ queryKey: ["location", id], queryFn: () => request(LocationDocument, { id }) })
  const countQuery = useQuery({
    queryKey: ["collection-items", "location", id, "count", itemFilters],
    queryFn: () => request(LocationCollectionCountDocument, { filters: itemFilters }),
  })
  const itemsQuery = useInfiniteQuery({
    queryKey: ["collection-items", "location", id, itemFilters, sort],
    queryFn: ({ pageParam }) =>
      request(CollectionItemsPageDocument, {
        filters: itemFilters,
        sort,
        limit: COLLECTION_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.collectionItems.length < COLLECTION_PAGE_SIZE ? undefined : lastPageParam + COLLECTION_PAGE_SIZE,
  })
  const collectionItems = useMemo(
    () => itemsQuery.data?.pages.flatMap(page => page.collectionItems).filter(present) || [],
    [itemsQuery.data]
  )
  const loadMore = useCallback(() => {
    void itemsQuery.fetchNextPage()
  }, [itemsQuery])
  const location = data?.location
  const activeStructuredFilterCount = countActiveCollectionFilters(structuredFilters)
  const hasLocationFilters = Boolean(combinedCollectionQuery)
  const locationCountLabel = `${countQuery.data?.collectionItemCount ?? location?.itemCount ?? 0} ${hasLocationFilters ? "shown" : "total"}`

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    applyLocationSearch(q)
  }

  function applyLocationSearch(value: string) {
    setQ(value)
    setAppliedSearch(value.trim())
  }

  function updateLocationSearchDraft(value: string) {
    setQ(value)
    if (!value.trim()) setAppliedSearch("")
  }

  function clearLocationSearch() {
    setQ("")
    setAppliedSearch("")
  }

  function clearStructuredFilters() {
    setStructuredFilters(EMPTY_COLLECTION_FILTERS)
  }

  function applyStructuredFilters(nextFilters: CollectionFilterState) {
    setStructuredFilters(nextFilters)
    setIsFilterModalOpen(false)
  }

  if (isLoading) return <EmptyState title="Loading location..." />
  if (!location) return <EmptyState title="Location not found" />

  return (
    <>
      <div className="mb-7 space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/collection">Back to collection</Link>
        </Button>
        <ImageSummaryCard
          imageUrl={location.coverPrinting?.artCropUrl}
          fallback={<Boxes className="h-12 w-12" />}
          typeLine={<Badge>{titleize(location.kind)}</Badge>}
          countLine={`${compactNumber(location.itemCount || 0)} cards`}
          priceLine={location.totalPriceText}
          nameLine={location.name}
          detailLine={location.description}
          interactive={false}
        />
      </div>
      <form
        onSubmit={submit}
        className="control-toolbar mb-7 grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-[1fr_auto_auto_auto]"
      >
        <CardNameSearchField
          name="q"
          value={q}
          onValueChange={updateLocationSearchDraft}
          onClear={clearLocationSearch}
          onSuggestionSelect={applyLocationSearch}
          placeholder="Filter location"
        />
        <SortDropdown sort={sort} onSortChange={setSort} />
        <Button type="button" variant="outline" className="relative" onClick={() => setIsFilterModalOpen(true)}>
          <ListFilter className="h-4 w-4" />
          Filter
          {activeStructuredFilterCount ? <span className="badge badge-primary badge-sm absolute -right-2 -top-2 min-w-5">{activeStructuredFilterCount}</span> : null}
        </Button>
        <Button type="submit">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>
      {itemsQuery.isLoading ? (
        <EmptyState title="Loading collection..." />
      ) : (
        <PageSection count={locationCountLabel}>
          <VirtualizedCollectionGrid
            hasNextPage={itemsQuery.hasNextPage}
            isFetchingNextPage={itemsQuery.isFetchingNextPage}
            items={collectionItems}
            onLoadMore={loadMore}
          />
        </PageSection>
      )}
      <CollectionFilterModal
        filters={structuredFilters}
        open={isFilterModalOpen}
        onApply={applyStructuredFilters}
        onClear={clearStructuredFilters}
        onClose={() => setIsFilterModalOpen(false)}
      />
    </>
  )
}
