import { Link } from "@tanstack/react-router"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { Boxes, Edit3, MoveUpRight, Plus, Search, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { PageHeader, PageSection } from "../components/app-shell"
import { EmptyState } from "../components/card-image"
import { addToDeckAction, addToListAction, CardTile } from "../components/card-tile"
import { ImageSummaryCard } from "../components/image-summary-card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { graphql } from "../gql"
import { request } from "../lib/graphql"
import { compactNumber, present, titleize } from "../lib/utils"

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

const CollectionItemsPageDocument = graphql(`
  query CollectionItemsPage($filters: CollectionItemFilters, $limit: Int!, $offset: Int!) {
    collectionItems(filters: $filters, limit: $limit, offset: $offset) {
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
        collectorNumber
        imageUrl
        rarity
        card { oracleId name typeLine }
      }
    }
  }
`)

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
    collectorNumber?: string | null
    imageUrl?: string | null
    rarity?: string | null
    card?: { oracleId: string; name: string; typeLine?: string | null } | null
  } | null
}

type CollectionTab = "locations" | "all"

function CollectionGrid({ items }: { items?: readonly (CollectionItem | null)[] | null }) {
  const presentItems = (items || []).filter(present)

  if (!presentItems.length) return <EmptyState title="No collection items found" />

  return (
    <div className="grid justify-center gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(14.25rem,14.25rem))]">
      {presentItems.map(item => (
        <CollectionItemTile key={item.id} item={item} />
      ))}
    </div>
  )
}

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
      setLabel={`${item.printing?.setCode?.toUpperCase() || "?"} #${item.printing?.collectorNumber || "?"}`}
      typeLine={item.printing?.card?.typeLine}
    />
  )
}

export function CollectionPage() {
  const [activeTab, setActiveTab] = useState<CollectionTab>("locations")
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState<{ q?: string }>({})
  const { data, isLoading } = useQuery({
    queryKey: ["collection", filters],
    queryFn: () => request(CollectionDocument, { filters }),
  })
  const allItemsQuery = useInfiniteQuery({
    queryKey: ["collection-items", "all", filters],
    queryFn: ({ pageParam }) =>
      request(CollectionItemsPageDocument, {
        filters,
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
  const hasCollectionFilters = Boolean(filters.q?.trim())
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
    setFilters(q.trim() ? { q: q.trim() } : {})
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
          onClick={() => setActiveTab("locations")}
        />
        <CollectionTabButton
          active={activeTab === "all"}
          count={data?.collectionItemCount || 0}
          label="All"
          onClick={() => setActiveTab("all")}
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
          <form onSubmit={submit} className="control-toolbar grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-[1fr_auto]">
            <Input name="q" value={q} onChange={event => setQ(event.target.value)} placeholder="Filter collection" />
            <Button type="submit" variant="outline">
              <Search className="h-4 w-4" />
              Filter
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
        </div>
      )}
    </>
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
  const { data, isLoading } = useQuery({ queryKey: ["location", id], queryFn: () => request(LocationDocument, { id }) })
  const itemsQuery = useInfiniteQuery({
    queryKey: ["collection-items", "location", id],
    queryFn: ({ pageParam }) =>
      request(CollectionItemsPageDocument, {
        filters: { locationId: id },
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
      {itemsQuery.isLoading ? (
        <EmptyState title="Loading collection..." />
      ) : (
        <PageSection>
          <VirtualizedCollectionGrid
            hasNextPage={itemsQuery.hasNextPage}
            isFetchingNextPage={itemsQuery.isFetchingNextPage}
            items={collectionItems}
            onLoadMore={loadMore}
          />
        </PageSection>
      )}
    </>
  )
}
