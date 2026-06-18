import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Boxes, Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { PageHeader, PageSection } from "../components/app-shell"
import { CardImage, EmptyState } from "../components/card-image"
import { ImageSummaryCard } from "../components/image-summary-card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { graphql } from "../gql"
import { request } from "../lib/graphql"
import { compactNumber, present, titleize } from "../lib/utils"

const CollectionDocument = graphql(`
  query Collection($filters: CollectionItemFilters, $limit: Int!) {
    locations {
      id
      name
      kind
      itemCount
      coverPrinting { artCropUrl }
    }
    collectionItems(filters: $filters, limit: $limit) {
      id
      quantity
      condition
      language
      finish
      location { id name }
      printing {
        scryfallId
        setCode
        collectorNumber
        imageUrl
        card { oracleId name typeLine }
      }
    }
  }
`)

const LocationDocument = graphql(`
  query Location($id: ID!) {
    location(id: $id) {
      id
      name
      kind
      description
      collectionItems {
        id
        quantity
        condition
        language
        finish
        printing {
          scryfallId
          setCode
          collectorNumber
          imageUrl
          card { oracleId name typeLine }
        }
      }
    }
  }
`)

type CollectionItem = {
  id: string
  quantity: number
  finish: string
  location?: { id: string; name: string } | null
  printing?: {
    setCode?: string | null
    collectorNumber?: string | null
    imageUrl?: string | null
    card?: { oracleId: string; name: string; typeLine?: string | null } | null
  } | null
}

type CollectionTab = "locations" | "all"

function CollectionGrid({ items }: { items?: readonly (CollectionItem | null)[] | null }) {
  const presentItems = (items || []).filter(present)

  if (!presentItems.length) return <EmptyState title="No collection items found" />

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {presentItems.map(item => (
        <Card key={item.id} className="overflow-hidden">
          <div className="grid grid-cols-[5rem_1fr] gap-3 p-3">
            <CardImage printing={item.printing} className="w-20" />
            <div className="min-w-0 space-y-2">
              <div>
                <Link to="/cards/$id" params={{ id: item.printing?.card?.oracleId || "" }} className="font-semibold hover:text-primary">
                  {item.printing?.card?.name || "Unknown card"}
                </Link>
                <p className="line-clamp-2 text-sm text-base-content/70">{item.printing?.card?.typeLine}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="primary">x{item.quantity}</Badge>
                <Badge>{titleize(item.finish)}</Badge>
                <Badge>{item.printing?.setCode?.toUpperCase()} #{item.printing?.collectorNumber}</Badge>
              </div>
              {item.location ? <div className="text-xs text-base-content/60">{item.location.name}</div> : null}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function CollectionPage() {
  const [activeTab, setActiveTab] = useState<CollectionTab>("locations")
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState<{ q?: string }>({})
  const { data, isLoading } = useQuery({
    queryKey: ["collection", filters],
    queryFn: () => request(CollectionDocument, { filters, limit: 120 }),
  })
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
          count={data?.collectionItems?.filter(present).length || 0}
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

          <PageSection count={`${data?.collectionItems?.filter(present).length || 0} shown`}>
            {isLoading ? <EmptyState title="Loading collection..." /> : <CollectionGrid items={data?.collectionItems} />}
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
  const location = data?.location

  if (isLoading) return <EmptyState title="Loading location..." />
  if (!location) return <EmptyState title="Location not found" />

  return (
    <>
      <PageHeader
        title={location.name}
        description={location.description || titleize(location.kind)}
        actions={
          <Button asChild variant="outline">
            <Link to="/collection">Back to collection</Link>
          </Button>
        }
      />
      <CollectionGrid items={location.collectionItems} />
    </>
  )
}
