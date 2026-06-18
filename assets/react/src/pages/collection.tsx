import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import { useState } from "react"
import { PageHeader } from "../components/app-shell"
import { CardImage, EmptyState } from "../components/card-image"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { graphql } from "../gql"
import { request } from "../lib/graphql"
import { present, titleize } from "../lib/utils"

const CollectionDocument = graphql(`
  query Collection($filters: CollectionItemFilters, $limit: Int!) {
    locations {
      id
      name
      kind
      itemCount
      coverPrinting { imageUrl card { name } }
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
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState<{ q?: string }>({})
  const { data, isLoading } = useQuery({
    queryKey: ["collection", filters],
    queryFn: () => request(CollectionDocument, { filters, limit: 120 }),
  })

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilters(q.trim() ? { q: q.trim() } : {})
  }

  return (
    <>
      <PageHeader
        title="Collection"
        description="Browse stored cards by printing, finish, and location."
        actions={
          <Button asChild>
            <Link to="/collection/new">
              <Plus className="h-4 w-4" />
              Add item
            </Link>
          </Button>
        }
      />

      <form onSubmit={submit} className="control-toolbar mb-5 flex gap-2">
        <Input name="q" value={q} onChange={event => setQ(event.target.value)} placeholder="Filter collection" />
        <Button type="submit" variant="outline">
          <Search className="h-4 w-4" />
          Filter
        </Button>
      </form>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-normal text-base-content/60">Locations</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(data?.locations || []).map(location => (
            <Link key={location.id} to="/collection/locations/$id" params={{ id: location.id }}>
              <Card className="h-full transition-colors hover:bg-base-200">
                <CardHeader>
                  <CardTitle className="truncate">{location.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <Badge>{titleize(location.kind)}</Badge>
                  <span className="text-sm text-base-content/70">{location.itemCount || 0} items</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {isLoading ? <EmptyState title="Loading collection..." /> : <CollectionGrid items={data?.collectionItems} />}
    </>
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
