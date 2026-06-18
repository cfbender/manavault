import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { PageHeader, PageSection } from "../components/app-shell"
import { CardImage, EmptyState } from "../components/card-image"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { graphql } from "../gql"
import { request } from "../lib/graphql"
import { present, titleize } from "../lib/utils"

const DecksDocument = graphql(`
  query Decks {
    decks {
      id
      name
      format
      status
      cardCount
      uniqueCardCount
      deckCards {
        preferredPrinting { imageUrl }
        card { printings { imageUrl } }
      }
    }
  }
`)

const DeckDocument = graphql(`
  query Deck($id: ID!) {
    deck(id: $id) {
      id
      name
      format
      status
      cardCount
      uniqueCardCount
      deckCards {
        id
        quantity
        zone
        finish
        card { oracleId name typeLine printings { imageUrl } }
        preferredPrinting { imageUrl setCode collectorNumber }
      }
    }
  }
`)

export function DecksPage() {
  const { data, isLoading } = useQuery({ queryKey: ["decks"], queryFn: () => request(DecksDocument) })

  return (
    <>
      <PageHeader
        title="Decks"
        eyebrow="ManaVault Decks"
        description="Build lists by card identity, then choose exact printings when that matters."
        actions={<Button><Plus className="h-4 w-4" />New deck</Button>}
      />
      {isLoading ? (
        <EmptyState title="Loading decks..." />
      ) : data?.decks?.length ? (
        <PageSection title="Your decks" count={`${data.decks.length} total`}>
          <div className="space-y-4">
            {data.decks.map(deck => {
              const cover = deck.deckCards?.find(card => card?.preferredPrinting?.imageUrl || card?.card?.printings?.[0]?.imageUrl)
              const imageUrl = cover?.preferredPrinting?.imageUrl || cover?.card?.printings?.[0]?.imageUrl

              return (
                <Link key={deck.id} to="/decks/$id" params={{ id: deck.id }}>
                  <Card className="group relative min-h-44 overflow-hidden transition-all hover:border-primary/40 hover:shadow-xl">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover opacity-45 blur-[1px] transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-r from-base-100 via-base-100/90 to-base-100/45" />
                    <div className="relative flex min-h-44 flex-col justify-between gap-6 p-6 sm:flex-row sm:items-end">
                      <div className="min-w-0">
                        <h2 className="truncate text-3xl font-black tracking-normal">{deck.name}</h2>
                        <p className="mt-3 text-lg text-base-content/70">
                          {titleize(deck.format)} · {titleize(deck.status)} · {deck.cardCount || 0} cards
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Badge tone="primary">{deck.uniqueCardCount || 0} unique</Badge>
                          <Badge>{deck.cardCount || 0} total</Badge>
                        </div>
                      </div>
                      <span className="btn btn-primary btn-sm self-start sm:self-end">Open</span>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        </PageSection>
      ) : (
        <EmptyState title="No decks yet" />
      )}
    </>
  )
}

export function DeckDetailPage({ id }: { id: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["deck", id], queryFn: () => request(DeckDocument, { id }) })
  const deck = data?.deck

  if (isLoading) return <EmptyState title="Loading deck..." />
  if (!deck) return <EmptyState title="Deck not found" />

  return (
    <>
      <PageHeader
        title={deck.name}
        description={`${titleize(deck.format)} · ${deck.cardCount || 0} cards · ${deck.uniqueCardCount || 0} unique`}
        actions={<Button asChild variant="outline"><Link to="/decks">Back to decks</Link></Button>}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(deck.deckCards || []).filter(present).map(deckCard => {
          const printing = deckCard.preferredPrinting || deckCard.card?.printings?.[0]
          return (
            <Card key={deckCard.id}>
              <div className="grid grid-cols-[5rem_1fr] gap-3 p-3">
                <CardImage printing={{ ...printing, card: deckCard.card }} className="w-20" />
                <div className="min-w-0 space-y-2">
                  <Link to="/cards/$id" params={{ id: deckCard.card?.oracleId || "" }} className="font-semibold hover:text-primary">
                    {deckCard.card?.name}
                  </Link>
                  <p className="line-clamp-2 text-sm text-base-content/70">{deckCard.card?.typeLine}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="primary">x{deckCard.quantity}</Badge>
                    <Badge>{titleize(deckCard.zone)}</Badge>
                    <Badge>{titleize(deckCard.finish)}</Badge>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}
