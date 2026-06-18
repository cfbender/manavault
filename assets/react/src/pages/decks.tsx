import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { PageHeader } from "../components/app-shell"
import { CardImage, EmptyState } from "../components/card-image"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
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
      <PageHeader title="Decks" description="Track decklists and collection coverage." actions={<Button><Plus className="h-4 w-4" />New deck</Button>} />
      {isLoading ? (
        <EmptyState title="Loading decks..." />
      ) : data?.decks?.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.decks.map(deck => (
            <Link key={deck.id} to="/decks/$id" params={{ id: deck.id }}>
              <Card className="h-full transition-colors hover:bg-base-200">
                <CardHeader>
                  <CardTitle>{deck.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Badge tone="primary">{titleize(deck.format)}</Badge>
                  <Badge>{titleize(deck.status)}</Badge>
                  <Badge>{deck.cardCount || 0} cards</Badge>
                  <Badge>{deck.uniqueCardCount || 0} unique</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
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
