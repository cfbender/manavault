import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Layers, ListFilter, Rows3 } from "lucide-react"
import { useEffect, useState } from "react"
import { PageHeader } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { FullscreenPrintingDialog } from "../../components/fullscreen-printing-dialog"
import { SearchField } from "../../components/search-field"
import { CardGridSkeleton } from "../../components/skeletons"
import { SortDropdown } from "../../components/sort-dropdown"
import { Button } from "../../components/ui/button"
import { Switch } from "../../components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { morphCardFrom } from "../../lib/card-morph"
import {
  buildCollectionFilterQuery,
  cloneCollectionFilters,
  countActiveCollectionFilters,
  decodeCollectionFilters,
  EMPTY_COLLECTION_FILTERS,
  encodeCollectionFilters,
  type CollectionFilterState,
} from "../../lib/collection-filters"
import { usePageTitle } from "../../lib/page-title"
import { pluralize, titleize } from "../../lib/utils"
import { CollectionFilterModal } from "../collection"
import { SetFlipView, type FlipPrinting } from "./set-flip-view"
import { SetGridView } from "./set-grid-view"
import { SetCompletion, SetSectionNav, SetSymbol } from "./set-parts"
import { type SetSection } from "./set-sections"
import { serializeSetSort, SET_SORT_OPTIONS, type SetSort } from "./set-sort"
import { useSetCards } from "./use-set-cards"
import "./sets.css"

export type SetView = "flip" | "grid"

export type SetPageProps = {
  code: string
  filterSearch?: string
  grouped: boolean
  sort: SetSort
  view: SetView
}

// Where each set was left, so coming back from a card page lands on the same card.
const lastPositions = new Map<string, string>()

const VIEW_ITEM_CLASS =
  "flex min-h-10 items-center gap-2 rounded-btn px-3 text-sm font-bold transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=on]:bg-primary data-[state=on]:text-primary-content"

function formatReleased(value?: string | null) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export function SetPage(props: SetPageProps) {
  const routeKey = `${props.code}\0${props.filterSearch ?? ""}\0${serializeSetSort(props.sort) ?? ""}\0${props.grouped}`
  return <SetPageContent key={routeKey} routeKey={routeKey} {...props} />
}

function SetPageContent({
  code,
  filterSearch,
  grouped,
  routeKey,
  sort,
  view,
}: SetPageProps & { routeKey: string }) {
  const navigate = useNavigate({ from: "/cards/sets/$code" })
  const [nameFilter, setNameFilter] = useState("")
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [currentKey, setCurrentKey] = useState(() => lastPositions.get(routeKey) ?? null)
  const [upCloseId, setUpCloseId] = useState<string | null>(null)
  const filters = decodeCollectionFilters(filterSearch)
  const activeFilterCount = countActiveCollectionFilters(filters)
  const { error, items, loading, sections, set, totalPrintings, visible } = useSetCards({
    code,
    grouped,
    nameFilter,
    query: buildCollectionFilterQuery(filters),
    sort,
  })
  usePageTitle(set?.name)
  const found = items.findIndex((item) => item.key === currentKey)
  const index = found >= 0 ? found : 0
  const activeSectionKey = sections[items[index]?.sectionIndex ?? -1]?.key

  useEffect(() => {
    if (currentKey) lastPositions.set(routeKey, currentKey)
  }, [currentKey, routeKey])

  function updateSearch(next: {
    filters?: CollectionFilterState
    grouped?: boolean
    sort?: SetSort
    view?: SetView
  }) {
    void navigate({
      search: (previous) => ({
        ...previous,
        ...(next.filters ? { filters: encodeCollectionFilters(next.filters) } : {}),
        ...(next.sort ? { sort: serializeSetSort(next.sort) } : {}),
        ...(next.view ? { view: next.view === "grid" ? ("grid" as const) : undefined } : {}),
        ...(next.grouped !== undefined
          ? { grouped: next.grouped ? undefined : (false as const) }
          : {}),
      }),
      replace: Boolean(next.view || next.grouped !== undefined),
    })
  }

  function openUpClose(printing: FlipPrinting, element: HTMLElement | null) {
    setCurrentKey(printing.scryfallId)
    morphCardFrom(element, () => setUpCloseId(printing.scryfallId))
  }

  function jumpToSection(section: SetSection<FlipPrinting>) {
    if (view === "grid") {
      document
        .getElementById(`set-section-${section.key}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
    const sectionIndex = sections.indexOf(section)
    const target = items.find((item) => item.sectionIndex === sectionIndex)
    if (target) setCurrentKey(target.key)
  }

  if (!set && !loading) {
    return (
      <>
        <BackToSets />
        <EmptyState
          title={error ? "Could not load this set" : "Set not found"}
          description={
            error
              ? "The catalog did not answer. Try again in a moment."
              : `No set with code “${code.toUpperCase()}” is in the local catalog. It may arrive with the next catalog sync.`
          }
          action={
            <Button asChild variant="outline">
              <Link to="/cards/sets">Browse all sets</Link>
            </Button>
          }
        />
      </>
    )
  }

  const released = formatReleased(set?.releasedAt)
  const upClosePrintings = visible.map((printing) => ({
    ...printing,
    name: printing.card?.name,
    imageUrl: printing.largeImageUrl || printing.imageUrl,
  }))

  return (
    <>
      <BackToSets />
      <PageHeader
        eyebrow={[
          set?.code.toUpperCase() ?? code.toUpperCase(),
          set?.setType ? titleize(set.setType) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        title={set?.name ?? code.toUpperCase()}
        description={
          set
            ? [released ? `Released ${released}` : null, pluralize(set.cardCount, "card")]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        actions={
          set ? (
            <div className="flex items-center gap-4">
              <SetCompletion className="w-40" owned={set.ownedCount} total={set.cardCount} />
              <SetSymbol
                iconUrl={set.iconUrl}
                className="h-16 w-16 text-base-content sm:h-20 sm:w-20"
              />
            </div>
          ) : null
        }
      />

      <div className="control-toolbar mb-4 grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm md:grid-cols-[1fr_auto_auto] xl:grid-cols-[1fr_auto_auto_auto_auto]">
        <SearchField
          aria-label="Filter by card name"
          placeholder="Card name"
          value={nameFilter}
          onValueChange={setNameFilter}
        />
        <SortDropdown
          options={SET_SORT_OPTIONS}
          sort={sort}
          onSortChange={(next) => updateSearch({ sort: next })}
        />
        <Button
          type="button"
          variant="outline"
          className="relative"
          onClick={() => setIsFilterModalOpen(true)}
        >
          <ListFilter className="h-4 w-4" />
          Filter
          {activeFilterCount ? (
            <span className="badge badge-primary badge-sm absolute -right-2 -top-2 min-w-5">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 px-1 text-sm font-bold">
          <Switch
            checked={grouped}
            onCheckedChange={(checked) => updateSearch({ grouped: checked })}
          />
          Group by treatment
        </label>
        <ToggleGroup
          type="single"
          aria-label="View"
          value={view}
          onValueChange={(value) => {
            if (value === "flip" || value === "grid") updateSearch({ view: value })
          }}
          className="flex gap-1 rounded-box bg-base-200 p-1"
        >
          <ToggleGroupItem value="flip" className={VIEW_ITEM_CLASS}>
            <Layers className="h-4 w-4" />
            Flip
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" className={VIEW_ITEM_CLASS}>
            <Rows3 className="h-4 w-4" />
            Grid
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <SetSectionNav
        sections={sections}
        activeKey={view === "flip" ? activeSectionKey : undefined}
        onSelect={jumpToSection}
      />

      {loading ? (
        <CardGridSkeleton count={12} label="Loading set" />
      ) : !visible.length ? (
        <EmptyState
          title="No cards match"
          description={
            totalPrintings
              ? "No card in this set matches the name or filters. Clear them to see the whole set."
              : "This set has no cards in the local catalog yet."
          }
          action={
            nameFilter || activeFilterCount ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNameFilter("")
                  if (activeFilterCount) updateSearch({ filters: EMPTY_COLLECTION_FILTERS })
                }}
              >
                Clear name and filters
              </Button>
            ) : undefined
          }
        />
      ) : view === "flip" ? (
        <SetFlipView
          index={index}
          items={items}
          sections={sections}
          setName={set?.name ?? code.toUpperCase()}
          onIndexChange={(next) => setCurrentKey(items[next]?.key ?? null)}
          onOpen={openUpClose}
        />
      ) : (
        <SetGridView
          sections={sections}
          onOpen={(printing) => {
            setCurrentKey(printing.scryfallId)
            setUpCloseId(printing.scryfallId)
          }}
        />
      )}

      <CollectionFilterModal
        copyFilters={false}
        filters={filters}
        open={isFilterModalOpen}
        onApply={(next) => {
          setIsFilterModalOpen(false)
          updateSearch({ filters: cloneCollectionFilters(next) })
        }}
        onClear={() => updateSearch({ filters: EMPTY_COLLECTION_FILTERS })}
        onClose={() => setIsFilterModalOpen(false)}
      />
      <FullscreenPrintingDialog
        card={{ name: set?.name ?? "" }}
        currentPrintingId={upCloseId}
        printings={upClosePrintings}
        onOpenChange={(open) => !open && setUpCloseId(null)}
        onPrintingChange={(id) => {
          setUpCloseId(id)
          setCurrentKey(id)
        }}
      />
    </>
  )
}

function BackToSets() {
  return (
    <Link
      to="/cards/sets"
      className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-btn px-2 text-sm font-bold text-base-content/70 transition-colors hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <ArrowLeft className="h-4 w-4" />
      All sets
    </Link>
  )
}
