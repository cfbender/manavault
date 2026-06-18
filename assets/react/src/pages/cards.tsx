import { Link, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent } from "react"
import { PageHeader } from "../components/app-shell"
import { CardImage, EmptyState } from "../components/card-image"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { graphql } from "../gql"
import { request } from "../lib/graphql"
import { present, titleize } from "../lib/utils"

const CardsDocument = graphql(`
  query Cards($q: String!, $limit: Int!) {
    cards(q: $q, limit: $limit) {
      oracleId
      name
      typeLine
      manaCost
      printings {
        scryfallId
        setCode
        collectorNumber
        imageUrl
      }
    }
  }
`)

const CardDocument = graphql(`
  query Card($id: ID!) {
    card(id: $id) {
      oracleId
      name
      typeLine
      manaCost
      oracleText
      colorIdentity
      printings {
        scryfallId
        setCode
        setName
        collectorNumber
        lang
        rarity
        finishes
        imageUrl
        releasedAt
        prices
      }
    }
  }
`)

const CardNameSuggestionsDocument = graphql(`
  query CardNameSuggestions($q: String!, $limit: Int!) {
    cardNameSuggestions(q: $q, limit: $limit)
  }
`)

export function CardsPage({ query }: { query: string }) {
  const [q, setQ] = useState(query)
  const navigate = useNavigate({ from: "/cards/" })
  const { data, isFetching } = useQuery({
    queryKey: ["cards", query],
    queryFn: () => request(CardsDocument, { q: query, limit: 36 }),
    enabled: Boolean(query.trim()),
  })

  useEffect(() => {
    setQ(query)
  }, [query])

  function submitSearch(value = q) {
    const term = value.trim()
    navigate({ to: "/cards", search: { q: term || undefined } })
  }

  return (
    <>
      <PageHeader eyebrow="ManaVault Catalog" title="Card search" description="Search the local Scryfall catalog and add exact printings to your collection." />
      <CardSearchForm q={q} setQ={setQ} onSearch={submitSearch} />

      {!query ? (
        <EmptyState title="Search for a card" description="Results are pulled from the synced local catalog." />
      ) : data?.cards?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.cards.map(card => {
            const printing = card.printings?.[0]
            return (
              <Link key={card.oracleId} to="/cards/$id" params={{ id: card.oracleId }} search={{ q: query }}>
                <Card className="h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-base-100 hover:shadow-lg">
                  <div className="grid grid-cols-[5rem_1fr] gap-3 p-3">
                    <CardImage printing={{ ...printing, card }} className="w-20" />
                    <div className="min-w-0 space-y-2">
                      <div>
                        <h2 className="truncate font-semibold">{card.name}</h2>
                        <p className="line-clamp-2 text-sm text-base-content/70">{card.typeLine}</p>
                      </div>
                      {printing ? <Badge>{printing.setCode?.toUpperCase()} #{printing.collectorNumber}</Badge> : null}
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        <EmptyState title={isFetching ? "Searching..." : "No cards found"} />
      )}
    </>
  )
}

function CardSearchForm({
  q,
  setQ,
  onSearch,
}: {
  q: string
  setQ: (value: string) => void
  onSearch: (value?: string) => void
}) {
  const rootRef = useRef<HTMLFormElement>(null)
  const [debouncedQ, setDebouncedQ] = useState(q)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const suggestionTerm = debouncedQ.trim()
  const { data } = useQuery({
    queryKey: ["card-name-suggestions", suggestionTerm],
    queryFn: () => request(CardNameSuggestionsDocument, { q: suggestionTerm, limit: 5 }),
    enabled: suggestionTerm.length > 1,
    staleTime: 60_000,
  })
  const suggestions = data?.cardNameSuggestions ?? []

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQ(q), 200)
    return () => window.clearTimeout(timeout)
  }, [q])

  useEffect(() => {
    setActiveIndex(-1)
  }, [q])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch(q)
    setIsOpen(false)
  }

  function selectSuggestion(name: string) {
    setQ(name)
    setIsOpen(false)
    onSearch(name)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) {
      if (event.key === "Escape") setIsOpen(false)
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex(index => (index + 1) % suggestions.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex(index => (index <= 0 ? suggestions.length - 1 : index - 1))
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault()
      selectSuggestion(suggestions[activeIndex])
    } else if (event.key === "Escape") {
      event.preventDefault()
      setIsOpen(false)
    }
  }

  return (
    <form
      ref={rootRef}
      onSubmit={handleSubmit}
      className="control-toolbar mb-7 grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-[1fr_auto]"
    >
      <div className="relative">
        <Input
          name="q"
          value={q}
          onChange={event => {
            setQ(event.target.value)
            setIsOpen(event.target.value.trim().length > 1)
          }}
          onFocus={() => setIsOpen(q.trim().length > 1)}
          onKeyDown={handleKeyDown}
          placeholder="Card name"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && suggestions.length > 0}
        />
        {isOpen && suggestions.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl">
            {suggestions.map((name, index) => (
              <button
                key={name}
                type="button"
                className={[
                  "block w-full px-3 py-2 text-left text-sm transition-colors",
                  index === activeIndex ? "bg-primary text-primary-content" : "hover:bg-base-200",
                ].join(" ")}
                onMouseDown={event => event.preventDefault()}
                onClick={() => selectSuggestion(name)}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <Button type="submit">
        <Search className="h-4 w-4" />
        Search
      </Button>
    </form>
  )
}

export function CardDetailPage({ id, query }: { id: string; query: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["card", id], queryFn: () => request(CardDocument, { id }) })
  const card = data?.card
  const printings = card?.printings || []
  const primary = printings[0]

  if (isLoading) return <EmptyState title="Loading card..." />
  if (!card) return <EmptyState title="Card not found" />

  return (
    <>
      <PageHeader
        title={card.name}
        description={card.typeLine || undefined}
        actions={
          <Button asChild variant="outline">
            <Link to="/cards" search={{ q: query || undefined }}>Back to search</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <CardImage printing={{ ...primary, card }} className="w-full max-w-72" />
        <div className="space-y-5">
          <section className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
            {card.manaCost ? <div className="font-mono text-sm">{card.manaCost}</div> : null}
            <p className="mt-3 whitespace-pre-line text-sm leading-6">{card.oracleText}</p>
          </section>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {printings.filter(present).map(printing => (
              <section key={printing.scryfallId} className="space-y-3 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{printing.setName || printing.setCode?.toUpperCase()}</div>
                    <div className="text-sm text-base-content/70">
                      {printing.setCode?.toUpperCase()} #{printing.collectorNumber}
                    </div>
                  </div>
                  <Badge>{titleize(printing.rarity)}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(printing.finishes || []).map(finish => <Badge key={finish || "unknown"}>{titleize(finish)}</Badge>)}
                </div>
                <Button asChild size="sm">
                  <Link to="/collection/new" search={{ printing_id: printing.scryfallId }}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Link>
                </Button>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
