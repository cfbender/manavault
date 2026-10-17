import { useQuery } from "@apollo/client/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { Search } from "lucide-react"
import type { CSSProperties } from "react"
import { PageHeader } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { SearchField } from "../../components/search-field"
import { SortDropdown } from "../../components/sort-dropdown"
import { Button } from "../../components/ui/button"
import { Switch } from "../../components/ui/switch"
import { cn, pluralize } from "../../lib/utils"
import { CardSetsDocument, type CardSetSummary } from "./data"
import {
  filterSets,
  serializeSetCategories,
  serializeSetListSort,
  SET_CATEGORIES,
  SET_LIST_SORT_OPTIONS,
  setCategory,
  shelveSets,
  type SetCategory,
  type SetListSort,
} from "./set-list"
import { SetCompletion, SetSymbol } from "./set-parts"
import "./sets.css"

export type SetsPageProps = {
  categories: SetCategory[]
  ownedOnly: boolean
  query: string
  sort: SetListSort
}

function formatReleased(value?: string | null) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short" })
}

// The priciest card stands in the middle of the fan, the next two to its sides.
const FAN_SLOTS = [0, -1, 1]

function SetTile({ set }: { set: CardSetSummary }) {
  const previews = set.previewImageUrls.slice(0, 3)
  const released = formatReleased(set.releasedAt)
  return (
    <Link
      to="/cards/sets/$code"
      params={{ code: set.code }}
      className="set-tile group flex flex-col gap-3 rounded-box p-3 transition-colors hover:bg-base-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="set-tile__fan w-full" aria-hidden="true">
        {(previews.length ? previews : [null, null, null]).map((url, index) => {
          const slot = FAN_SLOTS[index] ?? 0
          const style = {
            "--slot": slot,
            "--lift": slot === 0 ? 1.4 : 1,
            zIndex: 3 - Math.abs(slot),
          } as CSSProperties
          return url ? (
            <img
              key={index}
              src={url}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="set-tile__card"
              style={style}
            />
          ) : (
            <span key={index} className="set-tile__card set-tile__card--blank" style={style} />
          )
        })}
      </div>
      <div className="flex min-w-0 items-start gap-2.5">
        <SetSymbol iconUrl={set.iconUrl} className="mt-0.5 h-6 w-6 text-base-content" />
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-black leading-snug">{set.name}</h3>
          <p className="mt-0.5 text-xs text-base-content/60">
            <span className="font-mono font-bold">{set.code.toUpperCase()}</span>
            {released ? ` · ${released}` : null}
            {` · ${pluralize(set.cardCount, "card")}`}
          </p>
        </div>
      </div>
      {set.ownedCount ? <SetCompletion owned={set.ownedCount} total={set.cardCount} /> : null}
    </Link>
  )
}

function SetsSkeleton() {
  return (
    <div
      role="status"
      aria-busy
      className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4"
    >
      <span className="sr-only">Loading sets</span>
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="space-y-3 p-3">
          <div className="skeleton mx-auto h-36 w-28 rounded-lg" />
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function SetsPage({ categories, ownedOnly, query, sort }: SetsPageProps) {
  const navigate = useNavigate({ from: "/cards/sets/" })
  const { data, loading } = useQuery(CardSetsDocument, { fetchPolicy: "cache-and-network" })
  const allSets = data?.cardSets ?? []
  const sets = filterSets(allSets, { query, categories, ownedOnly, sort })
  const shelves = shelveSets(sets, sort)
  const counts = new Map<SetCategory, number>()
  for (const set of allSets) {
    const category = setCategory(set.setType)
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  function update(next: Partial<SetsPageProps>) {
    void navigate({
      search: (previous) => ({
        ...previous,
        ...("query" in next ? { q: next.query || undefined } : {}),
        ...(next.categories ? { types: serializeSetCategories(next.categories) } : {}),
        ...(next.sort ? { sort: serializeSetListSort(next.sort) } : {}),
        ...("ownedOnly" in next ? { owned: next.ownedOnly || undefined } : {}),
      }),
      replace: "query" in next,
    })
  }

  function toggleCategory(category: SetCategory) {
    update({
      categories: categories.includes(category)
        ? categories.filter((key) => key !== category)
        : [...categories, category],
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="ManaVault Catalog"
        title="Sets"
        description="Every set in the local Scryfall catalog. Open one to flip through its cards, section by section."
        actions={
          <Button asChild variant="outline">
            <Link to="/cards">
              <Search className="h-4 w-4" />
              Card search
            </Link>
          </Button>
        }
      />

      <div className="control-toolbar mb-4 grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-[1fr_auto_auto]">
        <SearchField
          aria-label="Find a set by name or code"
          placeholder="Set name or code"
          value={query}
          onValueChange={(value) => update({ query: value })}
        />
        <SortDropdown
          options={SET_LIST_SORT_OPTIONS}
          sort={sort}
          onSortChange={(next) => update({ sort: next })}
        />
        <label className="flex min-h-10 cursor-pointer items-center gap-2 px-1 text-sm font-bold">
          <Switch
            checked={ownedOnly}
            onCheckedChange={(checked) => update({ ownedOnly: checked })}
          />
          Sets I own cards from
        </label>
      </div>

      <div role="group" aria-label="Set types" className="mb-6 flex flex-wrap gap-2">
        {SET_CATEGORIES.map(({ key, label }) => {
          const active = categories.includes(key)
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              disabled={Boolean(query.trim())}
              onClick={() => toggleCategory(key)}
              className={cn(
                "flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-base-300 bg-base-100 text-base-content/70 hover:border-base-content/30",
              )}
            >
              {label}
              <span className="font-mono text-xs opacity-60">{counts.get(key) ?? 0}</span>
            </button>
          )
        })}
      </div>

      {loading && !data ? (
        <SetsSkeleton />
      ) : !sets.length ? (
        <EmptyState
          title={allSets.length ? "No sets match" : "No sets yet"}
          description={
            allSets.length
              ? "Try another name or code, or turn on more set types."
              : "Sets appear once the Scryfall catalog has synced."
          }
        />
      ) : (
        <div className="space-y-8">
          {shelves.map((shelf) => (
            <section key={shelf.label ?? "all"} aria-label={shelf.label ?? "Sets"}>
              {shelf.label ? (
                <h2 className="mb-2 flex items-baseline gap-3 border-b border-base-300 pb-2 text-xl font-black">
                  {shelf.label}
                  <span className="font-mono text-sm font-bold text-base-content/55">
                    {shelf.sets.length}
                  </span>
                </h2>
              ) : null}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-3 gap-y-5">
                {shelf.sets.map((set) => (
                  <SetTile key={set.code} set={set} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
